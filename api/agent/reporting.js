export const config = { runtime: 'edge' };
import { kvGet, kvSmembers } from '../_lib/auth.js';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';

const SYSTEM = `Tu es l'agent reporting d'Emploia, un SaaS de recherche d'emploi IA 100% français.

À partir des métriques fournies, génère un rapport hebdomadaire exécutif en français pour le fondateur.
Structure ton rapport ainsi :
1. **Résumé en une phrase** — l'essentiel de la semaine
2. **Points forts** (2-3 bullets) — ce qui va bien
3. **Points d'attention** (1-2 bullets) — ce qui mérite surveillance
4. **Recommandation actionnable** — une action concrète à faire cette semaine

Sois direct, factuel, et business-minded. Pas de langue de bois. Environ 150 mots.`;

async function gatherMetrics() {
  const allUsers = (await kvSmembers('all_users')) || [];
  const totalUsers = allUsers.length;

  // Sample up to 200 users for plan/activity stats
  const sample = allUsers.slice(0, 200);
  const userData = await Promise.allSettled(sample.map(e => kvGet(`user:${e}`)));

  let proCount = 0, intensifCount = 0, freeCount = 0;
  let activeThisWeek = 0;
  const oneWeekAgo = Date.now() - 7 * 86400 * 1000;

  for (const r of userData) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const u = r.value;
    if (u.plan === 'pro' || u.plan === 'pro_annual') proCount++;
    else if (u.plan === 'intensif' || u.plan === 'intensif_annual') intensifCount++;
    else freeCount++;
    if (u.lastActiveAt && new Date(u.lastActiveAt).getTime() > oneWeekAgo) activeThisWeek++;
  }

  // Scale to total if sample < total
  const scale = totalUsers > 0 ? totalUsers / Math.max(sample.length, 1) : 1;

  // Revenue estimate (approximate)
  const monthlyRevenue = Math.round(proCount * scale * 9 + intensifCount * scale * 29);

  // Generation counts from track events
  const [genCv, genCover, genInterview] = await Promise.all([
    kvGet('track:generate_cv'),
    kvGet('track:generate_cover_letter'),
    kvGet('track:interview_start'),
  ]);

  return {
    totalUsers: Math.round(totalUsers),
    proCount: Math.round(proCount * scale),
    intensifCount: Math.round(intensifCount * scale),
    freeCount: Math.round(freeCount * scale),
    activeThisWeek: Math.round(activeThisWeek * scale),
    estimatedMRR: monthlyRevenue,
    totalGenerations: {
      cv: Number(genCv) || 0,
      coverLetter: Number(genCover) || 0,
      interview: Number(genInterview) || 0,
    },
  };
}

async function generateReportWithClaude(metrics, apiKey) {
  const weekStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const metricsText = `
Semaine du ${weekStr}

UTILISATEURS :
- Total inscrits : ${metrics.totalUsers}
- Plan Free : ${metrics.freeCount}
- Plan Pro : ${metrics.proCount}
- Plan Intensif : ${metrics.intensifCount}
- Actifs cette semaine : ${metrics.activeThisWeek}

REVENUS :
- MRR estimé : ${metrics.estimatedMRR}€/mois

USAGE IA (cumulé depuis lancement) :
- CV générés : ${metrics.totalGenerations.cv}
- Lettres générées : ${metrics.totalGenerations.coverLetter}
- Sessions entretien : ${metrics.totalGenerations.interview}

TAUX DE CONVERSION FREE→PAID :
- ${metrics.totalUsers > 0 ? ((metrics.proCount + metrics.intensifCount) / metrics.totalUsers * 100).toFixed(1) : 0}%`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: 'user', content: metricsText }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.content?.[0]?.text || null;
  } catch { return null; }
}

function metricCard(label, value, sub = '') {
  return `
<div style="flex:1;min-width:140px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center">
  <div style="font-size:24px;font-weight:800;color:#0f172a">${value}</div>
  <div style="font-size:12px;font-weight:600;color:#6E48BE;margin:2px 0">${label}</div>
  ${sub ? `<div style="font-size:11px;color:#94a3b8">${sub}</div>` : ''}
</div>`;
}

