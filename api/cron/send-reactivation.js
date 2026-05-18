export const config = { runtime: 'edge' };
import { kvGet, kvSet, kvSmembers, getGenerationsUsed } from '../_lib/auth.js';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';

// Day-30+ reactivation: free users who signed up 28-60 days ago but haven't used
// the product in the last 21 days. Goal: remind them the tool exists and has improved.
// Runs daily at 12pm, cursor-based (50 users per run).

export default async function handler(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return new Response(JSON.stringify({ error: 'No RESEND_API_KEY' }), { status: 500 });

  const allUsers = (await kvSmembers('all_users')) || [];
  const total = allUsers.length;

  const BATCH_SIZE = 50;
  const rawCursor = await kvGet('reactiv_cursor') || 0;
  const cursor = typeof rawCursor === 'number' ? rawCursor : 0;
  const start = cursor % Math.max(total, 1);
  const batch = allUsers.slice(start, start + BATCH_SIZE);
  const nextCursor = (start + BATCH_SIZE >= total) ? 0 : start + BATCH_SIZE;
  await kvSet('reactiv_cursor', nextCursor, 86400 * 7);

  const now = Date.now();
  const DAY = 86400000;

  let sent = 0;
  let skipped = 0;

  for (const email of batch) {
    const optedOut = await kvGet(`optout:${email}`);
    if (optedOut) { skipped++; continue; }

    const alreadySent = await kvGet(`reactiv:${email}`);
    if (alreadySent) { skipped++; continue; }

    const user = await kvGet(`user:${email}`);
    if (!user || !user.createdAt) { skipped++; continue; }

    if (user.plan && user.plan !== 'free') {
      await kvSet(`reactiv:${email}`, true, 86400 * 90);
      skipped++;
      continue;
    }

    const age = now - new Date(user.createdAt).getTime();
    if (age < 28 * DAY || age > 60 * DAY) { skipped++; continue; }

    const used = await getGenerationsUsed(email);
    const generationsUsed = used !== null ? used : (user.generationsUsed || 0);

    // Skip if they've been very active (they don't need reactivation)
    if (generationsUsed >= 5) {
      await kvSet(`reactiv:${email}`, true, 86400 * 90);
      skipped++;
      continue;
    }

    const firstNameRaw = (user.name || '').replace(/[\r\n]/g, ' ').split(' ')[0] || '';
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
            ? `${firstNameRaw ? firstNameRaw + ', i' : 'I'}l vous reste encore ${remaining} CV gratuit${remaining > 1 ? 's' : ''} sur Emploia 🎯`
            : `${firstNameRaw ? firstNameRaw + ', v' : 'V'}otre marché de l'emploi a évolué — revenez sur Emploia`,
          html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif">
<div style="max-width:520px;margin:40px auto;padding:0 20px">
  <div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px">
      <div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px">Emploia</div>
    </div>
    <div style="padding:32px">
      <h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 12px">On a amélioré Emploia depuis votre dernière visite 🚀</h1>
      <p style="color:#475569;line-height:1.7;margin:0 0 20px;font-size:14px">Le marché évolue vite. Les candidats qui utilisent Emploia régulièrement décrochent <strong style="color:#0f172a">2× plus d'entretiens</strong> — voici ce qu'il y a de nouveau pour vous :</p>

      <div style="background:#f8fafc;border-radius:14px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px">
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;align-items:flex-start;gap:12px">
            <span style="font-size:20px;flex-shrink:0">🎯</span>
            <div><strong style="color:#0f172a;font-size:13px">Score ATS amélioré</strong><div style="font-size:12px;color:#64748b;margin-top:2px">Analyse plus précise des mots-clés recherchés par les recruteurs</div></div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:12px">
            <span style="font-size:20px;flex-shrink:0">🎤</span>
            <div><strong style="color:#0f172a;font-size:13px">Coaching entretien IA</strong><div style="font-size:12px;color:#64748b;margin-top:2px">Simulez un entretien pour chaque poste, avec feedback instantané</div></div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:12px">
            <span style="font-size:20px;flex-shrink:0">💼</span>
            <div><strong style="color:#0f172a;font-size:13px">Optimisation LinkedIn</strong><div style="font-size:12px;color:#64748b;margin-top:2px">Résumé "À propos" + titre optimisé pour que les recruteurs vous trouvent</div></div>
          </div>
          ${remaining > 0 ? `<div style="display:flex;align-items:flex-start;gap:12px">
            <span style="font-size:20px;flex-shrink:0">🎁</span>
            <div><strong style="color:#0f172a;font-size:13px">${remaining} génération${remaining > 1 ? 's' : ''} gratuite${remaining > 1 ? 's' : ''} vous attend${remaining > 1 ? 'ent' : ''}</strong><div style="font-size:12px;color:#64748b;margin-top:2px">Vous pouvez encore créer ${remaining} document${remaining > 1 ? 's' : ''} ATS gratuitement</div></div>
          </div>` : ''}
        </div>
      </div>

      <a href="${BASE_URL}/app" style="display:block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none;text-align:center">Reprendre ma recherche d'emploi →</a>
      <p style="font-size:12px;color:#94a3b8;margin:10px 0 0;text-align:center">Vos données sont sauvegardées · Reconnectez-vous en 1 clic</p>
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

      await kvSet(`reactiv:${email}`, true, 86400 * 90);
      sent++;
    } catch { /* continue */ }
  }

  return new Response(JSON.stringify({ ok: true, sent, skipped, processed: batch.length, totalUsers: total, nextCursor }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
