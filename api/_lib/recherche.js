// ── RECHERCHE : LES MOTS D'UNE REQUÊTE, ET CE QU'UNE OFFRE EN PORTE ─────────
//
// Deux lecteurs de `api/jobs.js` décident si une offre répond à une requête :
//   · `estPertinente`, le filtre de l'AGRÉGAT, qui écarte le bruit des sources
//     tierces qui ignorent leur `search=` (Remotive, Arbeitnow) ;
//   · `servirReservoir`, le lecteur des RÉSERVOIRS remplis par cron
//     (Greenhouse, Lever, Teamtailor, SmartRecruiters, Ashby, JSearch, French
//     Job Market) et des offres employeur.
// Ils vivent ici pour lire une requête de la même façon : mêmes mots, mêmes
// accents, même neutralisation des enseignes homonymes.
//
// CE QUE CE MODULE A CORRIGÉ (2026-11-05). Les réservoirs cherchaient la
// requête ENTIÈRE comme une seule sous-chaîne, sensible aux accents :
//
//     j.title.toLowerCase().includes(q.toLowerCase())
//
// Or 34 des 37 pages /metier envoient une requête de plusieurs mots —
// « chef de cuisine cuisinier restauration », « devops cloud engineer » — que
// aucun titre ne contient d'un bloc. Ces pages ne recevaient donc AUCUNE offre
// des cinq ATS, par construction, quel que soit le contenu des réservoirs. Les
// 11 pages ville qui envoient `q=emploi` non plus (aucun titre ne dit
// « emploi »), et « developpeur » tapé sans accent ne trouvait pas
// « Développeur ». Relevé en production le même jour : `/api/jobs?q=developpeur`
// rendait 6 offres, toutes Adzuna.

