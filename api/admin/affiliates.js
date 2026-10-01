export const config = { runtime: 'nodejs' };

import { kvSmembers, kvMget, kvSet } from '../_lib/auth.js';

// Creator / influencer programme, settled by hand.
//
// A creator gets a Stripe promotion code worth 10 € off the Pack Campagne
// (59 € → 49 €). The code is stamped into the checkout session metadata by
// api/stripe-checkout.js and counted by api/stripe-webhook.js on the
// checkout.session.completed event.
//
// Commission is a flat amount per completed sale rather than a percentage:
// a micro-creator can state "je touche 12 € par vente" in a video without a
// calculator, and a fixed figure cannot drift when a discount is stacked.
//
// It is derived here at read time from the sale counter, never written into
// the ledger, so adjusting the rate re-prices what is *owed* without
// rewriting what already *happened*.
const COMMISSION_PER_SALE = 12;
const LIST_PRICE = 59;
const CODE_DISCOUNT = 10;
const CODE_RE = /^[A-Z0-9]{3,20}$/;

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers['x-admin-secret'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    // POST records a payout: once a creator is paid, their paid counter is
    // raised to match the sales already settled, so the balance owed returns
    // to zero without touching the sales history.
    if (req.method === 'POST') {
      const code = String(req.body?.code || '').trim().toUpperCase();
      const paidSales = Number(req.body?.paidSales);
      if (!CODE_RE.test(code)) return res.status(400).json({ error: 'Code invalide' });
      if (!Number.isInteger(paidSales) || paidSales < 0) {
        return res.status(400).json({ error: 'paidSales doit être un entier positif' });
      }
      await kvSet(`affiliate:${code}:paid`, paidSales);
      return res.status(200).json({ ok: true, code, paidSales });
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });

    const terms = { listPrice: LIST_PRICE, codeDiscount: CODE_DISCOUNT, commissionPerSale: COMMISSION_PER_SALE };

    const codes = (await kvSmembers('affiliates')).filter((c) => CODE_RE.test(c));
    if (!codes.length) {
      return res.status(200).json({
        terms,
        affiliates: [],
        totals: { sales: 0, grossRevenue: 0, commissionOwed: 0, netRevenue: 0 },
      });
    }

    // One round trip for the sales counters, one for the payout counters.
    const [salesVals, paidVals] = await Promise.all([
      kvMget(...codes.map((c) => `affiliate:${c}:sales`)),
      kvMget(...codes.map((c) => `affiliate:${c}:paid`)),
    ]);

    const affiliates = codes
      .map((code, i) => {
        const sales = Number(salesVals[i]) || 0;
        const paidSales = Number(paidVals[i]) || 0;
        // A payout counter ahead of the sales counter would otherwise produce
        // a negative balance; clamp so an over-recorded payout reads as zero
        // owed rather than as the creator owing EmploiA money.
        const unpaidSales = Math.max(0, sales - paidSales);
        return {
          code,
          sales,
          paidSales,
          unpaidSales,
          grossRevenue: sales * (LIST_PRICE - CODE_DISCOUNT),
          commissionOwed: unpaidSales * COMMISSION_PER_SALE,
        };
      })
      .sort((a, b) => b.sales - a.sales);

    const totals = affiliates.reduce(
      (acc, a) => ({
        sales: acc.sales + a.sales,
        grossRevenue: acc.grossRevenue + a.grossRevenue,
        commissionOwed: acc.commissionOwed + a.commissionOwed,
      }),
      { sales: 0, grossRevenue: 0, commissionOwed: 0 },
    );
    // Net of the commission earned across every sale, paid out or not — what
    // the channel really leaves on the table, not just the open balance.
    totals.netRevenue = totals.grossRevenue - totals.sales * COMMISSION_PER_SALE;

    return res.status(200).json({ terms, affiliates, totals });
  } catch (err) {
    console.error('Affiliate stats error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
