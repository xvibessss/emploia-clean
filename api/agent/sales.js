export const config = { runtime: 'edge' };
import { kvGet, kvSet, kvSmembers, htmlEscape } from '../_lib/auth.js';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';

const SYSTEM = `Tu es l'agent sales d'Emploia, un SaaS de recherche d'emploi IA 100% français.

Rédige un email de conversion court (80-100 mots MAX) pour un utilisateur free qui a déjà utilisé Emploia.
L'email doit :
- Être personnalisé selon le contexte (usage, profil, temps depuis inscription)
- Créer une urgence réelle (pas artificielle) basée sur leur situation de recherche d'emploi
- Mettre en avant LA fonctionnalité Pro la plus pertinente pour leur profil
- Avoir un ton humain, bienveillant, jamais pushy
- Se terminer par un CTA clair avec lien

Réponds UNIQUEMENT avec un JSON :
{ "subject": "...", "body": "..." }
Le body est en texte brut (pas HTML), avec \n pour les sauts de ligne.`;

const PRO_FEATURES = [
  { key: 'unlimited', label: 'générations illimitées (CV, LM, relances…)', link: '/#pricing' },
  { key: 'chat', label: 'Orion Chat — coach emploi IA disponible 24h/24', link: '/chat' },
  { key: 'vault', label: 'CV Vault — gérez toutes vos versions de CV', link: '/cv-vault' },
  { key: 'interview', label: 'simulateur d\'entretien IA illimité', link: '/interview' },
];

async function generateEmail(user, profile, daysOld, generationsUsed, apiKey) {
  const context = [
    `Prénom : ${(user.name || '').split(' ')[0] || 'là'}`,
    `Inscrit il y a : ${daysOld} jour${daysOld > 1 ? 's' : ''}`,
    `Générations utilisées : ${generationsUsed}/5`,
    profile?.targetRole && `Cherche : ${profile.targetRole}`,
    profile?.sector && `Secteur : ${profile.sector}`,
    profile?.location && `Ville : ${profile.location}`,
    `Fonctionnalité à mettre en avant : ${PRO_FEATURES[Math.floor(Math.random() * PRO_FEATURES.length)].label}`,
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SYSTEM,
        messages: [{ role: 'user', content: context }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content?.[0]?.text || '{}';
    return JSON.parse(text);
  } catch { return null; }
}

export default async function handler(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!apiKey || !resendKey) return new Response(JSON.stringify({ error: 'Missing env vars' }), { status: 500 });

  const allUsers = (await kvSmembers('all_users')) || [];
  const now = Date.now();
  const BATCH = 25;
  let sent = 0, skipped = 0;

  for (const email of allUsers.slice(0, BATCH)) {
    const [user, profile, optedOut] = await Promise.all([
      kvGet(`user:${email}`),
      kvGet(`profile:${email}`),
      kvGet(`optout:${email}`),
    ]);

    if (optedOut || !user) { skipped++; continue; }

    // Only target free users
    if (user.plan && user.plan !== 'free') { skipped++; continue; }

    // Must have used at least 1 generation (engaged users only)
    const generationsUsed = user.freeGenerations || 0;
    if (generationsUsed < 1) { skipped++; continue; }

    // Registered at least 2 days ago
    const registeredAt = user.createdAt ? new Date(user.createdAt).getTime() : 0;
    const daysOld = Math.floor((now - registeredAt) / 86400000);
    if (daysOld < 2) { skipped++; continue; }

    // Don't re-send within 14 days
    const sentKey = `salesAgent:sent:${email}`;
    const alreadySent = await kvGet(sentKey);
    if (alreadySent) { skipped++; continue; }

    const emailContent = await generateEmail(user, profile, daysOld, generationsUsed, apiKey);
    if (!emailContent?.subject || !emailContent?.body) { skipped++; continue; }

    const htmlBody = emailContent.body
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .split('\n').map(l => l.trim() ? `<p style="margin:0 0 12px;font-size:14px;color:#334155;line-height:1.7">${l}</p>` : '').join('');

    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Hugo · Emploia <noreply@emploia.fr>',
          to: [email],
          subject: emailContent.subject,
          html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif">
<div style="max-width:560px;margin:40px auto;padding:0 20px">
  <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:36px">
    <div style="font-size:18px;font-weight:800;color:#6E48BE;margin-bottom:24px">Emploia</div>
    ${htmlBody}
    <a href="${BASE_URL}/#pricing" style="display:inline-block;background:linear-gradient(135deg,#6E48BE,#4f46e5);color:#fff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px;text-decoration:none;margin-top:8px">Passer Pro — 9€/mois →</a>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:16px">
    Emploia · <a href="${BASE_URL}/api/newsletter?unsubscribe=${encodeURIComponent(email)}" style="color:#94a3b8">Se désabonner</a>
  </p>
</div>
</body></html>`,
        }),
      });

      if (emailRes.ok) {
        await kvSet(sentKey, true, 14 * 86400);
        sent++;
      }
    } catch { skipped++; }
  }

  return new Response(JSON.stringify({ ok: true, sent, skipped }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
