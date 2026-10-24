// Sonde du collecteur France Travail.
//
// POURQUOI ELLE EXISTE. France Travail est la source publique française de
// référence, gratuite et sans plafond mensuel, et elle est muette en
// production depuis que le code existe : `cle_absente`, les deux variables
// FRANCE_TRAVAIL_CLIENT_ID / _SECRET n'étant pas posées dans Vercel. Le risque
// que cette sonde couvre n'est pas celui-là — c'est le SUIVANT : que les
// identifiants soient posés et que la source reste muette pour une deuxième
// raison, que personne n'avait vue parce qu'aucun test ne pouvait la voir.
//
// Le relevé du 2026-10-21 en a trouvé une, et c'est elle que le premier bloc
// garde : le code mettait le jeton en cache 3300 s sur un commentaire affirmant
// « FT tokens are valid for 3600s », quand la seule valeur concrète de la
// documentation officielle est `"expires_in": 1499` — vingt-cinq minutes. Un
// cache deux fois plus long que le jeton qu'il garde sert la moitié du temps et
// rend `http_401` l'autre moitié, par intermittence, sans que rien ne le nomme.
//
// Elle est hors ligne : `fetchImpl` et les deux accès KV sont injectés, aucune
// requête ne sort, aucune variable d'environnement n'est lue.
import {
  SCOPE, TOKEN_URL, RECHERCHE_URL, CLE_JETON,
  MARGE_JETON_SECONDES, TTL_JETON_PLANCHER, TTL_JETON_DEFAUT,
  FILTRE_VERS_TYPE_CONTRAT, FILTRES_NON_SERVIS, MAX_OFFRES, OFFRES_PAR_PAGE,
  ttlDepuisExpiration, parametresDeRecherche, obtenirJeton, collecterFranceTravail,
} from '../../api/_lib/france-travail.js';
import { contratFranceTravail, CONTRATS } from '../../api/_lib/contrat.js';

