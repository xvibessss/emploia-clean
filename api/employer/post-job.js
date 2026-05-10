export const config = { runtime: 'edge' };
import { kvGet, kvSet, checkRateLimit, getAllowedOrigin, validateEmail } from '../_lib/auth.js';

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };

  if (req.method === 'OPTIONS') return new Response(null, {
    status: 204,
    headers: { ...H, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
  });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'employer_post', 5, 86400);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Limite atteinte. Maximum 5 offres par jour par IP.' }), { status: 429, headers: H });

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

  const san = (v, max) => String(v || '').trim().slice(0, max);
  const title       = san(body.title, 150);
  const company     = san(body.company, 100);
  const location    = san(body.location, 100);
  const type        = san(body.type, 20);
  const description = san(body.description, 3000);
  const contactEmail = san(body.contactEmail, 254).toLowerCase();
  const applyUrl    = san(body.applyUrl, 500);
  const salaryMin   = Math.max(0, parseInt(body.salaryMin) || 0);
  const salaryMax   = Math.max(0, parseInt(body.salaryMax) || 0);
  const remote      = !!body.remote;

  const VALID_TYPES = ['CDI', 'CDD', 'Stage', 'Alternance', 'Freelance'];
  if (!title || title.length < 5)
    return new Response(JSON.stringify({ error: 'Titre trop court (5 caractères minimum)' }), { status: 400, headers: H });
  if (!company || company.length < 2)
    return new Response(JSON.stringify({ error: "Nom d'entreprise requis" }), { status: 400, headers: H });
  if (!location)
    return new Response(JSON.stringify({ error: 'Localisation requise' }), { status: 400, headers: H });
  if (!VALID_TYPES.includes(type))
    return new Response(JSON.stringify({ error: 'Type de contrat invalide' }), { status: 400, headers: H });
  if (!description || description.length < 80)
    return new Response(JSON.stringify({ error: 'Description trop courte (80 caractères minimum)' }), { status: 400, headers: H });
  if (!contactEmail && !applyUrl)
    return new Response(JSON.stringify({ error: 'Email de contact ou URL de candidature requis' }), { status: 400, headers: H });
  if (contactEmail && !validateEmail(contactEmail))
    return new Response(JSON.stringify({ error: 'Email de contact invalide' }), { status: 400, headers: H });
  if (applyUrl && !/^https?:\/\//i.test(applyUrl))
    return new Response(JSON.stringify({ error: 'URL invalide (doit commencer par https://)' }), { status: 400, headers: H });

  let salary = null;
  if (salaryMin > 0 && salaryMax > 0 && salaryMax >= salaryMin) salary = `${salaryMin}–${salaryMax}k€/an`;
  else if (salaryMin > 0) salary = `À partir de ${salaryMin}k€/an`;

  const id = `emp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const job = {
    id,
    title,
    company,
    location: remote ? `${location} · Télétravail` : location,
    type,
    description: description.slice(0, 600),
    salary,
    contactEmail: contactEmail || null,
    applyUrl: applyUrl || null,
    url: applyUrl || `mailto:${contactEmail}`,
    remote,
    postedAt: new Date().toISOString(),
    date: new Date().toISOString(),
    status: 'active',
    source: 'Emploia Direct',
    direct: true,
    country: 'FR',
    logo: null,
  };

  const existing = await kvGet('employer_jobs') || [];
  const updated = [job, ...(Array.isArray(existing) ? existing : [])].slice(0, 500);
  await kvSet('employer_jobs', updated);

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const adminHtml = `<h2 style="font-family:sans-serif">Nouvelle offre directe Emploia</h2>
<table style="font-family:sans-serif;border-collapse:collapse;font-size:14px">
  <tr><td style="padding:6px 12px;color:#64748b;white-space:nowrap">Poste</td><td style="padding:6px 12px;font-weight:600">${title}</td></tr>
  <tr><td style="padding:6px 12px;color:#64748b">Entreprise</td><td style="padding:6px 12px">${company}</td></tr>
  <tr><td style="padding:6px 12px;color:#64748b">Lieu</td><td style="padding:6px 12px">${location} ${remote ? '(télétravail)' : ''}</td></tr>
  <tr><td style="padding:6px 12px;color:#64748b">Type</td><td style="padding:6px 12px">${type}</td></tr>
  <tr><td style="padding:6px 12px;color:#64748b">Salaire</td><td style="padding:6px 12px">${salary || 'NC'}</td></tr>
  <tr><td style="padding:6px 12px;color:#64748b">Contact</td><td style="padding:6px 12px">${contactEmail || '—'}</td></tr>
  <tr><td style="padding:6px 12px;color:#64748b">URL</td><td style="padding:6px 12px">${applyUrl || '—'}</td></tr>
  <tr><td style="padding:6px 12px;color:#64748b">ID</td><td style="padding:6px 12px;font-size:11px;color:#94a3b8">${id}</td></tr>
</table>
<p style="font-family:sans-serif;margin-top:16px"><strong>Description :</strong><br>${description.replace(/\n/g, '<br>')}</p>
<p style="font-family:sans-serif;font-size:11px;color:#94a3b8">IP: ${ip}</p>`;

    fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Emploia <noreply@emploia.fr>', to: ['chapellecorsica@gmail.com'], subject: `[Emploia RH] ${title} — ${company}`, html: adminHtml }),
    }).catch(() => {});

    if (contactEmail) {
      const year = new Date().getFullYear();
      fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Emploia <noreply@emploia.fr>',
          to: [contactEmail],
          subject: `Votre offre "${title}" est en ligne sur Emploia ✅`,
          html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif"><div style="max-width:520px;margin:40px auto;padding:0 20px"><div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden"><div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px"><div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px">Emploia</div></div><div style="padding:32px"><h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 12px">Votre offre est en ligne ✅</h1><p style="color:#475569;line-height:1.6;margin:0 0 16px">L'offre <strong>"${title}"</strong> pour <strong>${company}</strong> est maintenant visible par les candidats sur Emploia.</p><div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:24px"><p style="font-size:13px;color:#475569;margin:0 0 6px"><strong>Poste :</strong> ${title}</p><p style="font-size:13px;color:#475569;margin:0 0 6px"><strong>Lieu :</strong> ${location}</p><p style="font-size:13px;color:#475569;margin:0 0 6px"><strong>Type :</strong> ${type}</p>${salary ? `<p style="font-size:13px;color:#475569;margin:0"><strong>Salaire :</strong> ${salary}</p>` : ''}</div><a href="https://emploia.fr/jobs" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none">Voir mon offre →</a><p style="margin-top:24px;font-size:13px;color:#94a3b8">Des questions ? Répondez à cet email ou écrivez à <a href="mailto:contact@emploia.fr" style="color:#6366f1">contact@emploia.fr</a></p></div></div><p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${year} Emploia · <a href="https://emploia.fr" style="color:#94a3b8">emploia.fr</a></p></div></body></html>`,
        }),
      }).catch(() => {});
    }
  }

  return new Response(JSON.stringify({ ok: true, id }), { status: 201, headers: H });
}
