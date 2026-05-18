export const config = { runtime: 'edge' };
import { kvGet, kvSet, kvSmembers, getGenerationsUsed, htmlEscape } from '../_lib/auth.js';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';

// Day-14 nurture: free users who have used 3–5 generations but haven't upgraded.
// These are the warmest leads — they've seen value but haven't converted yet.
// Runs daily at 11am, cursor-based (60 users per run).

export default async function handler(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return new Response(JSON.stringify({ error: 'No RESEND_API_KEY' }), { status: 500 });

  const allUsers = (await kvSmembers('all_users')) || [];
  const total = allUsers.length;

  const BATCH_SIZE = 60;
  const rawCursor = await kvGet('nurture_cursor') || 0;
  const cursor = typeof rawCursor === 'number' ? rawCursor : 0;
  const start = cursor % Math.max(total, 1);
  const batch = allUsers.slice(start, start + BATCH_SIZE);
  const nextCursor = (start + BATCH_SIZE >= total) ? 0 : start + BATCH_SIZE;
  await kvSet('nurture_cursor', nextCursor, 86400 * 7);

  const now = Date.now();
  const DAY = 86400000;

  let sent = 0;
  let skipped = 0;

  for (const email of batch) {
    const optedOut = await kvGet(`optout:${email}`);
    if (optedOut) { skipped++; continue; }

    const alreadySent = await kvGet(`nurture14:${email}`);
    if (alreadySent) { skipped++; continue; }

    const user = await kvGet(`user:${email}`);
    if (!user || !user.createdAt) { skipped++; continue; }

    // Only free users who haven't upgraded
    if (user.plan && user.plan !== 'free') {
      await kvSet(`nurture14:${email}`, true, 86400 * 90);
      skipped++;
      continue;
    }

    const age = now - new Date(user.createdAt).getTime();
    // Target window: 12–20 days after signup
    if (age < 12 * DAY || age > 20 * DAY) { skipped++; continue; }

    // Must have used at least 3 generations (proven interest)
    const used = await getGenerationsUsed(email);
    const generationsUsed = used !== null ? used : (user.generationsUsed || 0);
    if (generationsUsed < 3) { skipped++; continue; }

    const firstNameRaw = (user.name || '').replace(/[\r\n]/g, ' ').split(' ')[0] || '';
    const firstName = htmlEscape(firstNameRaw || 'là');
    const remaining = Math.max(0, 5 - generationsUsed);

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Emploia <noreply@emploia.fr>',
          to: [email],
          subject: remaining > 0
            ? `${firstNameRaw ? firstNameRaw + ', i' : 'I'}l vous reste ${remaining} génération${remaining > 1 ? 's' : ''} gratuite${remaining > 1 ? 's' : ''} 🎁`
            : `${firstNameRaw ? firstNameRaw + ', p' : 'P'}assez Pro — candidatez sans limite 🚀`,
          html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif">
<div style="max-width:520px;margin:40px auto;padding:0 20px">
  <div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px">
      <div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px">Emploia</div>
    </div>
    <div style="padding:32px">
      <h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 10px">Vous avez déjà généré ${generationsUsed} document${generationsUsed > 1 ? 's' : ''} avec Emploia 🎯</h1>
      <p style="color:#475569;line-height:1.7;margin:0 0 20px;font-size:14px">Vous savez déjà que l'IA fait la différence dans votre recherche. Les candidats qui utilisent Emploia Pro obtiennent <strong style="color:#0f172a">2× plus d'entretiens</strong> en moyenne.</p>

      <div style="background:#f8fafc;border-radius:14px;border:1px solid #e2e8f0;padding:20px;margin-bottom:28px">
        <p style="font-size:13px;font-weight:800;color:#0f172a;margin:0 0 14px">Ce que vous débloquez avec Pro :</p>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;align-items:center;gap:12px"><span style="font-size:18px">♾️</span><div><strong style="color:#0f172a;font-size:13px">CV & lettres illimités</strong><div style="font-size:12px;color:#64748b">Postulez autant que vous voulez, sans jamais être bloqué</div></div></div>
          <div style="display:flex;align-items:center;gap:12px"><span style="font-size:18px">🎤</span><div><strong style="color:#0f172a;font-size:13px">Simulateur d'entretien illimité</strong><div style="font-size:12px;color:#64748b">Entraînez-vous pour chaque poste, avec feedback IA immédiat</div></div></div>
          <div style="display:flex;align-items:center;gap:12px"><span style="font-size:18px">💼</span><div><strong style="color:#0f172a;font-size:13px">Résumé LinkedIn + score ATS</strong><div style="font-size:12px;color:#64748b">Optimisez tout votre profil, pas seulement le CV</div></div></div>
          <div style="display:flex;align-items:center;gap:12px"><span style="font-size:18px">🔔</span><div><strong style="color:#0f172a;font-size:13px">50 alertes emploi / jour</strong><div style="font-size:12px;color:#64748b">Ne ratez plus une offre qui vous correspond</div></div></div>
        </div>
      </div>

      <div style="text-align:center;background:linear-gradient(135deg,rgba(99,102,241,.06),rgba(59,130,246,.06));border:1px solid rgba(99,102,241,.2);border-radius:14px;padding:20px;margin-bottom:24px">
        <div style="font-size:32px;font-weight:900;color:#0f172a;letter-spacing:-1px">9€<span style="font-size:16px;font-weight:600;color:#64748b">/mois</span></div>
        <div style="font-size:13px;color:#64748b;margin-top:4px">Soit moins qu'un repas — pour décrocher votre prochain CDI</div>
        <div style="margin-top:8px;font-size:12px;color:#6366f1;font-weight:700">✅ 7 jours d'essai gratuit · Annulation en 1 clic</div>
      </div>

      <a href="${BASE_URL}/#pricing" style="display:block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none;text-align:center">Démarrer l'essai gratuit 7 jours →</a>
      <p style="font-size:12px;color:#94a3b8;margin:10px 0 0;text-align:center">0€ aujourd'hui · Sans engagement · Résiliable à tout moment</p>
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">
    © ${new Date().getFullYear()} Emploia ·
    <a href="${BASE_URL}" style="color:#94a3b8">emploia.fr</a> ·
    <a href="${BASE_URL}/api/newsletter?unsubscribe=${encodeURIComponent(email)}" style="color:#94a3b8">Se désabonner</a>
  </p>
</div>
</body></html>`,
        }),
      });

      await kvSet(`nurture14:${email}`, true, 86400 * 90);
      sent++;
    } catch { /* continue */ }
  }

  return new Response(JSON.stringify({ ok: true, sent, skipped, processed: batch.length, totalUsers: total, nextCursor }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