let passed = 0, failed = 0;
function check(label, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

// ── Outillage : un réseau et un KV de papier ────────────────────────────────
const reponse = (corps, { status = 200, ok } = {}) => ({
  ok: ok ?? (status >= 200 && status < 300),
  status,
  json: async () => {
    if (corps === undefined) throw new SyntaxError('Unexpected end of JSON input');
    return corps;
  },
});

// Un faux réseau qui répond selon l'URL appelée et consigne ce qu'il a reçu.
// Une valeur de plan peut être un tableau : la n-ième réponse sert au n-ième
// appel de cette étape, ce qui permet de jouer « 401 puis 200 ».
function reseau(plan) {
  const appels = [];
  const etapeDe = (url) => (String(url).startsWith(TOKEN_URL) ? 'jeton' : 'recherche');
  const fetchImpl = async (url, options) => {
    appels.push({ url: String(url), options });
    const cle = etapeDe(url);
    const rang = appels.filter(a => etapeDe(a.url) === cle).length - 1;
    const etape = plan[cle];
    const r = Array.isArray(etape) ? etape[rang] : etape;
    if (typeof r === 'function') return r();
    if (!r) throw new Error(`plan de test sans réponse pour ${cle} (appel ${rang + 1})`);
    return r;
  };
  return {
    fetchImpl, appels,
    jetons: () => appels.filter(a => etapeDe(a.url) === 'jeton'),
    recherches: () => appels.filter(a => etapeDe(a.url) === 'recherche'),
  };
}

function kvDePapier(initial = {}) {
  const boite = { ...initial };
  const ecritures = [];
  return {
    boite, ecritures,
    kvGet: async (k) => (k in boite ? boite[k] : null),
    kvSet: async (k, v, ttl) => { boite[k] = v; ecritures.push({ k, v, ttl }); },
  };
}

const JETON_OK = (expiresIn = 1499, jeton = 'JETON-DE-TEST') => reponse({
  scope: SCOPE, expires_in: expiresIn, token_type: 'Bearer', access_token: jeton,
});

const OFFRE = {
  id: '190ABCD', intitule: 'Développeur web (H/F)',
  entreprise: { nom: 'ACME' }, lieuTravail: { libelle: '75 - PARIS 11' },
  typeContrat: 'CDI', typeContratLibelle: 'Contrat à durée indéterminée',
  salaire: { libelle: 'Annuel de 40000,00 Euros sur 12 mois' },
  description: 'Une description.', dateCreation: '2026-10-20T08:00:00.000Z',
};

const collecter = (plan, extra = {}) => {
  const net = reseau(plan);
  return collecterFranceTravail({
    q: 'dev', clientId: 'ID', clientSecret: 'SECRET', fetchImpl: net.fetchImpl,
    contrat: contratFranceTravail, ...kvDePapier(), ...extra,
  }).then(r => ({ ...r, net }));
};

// ── 1. LA DURÉE DU CACHE EST LUE, PAS DEVINÉE ───────────────────────────────
// Le garde central de cette sonde. Il ne vérifie pas qu'un nombre est
// « raisonnable » : il vérifie que le nombre VIENT DE LA RÉPONSE. Un retour au
// 3300 s en dur, ou n'importe quelle constante supérieure à `expires_in`, fait
// rougir la CI au lieu de la production.
console.log('\n── [1] La durée du cache du jeton vient de `expires_in` ──');

check('expires_in=1499 (la valeur de la documentation) → cache plus court que le jeton',
  ttlDepuisExpiration(1499) === 1499 - MARGE_JETON_SECONDES,
  `${ttlDepuisExpiration(1499)} s < 1499 s`);
check('expires_in=3600 → le cache suit, sans qu’on touche au code',
  ttlDepuisExpiration(3600) === 3600 - MARGE_JETON_SECONDES,
  `${ttlDepuisExpiration(3600)} s`);
// La propriété qui compte, énoncée comme une propriété et non comme un nombre.
for (const vie of [60, 300, 1499, 1800, 3600, 7200]) {
  check(`le cache ne survit jamais au jeton (expires_in=${vie})`,
    ttlDepuisExpiration(vie) < vie || vie <= TTL_JETON_PLANCHER,
    `${ttlDepuisExpiration(vie)} s`);
}
check('expires_in absent → valeur prudente, pas une durée devinée',
  ttlDepuisExpiration(undefined) === TTL_JETON_DEFAUT, `${TTL_JETON_DEFAUT} s`);
for (const sale of [null, '', 'bientôt', -1, 0, NaN, {}, []]) {
  check(`expires_in illisible (${JSON.stringify(sale)}) → défaut prudent`,
    ttlDepuisExpiration(sale) === TTL_JETON_DEFAUT);
}
check('un expires_in minuscule reste au-dessus du plancher',
  ttlDepuisExpiration(5) === TTL_JETON_PLANCHER, `${TTL_JETON_PLANCHER} s`);

// Et le TTL réellement écrit en KV est bien celui-là.
{
  const kv = kvDePapier();
  const net = reseau({ jeton: JETON_OK(1499) });
  const { jeton, ttl } = await obtenirJeton({
    clientId: 'ID', clientSecret: 'SECRET', fetchImpl: net.fetchImpl, ...kv,
  });
  check('le jeton obtenu est celui de la réponse', jeton === 'JETON-DE-TEST');
  check('le TTL écrit en KV est dérivé de expires_in',
    kv.ecritures.length === 1 && kv.ecritures[0].ttl === 1499 - MARGE_JETON_SECONDES,
    `ttl=${kv.ecritures[0]?.ttl}`);
  check('il est écrit sous la clé attendue', kv.ecritures[0]?.k === CLE_JETON);
  check('le TTL rendu et le TTL écrit sont le même', ttl === kv.ecritures[0]?.ttl);
}

// ── 2. LA REQUÊTE DE JETON EST CELLE DE LA DOCUMENTATION ────────────────────
// Relevé le 2026-10-21 : l'exemple officiel de francetravail.io et un appel
// réel au serveur d'autorisation (qui rend `invalid_client` sur des
// identifiants faux, donc accepte la FORME de la requête).
console.log('\n── [2] La requête de jeton est conforme à la documentation ──');
// Les deux URL sont épinglées en littéral. L'ancien domaine `pole-emploi.io`
// résout encore mais ne répond plus (délai dépassé en 12 s au relevé du
// 2026-10-21) : un retour en arrière ne se verrait donc PAS comme un 404 mais
// comme un `timeout`, c'est-à-dire comme une panne réseau passagère. C'est
// précisément le genre de régression qu'un test doit refuser, pas diagnostiquer.
check('TOKEN_URL est le serveur d’autorisation francetravail.fr, realm encodé',
  TOKEN_URL === 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire',
  TOKEN_URL);
check('RECHERCHE_URL est l’API francetravail.io v2',
  RECHERCHE_URL === 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search',
  RECHERCHE_URL);
check('aucune URL ne pointe encore pole-emploi',
  !TOKEN_URL.includes('pole-emploi') && !RECHERCHE_URL.includes('pole-emploi'));
check('le scope déclaré est celui de l’exemple officiel',
  SCOPE === 'api_offresdemploiv2 o2dsoffre', SCOPE);
{
  const net = reseau({ jeton: JETON_OK() });
  await obtenirJeton({ clientId: 'MON-ID', clientSecret: 'MON-SECRET', fetchImpl: net.fetchImpl });
  const appel = net.jetons()[0];
  const corps = new URLSearchParams(appel.options.body);
  check('le realm est encodé dans l’URL du serveur d’autorisation',
    appel.url.includes('realm=%2Fpartenaire'));
  check('l’hôte est entreprise.francetravail.fr (et non pole-emploi.fr)',
    appel.url.startsWith('https://entreprise.francetravail.fr/connexion/oauth2/access_token'));
  check('la méthode est POST', appel.options.method === 'POST');
  check('le corps est urlencodé',
    appel.options.headers['Content-Type'] === 'application/x-www-form-urlencoded');
  check('grant_type=client_credentials', corps.get('grant_type') === 'client_credentials');
  check('les identifiants partent dans le CORPS, jamais dans l’URL',
    corps.get('client_id') === 'MON-ID' && corps.get('client_secret') === 'MON-SECRET' &&
    !appel.url.includes('MON-ID') && !appel.url.includes('MON-SECRET'));
  check('le scope est celui de l’exemple officiel',
    corps.get('scope') === 'api_offresdemploiv2 o2dsoffre', SCOPE);
}

// ── 3. LES CAUSES D’ÉCHEC NE SE DÉGUISENT PAS L’UNE EN L’AUTRE ──────────────
// Le cœur du sujet. Quatre situations, quatre gestes différents, donc quatre
// jetons — et la sonde vérifie qu'ils sont DISTINCTS deux à deux, pas seulement
// que chacun existe.
console.log('\n── [3] Les causes d’échec restent distinctes ──');

// (a) variable absente — et chaque variable manquante, séparément.
for (const [label, ids] of [
  ['les deux variables absentes', { clientId: undefined, clientSecret: undefined }],
  ['CLIENT_ID absent seul', { clientId: '', clientSecret: 'SECRET' }],
  ['CLIENT_SECRET absent seul', { clientId: 'ID', clientSecret: '' }],
]) {
  const r = await collecter({ jeton: JETON_OK() }, ids);
  check(`${label} → cle_absente`, r.cause === 'cle_absente', r.cause);
  check(`${label} : aucune requête n’est partie`, r.net.appels.length === 0);
}

// (b) identifiants refusés par le serveur d'autorisation. C'est la réponse
// EXACTE relevée le 2026-10-21 en appelant le vrai serveur avec de faux
// identifiants.
{
  const r = await collecter({
    jeton: reponse({ error: 'invalid_client', error_description: 'Client authentication failed' }, { status: 400 }),
  });
  check('identifiants refusés (invalid_client, HTTP 400) → identifiants_refuses',
    r.cause === 'identifiants_refuses', r.cause);
  check('… et surtout PAS cle_absente : la variable est posée, elle est fausse',
    r.cause !== 'cle_absente');
}

// (c) droits insuffisants : identifiants valides, application non abonnée à
// l'API. La documentation « 4.9. Erreurs fréquentes » le distingue
// explicitement du cas précédent, et le geste n'est pas le même — il faut
// s'abonner sur francetravail.io, pas corriger une variable.
{
  const r = await collecter({
    jeton: reponse({ error: 'invalid_scope', error_description: 'Unknown/invalid scope(s): [api_offresdemploiv2]' }, { status: 400 }),
  });
  check('scope refusé (invalid_scope, HTTP 400) → droits_insuffisants',
    r.cause === 'droits_insuffisants', r.cause);
  check('… et PAS identifiants_refuses : les identifiants sont bons',
    r.cause !== 'identifiants_refuses');
}

// (d) l'API répond, mais autrement que prévu.
{
  const r = await collecter({ jeton: JETON_OK(), recherche: reponse({ pasDuTout: 'ce qu’on attend' }) });
  check('2xx sans tableau `resultats` → forme_inattendue', r.cause === 'forme_inattendue', r.cause);
  check('… et PAS un zéro silencieux : la cause est publiée',
    r.cause !== undefined && r.offres.length === 0);
}
{
  const r = await collecter({ jeton: JETON_OK(), recherche: reponse({ resultats: 'pas un tableau' }) });
  check('`resultats` présent mais pas un tableau → forme_inattendue',
    r.cause === 'forme_inattendue', r.cause);
}
{
  const r = await collecter({ jeton: reponse({ expires_in: 1499, token_type: 'Bearer' }) });
  check('200 du serveur d’autorisation sans access_token → forme_inattendue',
    r.cause === 'forme_inattendue', r.cause);
}

// (e) les quatre sont bien quatre.
{
  const jetons = ['cle_absente', 'identifiants_refuses', 'droits_insuffisants', 'forme_inattendue'];
  check('les quatre causes sont distinctes deux à deux',
    new Set(jetons).size === jetons.length, jetons.join(' ≠ '));
}

// (f) un refus dont le serveur ne nomme pas la raison reste sous le jeton
// générique : on ne reclasse rien au jugé.
for (const [label, corps, status] of [
  ['un `error` inconnu', { error: 'une_erreur_inedite' }, 400],
  ['un corps sans `error`', {}, 400],
  ['un corps illisible', undefined, 400],
  ['un HTTP 500 du serveur d’autorisation', { error: null }, 500],
]) {
  const r = await collecter({ jeton: reponse(corps, { status }) });
  check(`${label} → jeton_refuse (le générique, pas un jeton précis injustifié)`,
    r.cause === 'jeton_refuse', r.cause);
}

// (g) les pannes de transport gardent leurs jetons d'origine.
{
  const abort = () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
  const r1 = await collecter({ jeton: abort });
  check('un délai dépassé sur le jeton → timeout', r1.cause === 'timeout', r1.cause);
  const r2 = await collecter({ jeton: () => { throw new TypeError('fetch failed'); } });
  check('une panne réseau sur le jeton → erreur_reseau', r2.cause === 'erreur_reseau', r2.cause);
  const r3 = await collecter({ jeton: JETON_OK(), recherche: abort });
  check('un délai dépassé sur la recherche → timeout', r3.cause === 'timeout', r3.cause);
  const r4 = await collecter({ jeton: JETON_OK(), recherche: () => { throw new TypeError('fetch failed'); } });
  check('une panne réseau sur la recherche → erreur_reseau', r4.cause === 'erreur_reseau', r4.cause);
}

// (h) un statut HTTP de l'API ressort tel quel, code écrit.
for (const status of [403, 429, 404, 500, 503]) {
  const r = await collecter({ jeton: JETON_OK(), recherche: reponse({}, { status }) });
  check(`HTTP ${status} de l’API → http_${status}`, r.cause === `http_${status}`, r.cause);
}

// (i) aucune cause ne laisse fuiter de texte amont. La propriété que
// `causesEnEchec` existe pour garantir, vérifiée ici sur la source qui porte
// un secret dans sa requête.
{
  const r = await collecter({
    jeton: reponse({ error: 'invalid_client', error_description: 'Client authentication failed pour MON-SECRET' }, { status: 400 }),
  });
  check('la cause ne contient ni le secret ni le texte du serveur',
    !/SECRET|authentication|MON/i.test(r.cause), r.cause);
  check('la cause est un jeton court et énuméré', /^[a-z_]+$|^http_\d{3}$/.test(r.cause), r.cause);
}

// ── 4. LE JETON SE RENOUVELLE, ET LE CACHE NE CONDAMNE PAS LA SOURCE ────────
// Un cache KV survit à ce qui a rendu son contenu invalide : un secret changé,
// un jeton révoqué, un `expires_in` plus court qu'annoncé. Sans second essai,
// un jeton périmé en cache rendait `http_401` à chaque requête jusqu'à
// l'expiration de la clé.
console.log('\n── [4] Renouvellement du jeton ──');
{
  const kv = kvDePapier();
  const net = reseau({ jeton: JETON_OK(), recherche: reponse({ resultats: [OFFRE] }) });
  await collecterFranceTravail({
    q: 'dev', clientId: 'ID', clientSecret: 'SECRET',
    fetchImpl: net.fetchImpl, contrat: contratFranceTravail, ...kv,
  });
  check('premier appel : un jeton est demandé puis mis en cache',
    net.jetons().length === 1 && kv.boite[CLE_JETON] === 'JETON-DE-TEST');
}
{
  // Jeton déjà en cache : aucun aller-retour au serveur d'autorisation.
  const kv = kvDePapier({ [CLE_JETON]: 'JETON-EN-CACHE' });
  const net = reseau({ recherche: reponse({ resultats: [OFFRE] }) });
  const r = await collecterFranceTravail({
    q: 'dev', clientId: 'ID', clientSecret: 'SECRET',
    fetchImpl: net.fetchImpl, contrat: contratFranceTravail, ...kv,
  });
  check('jeton en cache : le serveur d’autorisation n’est pas rappelé',
    net.jetons().length === 0);
  check('le jeton du cache est bien celui qui part en Authorization',
    net.recherches()[0].options.headers.Authorization === 'Bearer JETON-EN-CACHE');
  check('et la collecte aboutit', r.offres.length === 1 && !r.cause);
}
{
  // LE CAS QUI COMPTE : cache garni d'un jeton périmé.
  const kv = kvDePapier({ [CLE_JETON]: 'JETON-PERIME' });
  const net = reseau({
    jeton: JETON_OK(1499, 'JETON-NEUF'),
    recherche: [reponse({}, { status: 401 }), reponse({ resultats: [OFFRE] })],
  });
  const r = await collecterFranceTravail({
    q: 'dev', clientId: 'ID', clientSecret: 'SECRET',
    fetchImpl: net.fetchImpl, contrat: contratFranceTravail, ...kv,
  });
  check('401 sur un jeton de cache → un jeton neuf est demandé',
    net.jetons().length === 1, `${net.jetons().length} demande(s)`);
  check('… cache IGNORÉ pour ce second essai (sinon il rendrait le périmé)',
    net.recherches()[1]?.options.headers.Authorization === 'Bearer JETON-NEUF');
  check('… et la source sert au lieu de tomber',
    r.offres.length === 1 && !r.cause, r.cause || `${r.offres.length} offre(s)`);
  check('… le cache est réécrit avec le jeton neuf',
    kv.boite[CLE_JETON] === 'JETON-NEUF');
}
{
  // Un 401 qui persiste après renouvellement est un vrai refus : il ne doit
  // pas boucler, et il doit se nommer.
  const kv = kvDePapier({ [CLE_JETON]: 'JETON-PERIME' });
  const net = reseau({
    jeton: JETON_OK(1499, 'JETON-NEUF'),
    recherche: [reponse({}, { status: 401 }), reponse({}, { status: 401 })],
  });
  const r = await collecterFranceTravail({
    q: 'dev', clientId: 'ID', clientSecret: 'SECRET',
    fetchImpl: net.fetchImpl, contrat: contratFranceTravail, ...kv,
  });
  check('401 persistant → http_401, et pas un silence', r.cause === 'http_401', r.cause);
  check('… deux recherches au maximum : pas de boucle',
    net.recherches().length === 2, `${net.recherches().length} recherches`);
  check('… un seul renouvellement de jeton', net.jetons().length === 1);
}

// ── 5. UN ZÉRO LÉGITIME N’EST PAS UN ÉCHEC ──────────────────────────────────
console.log('\n── [5] Zéro offre ≠ panne ──');
{
  const r = await collecter({ jeton: JETON_OK(), recherche: reponse({ resultats: [] }) });
  check('une recherche sans résultat ne publie aucune cause',
    r.offres.length === 0 && r.cause === undefined, r.cause || 'aucune cause');
}
{
  // 204 No Content. Le code d'origine appelait `.json()` dessus, ce qui jette
  // sur un corps vide : une recherche sans résultat ressortait en
  // `reponse_illisible`, un faux échec.
  const r = await collecter({ jeton: JETON_OK(), recherche: reponse(undefined, { status: 204 }) });
  check('HTTP 204 (aucune offre) ne publie aucune cause',
    r.offres.length === 0 && r.cause === undefined, r.cause || 'aucune cause');
  check('… et surtout pas reponse_illisible', r.cause !== 'reponse_illisible');
}
{
  // Un 200 au corps illisible, lui, reste un vrai problème.
  const r = await collecter({ jeton: JETON_OK(), recherche: reponse(undefined, { status: 200 }) });
  check('HTTP 200 au corps illisible → reponse_illisible',
    r.cause === 'reponse_illisible', r.cause);
}
{
  // L'abstention sur un filtre que l'API n'expose pas. C'était un `return []`
  // muet : zéro offre sans figurer dans `sourcesEnEchec`.
  const r = await collecter({ jeton: JETON_OK(), recherche: reponse({ resultats: [OFFRE] }) }, { type: 'stage' });
  check('filtre « stage » → filtre_non_servi, déclaré au lieu d’être muet',
    r.cause === 'filtre_non_servi', r.cause);
  check('… et aucune requête n’est partie pour rien', r.net.appels.length === 0);
}

// ── 6. LA REQUÊTE DE RECHERCHE ──────────────────────────────────────────────
console.log('\n── [6] Paramètres de recherche ──');
{
  const p = parametresDeRecherche('développeur', 'cdi', 'Lyon', 0);
  check('les mots-clés joignent la requête et le lieu',
    p.get('motsCles') === 'développeur Lyon', p.get('motsCles'));
  check('la première page demande le range 0-9', p.get('range') === '0-9');
  check('le filtre cdi devient typeContrat=CDI', p.get('typeContrat') === 'CDI');
  const p2 = parametresDeRecherche('', '', '', 3);
  check('la page 3 demande le range 30-39', p2.get('range') === '30-39');
  check('sans requête, un mot-clé par défaut plutôt qu’un paramètre vide',
    p2.get('motsCles') === 'emploi');
  check('sans filtre, aucun typeContrat n’est envoyé', p2.get('typeContrat') === null);
  check('un filtre inconnu n’invente pas de code',
    parametresDeRecherche('x', 'temps-partiel', '', 0).get('typeContrat') === null);
  check('le range reste cohérent avec OFFRES_PAR_PAGE',
    p.get('range') === `0-${OFFRES_PAR_PAGE - 1}`);
}
{
  const net = reseau({ jeton: JETON_OK(), recherche: reponse({ resultats: Array(30).fill(OFFRE) }) });
  const r = await collecterFranceTravail({
    q: 'dev', clientId: 'ID', clientSecret: 'SECRET',
    fetchImpl: net.fetchImpl, contrat: contratFranceTravail, ...kvDePapier(),
  });
  // Écrit en littéral, PAS avec `RECHERCHE_URL` : une assertion qui compare la
  // constante à elle-même suit le code quand il se trompe. C'est une mutation
  // du collecteur vers l'ancien domaine qui l'a montré — elle passait au vert.
  check('la recherche part sur api.francetravail.io (et non api.pole-emploi.io)',
    net.recherches()[0].url.startsWith(
      'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?'));
  check('le jeton part en en-tête Bearer',
    net.recherches()[0].options.headers.Authorization === 'Bearer JETON-DE-TEST');
  check(`la page est bornée à ${MAX_OFFRES} offres`,
    r.offres.length === MAX_OFFRES, `${r.offres.length}`);
}

// ── 7. LES CODES DE CONTRAT VERS LE VOCABULAIRE FERMÉ ───────────────────────
// `typeContrat` est un code d'un référentiel fermé, `typeContratLibelle` un
// libellé libre. Lire le libellé donnait « Contrat à durée indéterminée », exact
// mais hors des cinq badges — donc illisible pour un filtre. On lit le code, et
// seulement les codes dont la correspondance est certaine.
console.log('\n── [7] Codes de contrat → vocabulaire fermé ──');
for (const [code, attendu] of [
  ['CDI', 'CDI'], ['DIN', 'CDI'],
  ['CDD', 'CDD'], ['CDS', 'CDD'], ['DDI', 'CDD'],
  ['CA', 'Alternance'], ['CP', 'Alternance'],
  ['LIB', 'Freelance'],
]) {
  const v = contratFranceTravail({ typeContrat: code, intitule: 'Poste' });
  check(`${code} → ${attendu}`, v === attendu, v);
  check(`… et ${attendu} est bien du vocabulaire fermé`, CONTRATS.has(v));
}
// Les codes SANS correspondance certaine valent `null` plutôt qu'un
// rapprochement commode : une mission intérimaire n'est aucun des cinq badges.
for (const code of ['MIS', 'SAI', 'FRA', 'CCE', 'REP', 'TTI', 'ZZZ', '']) {
  const v = contratFranceTravail({ typeContrat: code, intitule: 'Poste' });
  check(`${code || '(vide)'} sans correspondance certaine → null`, v === null, String(v));
}
check('le libellé libre n’est JAMAIS lu à la place du code',
  contratFranceTravail({ typeContrat: 'MIS', typeContratLibelle: 'Contrat à durée indéterminée', intitule: 'Poste' }) === null);
check('un typeContrat minuscule est quand même reconnu',
  contratFranceTravail({ typeContrat: 'cdi', intitule: 'Poste' }) === 'CDI');
check('un typeContrat entouré d’espaces est quand même reconnu',
  contratFranceTravail({ typeContrat: ' CDD ', intitule: 'Poste' }) === 'CDD');
check('typeContrat absent et intitulé muet → null, rien n’est inventé',
  contratFranceTravail({ intitule: 'Poste quelconque' }) === null);
// Chaque filtre que le collecteur sait demander doit correspondre à un code
// que le mappeur sait relire : sans ça, filtrer sur « alternance » rendrait des
// offres étiquetées `null`.
for (const [filtre, codes] of Object.entries(FILTRE_VERS_TYPE_CONTRAT)) {
  for (const code of codes.split(',')) {
    const v = contratFranceTravail({ typeContrat: code, intitule: 'Poste' });
    check(`le filtre « ${filtre} » demande ${code}, que le mappeur sait relire`,
      v !== null, `${code} → ${v}`);
  }
}
check('aucun filtre non servi ne figure aussi dans la table des codes',
  [...FILTRES_NON_SERVIS].every(f => !(f in FILTRE_VERS_TYPE_CONTRAT)));

// ── 8. LA NORMALISATION NE FABRIQUE RIEN ────────────────────────────────────
console.log('\n── [8] L’offre normalisée ──');
{
  const net = reseau({ jeton: JETON_OK(), recherche: reponse({ resultats: [OFFRE] }) });
  const { offres } = await collecterFranceTravail({
    q: 'dev', location: 'Lyon', clientId: 'ID', clientSecret: 'SECRET',
    fetchImpl: net.fetchImpl, contrat: contratFranceTravail, ...kvDePapier(),
  });
  const o = offres[0];
  check('l’identifiant est préfixé par la source', o.id === 'ft_190ABCD');
  check('le contrat est lu depuis le code', o.type === 'CDI');
  check('l’URL pointe la fiche candidat de l’offre',
    o.url === 'https://candidat.francetravail.fr/offres/recherche/detail/190ABCD');
  check('la source est nommée', o.source === 'France Travail');
  check('le pays est la France', o.country === 'FR');
  check('le salaire publié est repris tel quel',
    o.salary === 'Annuel de 40000,00 Euros sur 12 mois');
}
{
  // Une offre pauvre : rien ne doit être inventé pour combler.
  const net = reseau({ jeton: JETON_OK(), recherche: reponse({ resultats: [{ id: 'X1', intitule: 'Poste' }] }) });
  const { offres } = await collecterFranceTravail({
    q: 'dev', clientId: 'ID', clientSecret: 'SECRET',
    fetchImpl: net.fetchImpl, contrat: contratFranceTravail, ...kvDePapier(),
  });
  const o = offres[0];
  check('sans entreprise nommée → « Confidentiel », pas un nom fabriqué',
    o.company === 'Confidentiel');
  check('sans salaire → null, pas une estimation', o.salary === null);
  check('sans typeContrat ni indice d’intitulé → type null', o.type === null);
  check('sans lieu → « France », pas une ville choisie au hasard',
    o.location === 'France');
}

if (failed) { console.error(`\n❌ sonde France Travail : ${failed} échec(s)\n`); process.exit(1); }
console.log(`\n✅ sonde France Travail : ${passed} vérifications OK\n`);
