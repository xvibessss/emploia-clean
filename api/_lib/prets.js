// « Prêts à postuler » : les CV adaptés à une offre depuis /decouvrir.
//
// Logique pure, sans réseau ni KV, pour être testée telle quelle
// (scripts/smoke/prets.test.mjs). Le handler est api/prets.js.

export const MAX_PRETS = 30;
export const MAX_CV = 12000;
export const MAX_LETTRE = 6000;
export const STATUTS = ['pret', 'postule'];

const str = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max).trim();

/** L'offre telle qu'on la garde : bornée, et une URL seulement si http(s). */
export function normaliserOffre(o = {}) {
  const url = str(o.url, 500);
  return {
    id: str(o.id, 120),
    title: str(o.title, 200),
    company: str(o.company, 200),
    location: str(o.location, 200),
    type: str(o.type, 40),
    salary: o.salary && o.salary !== 'None' ? str(o.salary, 100) : '',
    source: str(o.source, 60),
    url: /^https?:\/\//i.test(url) ? url : '',
  };
}

// La consigne commune des prompts (SECTION_A_PRECISER) termine le CV par
// « À PRÉCISER AVANT D'ENVOYER ». Cette partie s'adresse au candidat, pas au
// recruteur : elle ne doit ni partir dans le PDF ni être copiée avec le CV.
const TITRE_A_PRECISER = /^[\s#*_>\-—–=━]*[AÀ]\s+PR[EÉ]CISER\s+AVANT\s+D[’']ENVOYER\b.*$/im;

/** { cv, aPreciser } — aPreciser vide si l'IA a écrit « Rien à préciser ». */
export function separerAPreciser(texte = '') {
  const t = String(texte);
  const m = TITRE_A_PRECISER.exec(t);
  if (!m) return { cv: t.trim(), aPreciser: '' };
  const cv = t.slice(0, m.index).replace(/[\s━=\-—–]+$/, '').trim();
  let reste = t.slice(m.index + m[0].length).trim();
  if (/^[\s\-•*]*rien\s+[aà]\s+pr[eé]ciser\.?\s*$/i.test(reste)) reste = '';
  return { cv, aPreciser: reste };
}

const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Mots d'annonce qui n'apprennent rien sur le poste.
const VIDES = new Set((
  'avec dans pour vous nous votre notre leur leurs sont etre avoir plus tres aussi ' +
  'cette cela ainsi entre chez sous sans tout tous toute toutes elle elles ils lors ' +
  'poste postes profil profils mission missions entreprise societe equipe equipes ' +
  'candidat candidate candidats recherche recherchons rejoindre rejoignez offre offres ' +
  'emploi emplois contrat temps plein partiel salaire remuneration avantages experience ' +
  'experiences annee annees selon niveau minimum souhaite souhaitee requis requise ' +
  'description descriptif date lieu ville france paris cdi cdd interim stage alternance ' +
  'freelance mois semaine jour jours heure heures travail travailler cadre sein afin ' +
  'votre vos nos ses son sur une des les aux par que qui quoi dont the and for with ' +
  'you your our will are this that from have has job role team work'
).split(/\s+/));

const tokens = (s) => (sansAccent(s).match(/[a-z0-9][a-z0-9+#.]{2,}/g) || [])
  .map((t) => t.replace(/\.+$/, ''))
  .filter((t) => t.length >= 3 && !VIDES.has(t) && !/^\d+$/.test(t));

/**
 * Le vocabulaire de l'offre que le CV adapté reprend et que le profil
 * d'origine ne contenait pas. Calculé, pas demandé à l'IA : rien ici ne peut
 * affirmer un changement qui n'est pas dans le texte produit. Les mots sont
 * rendus avec la graphie de l'offre, du plus fréquent au moins fréquent.
 */
export function motsAjoutes(offreTexte = '', cv = '', profil = '', max = 8) {
  const dansCv = new Set(tokens(cv));
  const dansProfil = new Set(tokens(profil));
  const freq = new Map();
  const graphie = new Map();
  for (const brut of String(offreTexte).match(/[\p{L}0-9][\p{L}0-9+#.]{2,}/gu) || []) {
    const [t] = tokens(brut);
    if (!t || !dansCv.has(t) || dansProfil.has(t)) continue;
    freq.set(t, (freq.get(t) || 0) + 1);
    if (!graphie.has(t)) graphie.set(t, brut.replace(/\.+$/, ''));
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([t]) => graphie.get(t));
}

/** Nombre de marqueurs « [à compléter …] » laissés dans le CV. */
export function nbACompleter(texte = '') {
  return (String(texte).match(/\[\s*[aà]\s+compl[eé]ter[^\]]*\]/gi) || []).length;
}

/** Texte d'offre envoyé à la génération, et sur lequel on compare. */
export function texteOffre(o = {}, description = '') {
  return [
    o.title && `Poste : ${o.title}`,
    o.company && `Entreprise : ${o.company}`,
    o.location && `Lieu : ${o.location}`,
    o.type && `Contrat : ${o.type}`,
    description && `\n${String(description).slice(0, 7000)}`,
  ].filter(Boolean).join('\n');
}

/** Ajoute ou remplace (même offre) un prêt, le plus récent en tête, borné. */
export function ajouterPret(liste, pret) {
  const autres = (Array.isArray(liste) ? liste : []).filter((p) => !(pret.offre.id && p.offre?.id === pret.offre.id));
  return [pret, ...autres].slice(0, MAX_PRETS);
}
