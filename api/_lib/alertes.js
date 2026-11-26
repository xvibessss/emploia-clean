// Alertes emploi : recherche, tri des offres déjà envoyées, et fiche d'offre
// stockée pour le bouton « Générer mon CV pour cette offre ».
//
// RECHERCHE. Le cron interrogeait seulement Arbeitnow, un agrégateur allemand
// dont les offres sont surtout en allemand et en anglais : une alerte
// « comptable · Lyon » n'avait à peu près aucune chance d'y trouver quoi que ce
// soit. L'alerte passe désormais par le moteur de /jobs lui-même (toutes les
// sources, le filtre de pertinence, le filtre de contrat et le cache), appelé
// dans le même processus : pas d'aller-retour HTTP, et la limite de débit de
// /api/jobs s'applique par abonné, pas à l'adresse unique du cron.
//
// PERTINENCE. Quand aucune offre ne correspond, /jobs sert « tous métiers
// confondus » et l'annonce (`filtre: 'abandonne'`) ; une page de démonstration
// porte `demo: true`. Aucun des deux ne part par email : une alerte qui promet
// « comptable » et livre autre chose coûte plus qu'un email de moins.

import { kvGet, kvSet } from './auth.js';
import jobsHandler from '../jobs.js';

export const OFFRES_PAR_ALERTE = 5;
export const MAX_OFFRE = 8000;           // même borne que l'extension et /app
const TTL_FICHE = 21 * 86400;            // le lien de l'email vit trois semaines
const TTL_VUES = 60 * 86400;
const MAX_VUES = 300;
const ID_VALIDE = /^[A-Za-z0-9_.:-]{1,100}$/;

export const idOffreValide = (id) => typeof id === 'string' && ID_VALIDE.test(id);

async function empreinte(texte) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return [...new Uint8Array(buf)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function chercherPourAlerte(alerte, email, base = 'https://emploia.eu') {
  const params = new URLSearchParams({ q: alerte.keywords || '', limit: '20' });
  if (alerte.location) params.set('location', alerte.location);
  if (alerte.type && alerte.type !== 'all') params.set('type', String(alerte.type).toLowerCase());
  const req = new Request(`${base}/api/jobs?${params}`, {
    headers: { 'x-forwarded-for': `alerte-${await empreinte(email)}` },
  });
  try {
    const res = await jobsHandler(req);
    if (!res.ok) return [];
    const d = await res.json();
    if (d.demo || d.filtre === 'abandonne' || !Array.isArray(d.jobs)) return [];
    return d.jobs.filter(j => j && idOffreValide(String(j.id || '')) && j.title && /^https?:\/\//i.test(j.url || ''));
  } catch {
    return [];
  }
}

// Ne garde que les offres jamais envoyées pour cette alerte. Avant, la même
// recherche renvoyait chaque matin les mêmes cinq offres.
export async function offresNouvelles(email, alerteId, offres) {
  const cle = `alertSeen:${email}:${alerteId}`;
  const vues = await kvGet(cle);
  const deja = new Set(Array.isArray(vues) ? vues : []);
  return offres.filter(o => !deja.has(String(o.id))).slice(0, OFFRES_PAR_ALERTE);
}

export async function marquerVues(email, alerteId, offres) {
  if (!offres.length) return;
  const cle = `alertSeen:${email}:${alerteId}`;
  const vues = await kvGet(cle);
  const liste = [...offres.map(o => String(o.id)), ...(Array.isArray(vues) ? vues : [])];
  await kvSet(cle, [...new Set(liste)].slice(0, MAX_VUES), TTL_VUES);
}

// Fiche de l'offre lue par /app?offre_id= : l'email ne peut pas porter 8 000
// caractères dans un lien, il porte l'identifiant.
export function texteOffre(o) {
  const entete = [o.title, o.company && `— ${o.company}`, o.location && `(${o.location})`].filter(Boolean).join(' ');
  return `${entete}\n\n${String(o.description || '').trim()}`.slice(0, MAX_OFFRE).trim();
}

export async function stockerFiche(o) {
  await kvSet(`offre:${o.id}`, { texte: texteOffre(o), url: o.url }, TTL_FICHE);
}

export async function lireFiche(id) {
  if (!idOffreValide(id)) return null;
  const f = await kvGet(`offre:${id}`);
  return f && typeof f.texte === 'string' ? f : null;
}