// « Santé » → « sante », ponctuation → espace. La forme sur laquelle toute
// comparaison se fait, des deux côtés.
export function normaliser(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Mots trop courts ou trop communs pour porter du sens : les garder ferait
// correspondre n'importe quoi (« de », « et », « job »).
export const MOTS_VIDES = new Set(['pour', 'avec', 'dans', 'chez', 'les', 'des', 'une', 'job', 'jobs', 'emploi', 'poste', 'offre', 'cdi', 'cdd']);

// Les mots de la requête ET du lieu, comme le filtre de l'agrégat les lit.
export function motsDeRecherche(q, location) {
  return [...new Set([...normaliser(q).split(' '), ...normaliser(location).split(' ')])]
    .filter(m => m.length >= 4 && !MOTS_VIDES.has(m));
}

// ── ENSEIGNES HOMONYMES D'UN MÉTIER ──
// « Boulanger » est une enseigne d'électroménager : 144 offres FR au catalogue
// SmartRecruiters, toutes en vente et en logistique, aucune en boulangerie.
// Or le filtre de pertinence lit le nom de l'entreprise, et « boulanger » est
// le métier manuel de la sonde de production (`sources.mjs`). Sans cette
// liste, une recherche « boulanger » remontait des vendeurs d'électroménager,
// classés AVANT les vrais postes de boulanger.
//
// Le nom d'une enseigne listée ici ne compte donc plus comme indice. Ses
// offres restent servies — sur leur titre (« vendeur », « magasinier »), leur
// lieu et leur description —, seule la coïncidence de nom est neutralisée. Le
// prix, assumé : chercher « boulanger » pour trouver un emploi CHEZ Boulanger
// ne marche plus. Sur un site d'emploi, ce mot désigne le métier.
//
// La comparaison porte sur le nom ENTIER, sans accent ni casse : « Boulanger »
// est neutralisé, « Boulangerie Paul » ne l'est pas. N'y ajouter qu'une
// enseigne dont le nom est EXACTEMENT un métier servi.
export const ENSEIGNES_HOMONYMES = new Set(['boulanger']);

export function indiceEntreprise(company) {
  const c = String(company || '');
  return ENSEIGNES_HOMONYMES.has(normaliser(c)) ? '' : c;
}

// ── LES MOTS QUI NE SUFFISENT PAS SEULS ──
// Des têtes de fonction qui se posent sur n'importe quel métier. Sur la page
// « chef de cuisine cuisinier restauration », le mot « chef » ferait remonter
// « Stage - Chef de Projet & Relation Client » ; sur « community manager … »,
// « manager » ferait remonter « Key Account Manager ». Ces mots ne qualifient
// donc pas une offre à eux seuls — sauf si la requête n'est faite que d'eux
// (« manager » tout court reste cherchable).
export const MOTS_FAIBLES = new Set([
  'chef', 'agent', 'responsable', 'manager', 'assistant', 'assistante',
  'charge', 'chargee', 'conseiller', 'conseillere', 'directeur', 'directrice',
]);

// Les mots de liaison, qui ne disent rien du poste et sont dans presque tous
// les titres français (« Chef de partie », « Responsable de la paie »).
const LIAISONS = new Set([
  'de', 'du', 'la', 'le', 'et', 'en', 'au', 'aux', 'un', 'sur', 'par', 'ou',
  'of', 'and', 'the', 'in', 'at', 'to', 'for', 'on',
]);

// Un mot COURT — moins de quatre lettres, ou un nombre — se compare comme un
// mot ENTIER : « rh » trouve « Chargé RH » et pas « Rhône », « 7 » trouve
// « Poste 7 » et pas « Poste 17 ». Un mot long se compare comme un fragment,
// pour que « boulanger » trouve « boulangerie ». Ignorer les mots courts,
// comme le fait le filtre de l'agrégat, aurait laissé passer tout un réservoir
// sur « RH », « SEO », « UX » ou « PHP ».
const estCourt = (m) => m.length < 4 || /^\d+$/.test(m);
function porte(texte, m) {
  return estCourt(m) ? ` ${texte} `.includes(` ${m} `) : texte.includes(m);
}

// Les mots qui QUALIFIENT une offre pour cette requête. Un mot déjà porté par
// le lieu est retiré : le filtre de lieu l'impose déjà. C'est ce qui sert les
// pages ville, qui envoient `q=Lyon&location=Lyon` — le chercher en plus dans
// le titre aurait vidé la page, puisqu'un titre dit rarement sa ville.
export function motsPorteurs(q, location = '') {
  const duLieu = new Set(normaliser(location).split(' '));
  const mots = [...new Set(normaliser(q).split(' '))].filter(m =>
    (m.length >= 2 || /^\d$/.test(m)) && !MOTS_VIDES.has(m) && !LIAISONS.has(m) && !duLieu.has(m));
  const forts = mots.filter(m => !MOTS_FAIBLES.has(m));
  return forts.length ? forts : mots;
}

// Le lieu, comparé sans accent : « Saint-Étienne » trouve « Saint-Etienne ».
// Une offre sans lieu, ou distancielle, reste servie — comme avant.
export function lieuCorrespond(job, location) {
  if (!location) return true;
  if (!job.location || job.remote) return true;
  return normaliser(job.location).includes(normaliser(location));
}

const parDate = (a, b) => new Date(b.date || 0) - new Date(a.date || 0);

// Les offres qui répondent à la requête, les plus pertinentes d'abord.
//
// Une offre QUALIFIE si un mot porteur est dans son TITRE, ou si elle porte au
// moins deux mots porteurs ailleurs (entreprise, lieu, description) — ou le
// seul, quand la requête n'en a qu'un. La description d'une offre ATS est le
// plus souvent le chapeau de l'entreprise (« Deliveroo is now part of
// DoorDash… ») : y trouver un seul mot d'une requête de quatre ne dit rien du
// poste. Pour une requête d'un mot — « python » —, la description suffit,
// comme avant.
//
// RANG : mots porteurs dans le titre, puis mots porteurs partout, puis date.
// Le tri par date seul, d'avant, aurait laissé dix offres faiblement liées
// devant la seule vraie, puisque chaque réservoir ne rend que dix offres par
// page.
//
// Sans mot porteur (requête vide, « emploi », ou réduite au lieu), rien n'est
// écarté et l'ordre reste celui de la date.
export function rangerParRequete(jobs, q, location = '') {
  const mots = motsPorteurs(q, location);
  if (!mots.length) return jobs.slice().sort(parDate);
  const seuil = Math.min(2, mots.length);
  const notees = [];
  for (const j of jobs) {
    const titre = normaliser(j.title);
    const reste = normaliser(`${indiceEntreprise(j.company)} ${j.location || ''} ${j.description || ''}`);
    let dansTitre = 0, partout = 0;
    for (const m of mots) {
      const t = porte(titre, m);
      if (t) dansTitre++;
      if (t || porte(reste, m)) partout++;
    }
    if (dansTitre >= 1 || partout >= seuil) notees.push({ j, dansTitre, partout });
  }
  return notees
    .sort((a, b) => b.dansTitre - a.dansTitre || b.partout - a.partout || parDate(a.j, b.j))
    .map(n => n.j);
}
