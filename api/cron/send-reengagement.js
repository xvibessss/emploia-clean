export const config = { runtime: 'edge' };
import { kvGet, kvSet, kvSmembers, getGenerationsUsed, htmlEscape } from '../_lib/auth.js';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';

// Day-3 re-engagement: fire for users who signed up 2–5 days ago with 0 generations used.
// Runs daily at 10am — a batch of up to 80 users per run (cursor-based).

export default async function handler(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return new Response(JSON.stringify({ error: 'No RESEND_API_KEY' }), { status: 500 });

  const allUsers = (await kvSmembers('all_users')) || [];
  const total = allUsers.length;

  const BATCH_SIZE = 80;
  const rawCursor = await kvGet('reeng_cursor') || 0;
  const cursor = typeof rawCursor === 'number' ? rawCursor : 0;
  const start = cursor % Math.max(total, 1);
  const batch = allUsers.slice(start, start + BATCH_SIZE);
  const nextCursor = (start + BATCH_SIZE >= total) ? 0 : start + BATCH_SIZE;
  await kvSet('reeng_cursor', nextCursor, 86400 * 7);

  const now = Date.now();
  const DAY = 86400000;

  let sent = 0;
  let skipped = 0;

  for (const email of batch) {
    // Already sent re-engagement to this user
    const alreadySent = await kvGet(`reeng:${email}`);
    if (alreadySent) { skipped++; continue; }

    const user = await kvGet(`user:${email}`);
    if (!user || !user.createdAt) { skipped++; continue; }

    const age = now - new Date(user.createdAt).getTime();
    // Only target users who signed up 2–5 days ago
    if (age < 2 * DAY || age > 5 * DAY) { skipped++; continue; }

    // Skip if they've already generated something
    const used = await getGenerationsUsed(email);
    const generationsUsed = used !== null ? used : (user.generationsUsed || 0);
    if (generationsUsed > 0) {
      await kvSet(`reeng:${email}`, true, 86400 * 60);
      skipped++;
      continue;
    }

    // Skip Pro users (they converted already)
    if (user.plan && user.plan !== 'free') { skipped++; continue; }

    const firstNameRaw = (user.name || '').replace(/[\r\n]/g, ' ').split(' ')[0] || '';
    const firstName = htmlEscape(firstNameRaw || 'là');

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Emploia <noreply@emploia.fr>',
          to: [email],
          subject: `${firstNameRaw ? firstNameRaw + ', v' : 'V'}otre CV ATS est prêt à être généré 🚀`,
          html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif">
<div style="max-width:520px;margin:40px auto;padding:0 20px">
  <div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px">
      <div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px">Emploia</div>
    </div>
    <div style="padding:32px">
      <h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 10px;letter-spacing:-.5px">Votre copilote IA vous attend, ${firstName} 👋</h1>
      <p style="color:#475569;line-height:1.7;margin:0 0 20px;font-size:14px">Vous avez créé votre compte Emploia il y a quelques jours — mais vous n'avez pas encore généré votre premier CV ATS-optimisé.</p>
      <p style="color:#475569;line-height:1.7;margin:0 0 24px;font-size:14px">En <strong style="color:#0f172a">moins de 30 secondes</strong>, l'IA adapte votre CV à n'importe quelle offre et l'optimise pour passer les filtres ATS automatiquement.</p>
      <div style="background:#f8fafc;border-left:4px solid #6366f1;border-radius:0 10px 10px 0;padding:16px 20px;margin-bottom:28px">
        <p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 10px">En 3 étapes :</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;align-items:center;gap:10px"><span style="min-width:22px;height:22px;border-radius:6px;background:#6366f1;color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center">1</span><span style="font-size:13px;color:#475569">Copiez une offre d'emploi depuis LinkedIn, Indeed…</span></div>
          <div style="display:flex;align-items:center;gap:10px"><span style="min-width:22px;height:22px;border-radius:6px;background:#6366f1;color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center">2</span><span style="font-size:13px;color:#475569">Collez votre profil ou CV actuel</span></div>
          <div style="display:flex;align-items:center;gap:10px"><span style="min-width:22px;height:22px;border-radius:6px;background:#6366f1;color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center">3</span><span style="font-size:13px;color:#475569">Votre CV ATS-optimisé est prêt à télécharger 🎯</span></div>
        </div>
      </div>
      <a href="${BASE_URL}/app" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none;letter-spacing:-.2px">✨ Générer mon premier CV gratuit →</a>
      <p style="font-size:12px;color:#94a3b8;margin:20px 0 0">Vous avez 5 générations gratuites — aucune carte bancaire requise.</p>
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

      await kvSet(`reeng:${email}`, true, 86400 * 60);
      sent++;
    } catch { /* continue */ }
  }

  return new Response(JSON.stringify({ ok: true, sent, skipped, processed: batch.length, totalUsers: total, nextCursor }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
