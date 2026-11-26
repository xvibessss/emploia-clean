export const config = { runtime: 'edge', regions: ['cdg1'] };
import { kvGet, kvSet, kvSmembers, htmlEscape, unsubscribeUrl, bearerMatches } from '../_lib/auth.js';
import { chercherPourAlerte, offresNouvelles, marquerVues, stockerFiche } from '../_lib/alertes.js';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://emploia.eu';

// DÉCISION sur les alertes « CDI » (inchangée). Une alerte typée ne retient
// qu'une offre dont le contrat est LU et égal au type demandé ; une offre au
// contrat inconnu n'est pas envoyée. C'est désormais le filtre de contrat de
// /jobs qui l'applique (`type=cdi`), le même que sur la page Offres.
//
// Ce qui change le 2026-11-26 (détail dans _lib/alertes.js) :
//  - la recherche passe par le moteur de /jobs au lieu d'Arbeitnow seul ;
//  - seules les offres jamais envoyées pour cette alerte partent ;
//  - chaque offre porte un bouton « Générer mon CV pour cette offre », qui
//    ouvre /app avec l'offre collée (et lance la génération si l'abonné est
//    connecté et que son parcours est enregistré).
//
// BUDGET DE TEMPS. Une fonction Edge doit répondre en 25 s. Les abonnés sont
// traités par petits groupes en parallèle, et le cron s'arrête de lancer de
// nouveaux groupes après BUDGET_MS : le curseur reprend au premier abonné non
// traité, au lieu de sauter ceux que le délai aurait coupés.
const BATCH_SIZE = 60;
const PARALLELE = 6;
const BUDGET_MS = 17000;

function lienCV(offre) {
  const p = new URLSearchParams({ source: 'alerte', offre_id: String(offre.id), auto: '1' });
  return `${BASE_URL}/app?${p}`;
}

function jobCard(job) {
  const loc = [htmlEscape(job.location || ''), job.remote ? 'Télétravail' : '', job.type ? htmlEscape(job.type) : ''].filter(Boolean).join(' · ');
  return `<div style="padding:14px 16px;background:#f8fafc;border-radius:10px;margin-bottom:10px;border:1px solid #e2e8f0">
  <a href="${htmlEscape(job.url)}" style="text-decoration:none">
    <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:4px">${htmlEscape(job.title)}</div>
    <div style="font-size:12px;color:#64748b">${[htmlEscape(job.company || ''), loc].filter(Boolean).join(' · ')}</div>
  </a>
  <a href="${htmlEscape(lienCV(job))}" style="display:inline-block;margin-top:10px;background:#6E48BE;color:#fff;font-size:12px;font-weight:700;padding:8px 14px;border-radius:8px;text-decoration:none">✨ Générer mon CV pour cette offre</a>
</div>`;
}

