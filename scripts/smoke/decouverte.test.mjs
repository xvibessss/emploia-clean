// Sonde de l'outil de découverte des boards (`scripts/ats/decouvrir.mjs`).
//
// Hors ligne : le réseau est injecté, les collecteurs sont les VRAIS — ceux du
// registre `FOURNISSEURS`. C'est le point de l'outil : un verdict « fr » doit
// vouloir dire « le cron retiendrait ces offres comme françaises », pas « une
// requête a répondu 200 ».
import { FOURNISSEURS } from '../../api/_lib/ats.js';
import { slugsCandidats, lireArgument, decouvrir, ligneDeCatalogue, injoignable } from '../ats/decouvrir.mjs';

let passed = 0, failed = 0;
function check(label, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const reponse = (status, corps) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => corps, text: async () => JSON.stringify(corps),
});
const offreGH = (id, lieu) => ({
  id, title: `Poste ${id}`, location: { name: lieu },
  absolute_url: `https://exemple.test/${id}`, updated_at: '2026-11-01T00:00:00Z', content: '',
});

// Un faux Internet : deux boards Greenhouse, un board Lever vide, et 404
// partout ailleurs. Chaque URL demandée est consignée.
const demandes = [];
function reseau(url) {
  demandes.push(url);
  if (url.includes('boards-api.greenhouse.io/v1/boards/acme/')) return reponse(200, { jobs: [offreGH(1, 'Paris, France'), offreGH(2, 'Lyon, France')] });
  if (url.includes('boards-api.greenhouse.io/v1/boards/globex/')) return reponse(200, { jobs: [offreGH(3, 'Berlin, Germany')] });
  if (url.includes('boards-api.greenhouse.io/v1/boards/doctolib/')) return reponse(200, { jobs: [offreGH(4, 'Paris, France')] });
  if (url.includes('api.lever.co/v0/postings/acme')) return reponse(200, []);
  return reponse(404, { message: 'Not found' });
}
const fetchImpl = async (url) => reseau(String(url));

// ── 1. LES SLUGS ─────────────────────────────────────────────────────────────
console.log('\n── Slugs candidats ──');
const bm = slugsCandidats('Back Market');
check('« Back Market » → backmarket et back-market', bm.join() === 'backmarket,back-market', bm.join(', '));
const gb = slugsCandidats('Groupe Barrière');
check('« Groupe Barrière » → les accents tombent, et une variante sans « groupe »',
  gb.includes('groupebarriere') && gb.includes('barriere'), gb.join(', '));
check('un nom d’un seul mot ne produit qu’un slug', slugsCandidats('Pennylane').join() === 'pennylane');
check('un nom vide ne produit aucun slug', slugsCandidats('  ').length === 0);
const explicite = lireArgument('Groupe SEB=groupeseb,seb');
check('« Nom=slug1,slug2 » remplace les variantes par les slugs donnés',
  explicite.nom === 'Groupe SEB' && explicite.slugs.join() === 'groupeseb,seb');

// ── 2. LES VERDICTS, À TRAVERS LES VRAIS COLLECTEURS ────────────────────────
console.log('\n── Verdicts ──');
const acme = await decouvrir('Acme', { fetchImpl });
const parAts = Object.fromEntries(acme.lignes.map(l => [l.ats, l]));
check('chaque ATS du registre est essayé, sans liste recopiée',
  acme.lignes.length === FOURNISSEURS.length && FOURNISSEURS.every(f => parAts[f.nom]),
  acme.lignes.map(l => l.ats).join(', '));
check('Greenhouse porte deux offres en France → verdict « fr »',
  parAts.Greenhouse?.verdict === 'fr' && parAts.Greenhouse.fr === 2, JSON.stringify(parAts.Greenhouse));
check('Lever répond 200 sans offre → « vide », pas « fr » : le contenu décide, pas le code',
  parAts.Lever?.verdict === 'vide' && parAts.Lever.echec === null);
check('Ashby répond 404 → « absent », avec la cause du collecteur',
  parAts.Ashby?.verdict === 'absent' && parAts.Ashby.echec === 'http_404', parAts.Ashby?.echec);

const globex = await decouvrir('Globex', { fetchImpl });
const ghGlobex = globex.lignes.find(l => l.ats === 'Greenhouse');
check('des offres hors de France → « etranger », pas un candidat',
  ghGlobex?.verdict === 'etranger' && ghGlobex.offres === 1 && ghGlobex.fr === 0);

// ── 3. L'ARRÊT AU PREMIER SLUG QUI PORTE, ET LE CATALOGUE ───────────────────
console.log('\n── Slugs et catalogue ──');
demandes.length = 0;
const ordre = await decouvrir('Acme', { slugs: ['inconnu', 'acme', 'jamais'], fetchImpl });
const ghOrdre = ordre.lignes.find(l => l.ats === 'Greenhouse');
const ghDemandes = demandes.filter(u => u.includes('greenhouse'));
check('le slug qui porte des offres est retenu, après ceux qui échouent',
  ghOrdre?.slug === 'acme' && ghOrdre.verdict === 'fr');
check('on s’arrête au premier slug qui porte des offres — « jamais » n’est pas appelé',
  ghDemandes.length === 2 && !ghDemandes.some(u => u.includes('/jamais/')), `${ghDemandes.length} appel(s) Greenhouse`);

const doctolib = await decouvrir('Doctolib', { slugs: ['doctolib'], fetchImpl });
check('un board déjà au catalogue est signalé comme tel',
  doctolib.lignes.find(l => l.ats === 'Greenhouse')?.dejaAuCatalogue === true);
check('… et un board nouveau ne l’est pas', parAts.Greenhouse?.dejaAuCatalogue === false);

// ── 4. UN RÉSEAU MUET N'EST PAS UNE ABSENCE ────────────────────────────────
console.log('\n── Réseau muet ──');
const coupe = await decouvrir('Acme', { fetchImpl: async () => { throw new TypeError('fetch failed'); } });
check('sans réseau, chaque ATS est « injoignable », pas simplement absent',
  coupe.lignes.length === FOURNISSEURS.length && coupe.lignes.every(injoignable),
  coupe.lignes.map(l => l.echec).join(', '));
check('un vrai 404 n’est pas « injoignable » — c’est une absence constatée',
  !injoignable(parAts.Ashby));

// ── 5. LA LIGNE À COLLER ────────────────────────────────────────────────────
console.log('\n── Ligne de catalogue ──');
const ligne = ligneDeCatalogue({ slug: 'loreal', fr: 12 }, "L'Oréal");
check('la ligne a la forme des catalogues, apostrophe échappée',
  ligne === "{ board: 'loreal', company: 'L\\'Oréal', offresFR: 12 },", ligne);

if (failed) { console.error(`\n❌ sonde de découverte : ${failed} échec(s) sur ${passed + failed}\n`); process.exit(1); }
console.log(`\n✅ sonde de découverte : ${passed} vérifications OK\n`);