export default async function handler(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL || 'contact@emploia.fr';
  if (!apiKey || !resendKey) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), { status: 500 });
  }

  const metrics = await gatherMetrics();
  const analysis = await generateReportWithClaude(metrics, apiKey);
  const weekStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const analysisHtml = analysis
    ? analysis
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/^- (.+)$/gm, '<li style="margin-bottom:4px">$1</li>')
        .replace(/(<li.*<\/li>\n?)+/g, m => `<ul style="margin:8px 0;padding-left:20px">${m}</ul>`)
        .replace(/\n/g, '<br>')
    : '<p style="color:#94a3b8">Analyse indisponible.</p>';

  const emailHtml = `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif">
<div style="max-width:600px;margin:40px auto;padding:0 20px">
  <div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:linear-gradient(135deg,#6E48BE,#4f46e5);padding:28px 32px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:20px;font-weight:900;color:#fff">Emploia · Rapport hebdo</div>
        <div style="color:rgba(255,255,255,.7);font-size:13px;margin-top:4px">Semaine du ${weekStr}</div>
      </div>
      <div style="font-size:36px">📊</div>
    </div>
    <div style="padding:32px">

      <!-- KPIs -->
      <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 16px;text-transform:uppercase;letter-spacing:.5px">Métriques clés</h2>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px">
        ${metricCard('Utilisateurs', metrics.totalUsers)}
        ${metricCard('Actifs / semaine', metrics.activeThisWeek)}
        ${metricCard('MRR estimé', `${metrics.estimatedMRR}€`)}
        ${metricCard('Conversion', `${metrics.totalUsers > 0 ? ((metrics.proCount + metrics.intensifCount) / metrics.totalUsers * 100).toFixed(1) : 0}%`, 'free→paid')}
      </div>

      <!-- Plans -->
      <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:28px">
        <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:12px">Répartition des plans</div>
        <div style="display:flex;gap:16px;font-size:13px">
          <span style="color:#64748b">Free : <strong>${metrics.freeCount}</strong></span>
          <span style="color:#6E48BE">Pro : <strong>${metrics.proCount}</strong></span>
          <span style="color:#4f46e5">Intensif : <strong>${metrics.intensifCount}</strong></span>
        </div>
      </div>

      <!-- Usage IA -->
      <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:28px">
        <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:12px">Usage IA (cumulé)</div>
        <div style="display:flex;gap:16px;font-size:13px;flex-wrap:wrap">
          <span>📄 CV : <strong>${metrics.totalGenerations.cv}</strong></span>
          <span>✉️ Lettres : <strong>${metrics.totalGenerations.coverLetter}</strong></span>
          <span>🎯 Entretiens : <strong>${metrics.totalGenerations.interview}</strong></span>
        </div>
      </div>

      <!-- Analyse IA -->
      <div style="background:rgba(110,72,190,.05);border:1px solid rgba(110,72,190,.15);border-radius:12px;padding:20px;margin-bottom:24px">
        <div style="font-size:13px;font-weight:700;color:#6E48BE;margin-bottom:12px">🤖 Analyse Orion</div>
        <div style="font-size:14px;color:#334155;line-height:1.7">${analysisHtml}</div>
      </div>

      <a href="${BASE_URL}/admin/stats" style="display:inline-block;background:linear-gradient(135deg,#6E48BE,#4f46e5);color:#fff;font-weight:700;font-size:13px;padding:12px 24px;border-radius:9px;text-decoration:none">Voir le dashboard admin →</a>
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">Rapport généré automatiquement par l'agent Orion · Emploia</p>
</div>
</body></html>`;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Orion Reporting · Emploia <noreply@emploia.fr>',
        to: [adminEmail],
        subject: `📊 Rapport hebdo Emploia — ${weekStr}`,
        html: emailHtml,
      }),
    });
    return new Response(JSON.stringify({ ok: true, metrics }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