function emailHtml(prenom, today, sections, email) {
  const corps = sections.map(({ alert, jobs }) => `
      <div style="margin-bottom:24px">
        <div style="font-size:12px;font-weight:700;color:#6E48BE;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">
          🔔 ${htmlEscape(alert.keywords)}${alert.location ? ` · ${htmlEscape(alert.location)}` : ''}${alert.type && alert.type !== 'all' ? ` · ${htmlEscape(alert.type)}` : ''}
        </div>
        ${jobs.map(jobCard).join('')}
      </div>`).join('');
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif">
<div style="max-width:580px;margin:40px auto;padding:0 20px">
  <div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:#6E48BE;padding:24px 32px">
      <div style="display:inline-block;font-size:18px;font-weight:900;color:#fff">Emploia</div>
    </div>
    <div style="padding:32px">
      <h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 6px">Nouvelles offres pour vous, ${prenom} !</h1>
      <p style="color:#64748b;font-size:13px;margin:0 0 6px">${today} — uniquement des offres que vous n’avez pas encore reçues.</p>
      <p style="color:#64748b;font-size:13px;margin:0 0 24px">Un clic sur « Générer mon CV » ouvre Emploia avec l’offre déjà collée.</p>
      ${corps}
      <a href="${BASE_URL}/jobs" style="display:inline-block;background:#0f172a;color:#fff;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;text-decoration:none">Voir toutes les offres →</a>
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">
    © ${new Date().getFullYear()} Emploia ·
    <a href="${BASE_URL}/alerts" style="color:#94a3b8">Gérer mes alertes</a> ·
    <a href="${unsubscribeUrl(email)}" style="color:#94a3b8">Se désabonner</a>
  </p>
</div>
</body></html>`;
}

async function traiterAbonne(email, today, resendKey) {
  const [optedOut, alerts, user] = await Promise.all([
    kvGet(`optout:${email}`),
    kvGet(`alerts:${email}`),
    kvGet(`user:${email}`),
  ]);
  if (optedOut || !user || !Array.isArray(alerts) || !alerts.length) return { envoye: false, sautees: 0 };

  const actives = alerts.filter(a => a.active);
  if (!actives.length) return { envoye: false, sautees: 0 };

  const dejaEnvoyees = await Promise.all(actives.map(a => kvGet(`alertSent:${email}:${a.id}`)));
  const aEnvoyer = actives.filter((_, i) => !dejaEnvoyees[i]);
  const sautees = actives.length - aEnvoyer.length;
  if (!aEnvoyer.length) return { envoye: false, sautees };

  const resultats = await Promise.allSettled(aEnvoyer.map(async a => {
    const offres = await chercherPourAlerte(a, email, BASE_URL);
    return offresNouvelles(email, a.id, offres);
  }));
  const sections = aEnvoyer
    .map((alert, i) => ({ alert, jobs: resultats[i].status === 'fulfilled' ? resultats[i].value : [] }))
    .filter(({ jobs }) => jobs.length > 0);
  if (!sections.length) return { envoye: false, sautees };

  // Les fiches d'abord : un lien d'email qui pointe vers une fiche absente
  // ouvrirait le générateur vide.
  await Promise.all(sections.flatMap(({ jobs }) => jobs.map(stockerFiche)));

  const prenom = htmlEscape((user.name || '').replace(/[\r\n]/g, ' ').split(' ')[0] || 'là');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Emploia Alertes <noreply@emploia.eu>',
      to: [email],
      subject: `🔔 ${sections.reduce((n, s) => n + s.jobs.length, 0)} nouvelle(s) offre(s) : ${sections[0].alert.keywords.replace(/[\r\n]/g, ' ')}`,
      html: emailHtml(prenom, today, sections, email),
    }),
  });
  // Rien n'est marqué envoyé si Resend refuse : sinon les offres seraient
  // perdues pour de bon, et l'alerte muette jusqu'au lendemain sans raison.
  if (!res.ok) {
    console.error('[alertes] Resend a refusé l’envoi', { statut: res.status });
    return { envoye: false, sautees };
  }
  await Promise.all([
    ...sections.map(({ alert }) => kvSet(`alertSent:${email}:${alert.id}`, today, alert.frequency === 'weekly' ? 6 * 86400 : 22 * 3600)),
    ...sections.map(({ alert, jobs }) => marquerVues(email, alert.id, jobs)),
  ]);
  return { envoye: true, sautees };
}

export default async function handler(req) {
  // Vercel injects Authorization: Bearer <CRON_SECRET> for scheduled calls
  if (!bearerMatches(req, process.env.CRON_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return new Response(JSON.stringify({ error: 'No RESEND_API_KEY' }), { status: 500 });

  const debut = Date.now();
  const subscribers = (await kvSmembers('alert_subscribers')) || [];
  const today = new Date().toISOString().split('T')[0];
  const total = subscribers.length;
  const rawCursor = await kvGet('alert_cursor') || 0;
  const start = (typeof rawCursor === 'number' ? rawCursor : 0) % Math.max(total, 1);
  const batch = subscribers.slice(start, start + BATCH_SIZE);

  let sent = 0, skipped = 0, traites = 0;
  for (let i = 0; i < batch.length; i += PARALLELE) {
    if (Date.now() - debut > BUDGET_MS) break;
    const groupe = batch.slice(i, i + PARALLELE);
    const r = await Promise.allSettled(groupe.map(e => traiterAbonne(e, today, resendKey)));
    for (const x of r) {
      if (x.status === 'fulfilled') { if (x.value.envoye) sent++; skipped += x.value.sautees; }
      else console.error('[alertes] abonné en échec', String(x.reason && x.reason.message || x.reason).slice(0, 200));
    }
    traites += groupe.length;
  }

  const fin = start + traites;
  const nextCursor = fin >= total ? 0 : fin;
  await kvSet('alert_cursor', nextCursor, 86400 * 7);

  return new Response(JSON.stringify({ ok: true, sent, skipped, processed: traites, totalSubscribers: total, nextCursor }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
