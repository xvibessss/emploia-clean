// ── FRANCE TRAVAIL : OAuth2 client_credentials + Offres d'emploi v2 ─────────
//
// Pourquoi ce collecteur sort de `api/jobs.js`. Il y était écrit en ligne, donc
// intestable hors réseau : aucune sonde ne pouvait établir qu'il obtient un
// jeton, qu'il le renouvelle, ni qu'il nomme la bonne cause quand il échoue.
// C'est le seul collecteur du dépôt qui s'authentifie, et le seul dont la
// panne peut venir de TROIS endroits différents — la variable, le serveur
// d'autorisation, l'API elle-même. C'est précisément ce qui mérite d'être
// tenu par un test plutôt que par une relecture.
//
// CE QUE CE FICHIER SUPPOSE DE L'API, ET D'OÙ LA SUPPOSITION VIENT.
// Relevé le 2026-10-21 sur la documentation officielle (francetravail.io,
// « 4.1. Client Credentials ») et par appel réel au serveur d'autorisation.
// L'exemple de la documentation est reproduit ici à l'identique :
//
//   POST /connexion/oauth2/access_token?realm=%2Fpartenaire
//   Content-Type: application/x-www-form-urlencoded
//   Host: entreprise.francetravail.fr
//   grant_type=client_credentials&client_id=…&client_secret=…
//   &scope=api_offresdemploiv2 o2dsoffre
//
// Un appel avec des identifiants volontairement faux rend
// `{"error":"invalid_client"}` en HTTP 400 : l'hôte, le chemin, le realm, le
// `grant_type` et l'encodage du corps sont donc ceux qu'attend le serveur
// d'aujourd'hui — seuls les identifiants manquaient. L'ancien domaine
// `api.pole-emploi.io` résout encore mais ne répond plus (délai dépassé en
// 12 s), ce qui est la raison de ne pas y revenir.

export const TOKEN_URL =
  'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
export const RECHERCHE_URL =
  'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';

// Les deux scopes de l'exemple officiel, dans cet ordre. `api_offresdemploiv2`
// est le scope technique de l'API, `o2dsoffre` le scope applicatif des offres.
export const SCOPE = 'api_offresdemploiv2 o2dsoffre';

export const CLE_JETON = 'ft_token';

// LE POINT QUI AURAIT CASSÉ EN PRODUCTION. Le code d'origine mettait le jeton
// en cache 3300 s, sur un commentaire affirmant « FT tokens are valid for
// 3600s ». La documentation officielle ne dit nulle part 3600 : son unique
// valeur concrète est `"expires_in": 1499`, soit vingt-cinq minutes. Avec un
// cache de 55 min sur un jeton qui vit 25 min, la source aurait servi pendant
// la première demi-heure puis rendu `http_401` pendant la seconde — par
// intermittence, sans que rien ne nomme la cause, et sans que le cache se
// répare puisqu'il ne serait pas expiré.
//
// La correction n'est pas de remplacer un nombre en dur par un autre : c'est
// de LIRE `expires_in` dans la réponse et d'en déduire la durée du cache. Le
// serveur est seul à savoir combien de temps il honore son jeton ; s'il répond
// 3600 demain, le cache suit sans qu'on y touche.
export const MARGE_JETON_SECONDES = 120;  // rendre le jeton avant qu'il expire
export const TTL_JETON_PLANCHER = 60;     // jamais un cache plus court que ça
export const TTL_JETON_DEFAUT = 1200;     // si `expires_in` est absent ou illisible

export const TIMEOUT_JETON_MS = 7000;
export const TIMEOUT_RECHERCHE_MS = 10000;

export const OFFRES_PAR_PAGE = 10;
export const MAX_OFFRES = 8;

// Les codes de contrat que le filtre de l'interface sait demander à l'API.
// `stage` n'y est pas, et c'est la raison pour laquelle la source s'abstient
// sur ce filtre plutôt que de servir autre chose : le référentiel
// `typeContrat` de France Travail n'expose aucun code de stage, et répondre à
// une demande de stages par des CDD serait réécrire l'étiquette.
export const FILTRE_VERS_TYPE_CONTRAT = {
  cdi: 'CDI', cdd: 'CDD', alternance: 'CA,CP', freelance: 'LIB',
};
export const FILTRES_NON_SERVIS = new Set(['stage']);

// ── LES CAUSES, ET POURQUOI ELLES NE SE CONFONDENT PAS ──────────────────────
// Trois pannes, trois gestes différents de la part de celui qui exploite le
// site. C'est ça, et seulement ça, qui justifie trois jetons :
//
//   cle_absente            la variable n'est pas posée     → la poser dans Vercel
//   identifiants_refuses   elle est posée mais fausse      → la corriger
//   droits_insuffisants    elle est bonne, l'application
//                          n'est pas abonnée à l'API       → s'abonner sur
//                                                            francetravail.io
//
// Les deux derniers se ressemblent et n'ont rien à voir. La documentation
// officielle (« 4.9. Erreurs fréquentes ») les sépare explicitement :
// identifiant ou secret erroné rend `invalid_client`, un scope inconnu ou
// « pour lequel vous ne disposez pas des droits » rend `invalid_scope`. Les
// confondre enverrait chercher la panne dans le mauvais écran — exactement ce
// que `causesEnEchec` existe pour éviter.
//
// La table est FERMÉE, et c'est ce qui autorise à lire le corps de la réponse
// du serveur d'autorisation : seule la branche choisie sort d'ici, jamais le
// texte qui l'a choisie. Un `error` inconnu retombe sur `jeton_refuse`, le
// jeton générique d'origine — on ne reclasse rien au jugé.
const ERREUR_OAUTH_VERS_CAUSE = {
  invalid_client: 'identifiants_refuses',
  invalid_scope: 'droits_insuffisants',
};

function causeDErreurOAuth(corps) {
  const code = typeof corps?.error === 'string' ? corps.error : '';
  return ERREUR_OAUTH_VERS_CAUSE[code] || 'jeton_refuse';
}

// `expires_in` est un entier de secondes. Tout le reste — absent, négatif,
// chaîne vide, objet — vaut « je ne sais pas », et on retombe sur une valeur
// prudente plutôt que sur un cache dont la durée serait devinée.
export function ttlDepuisExpiration(expiresIn, defaut = TTL_JETON_DEFAUT) {
  const n = Number(expiresIn);
  if (!Number.isFinite(n) || n <= 0) return defaut;
  return Math.max(TTL_JETON_PLANCHER, Math.floor(n) - MARGE_JETON_SECONDES);
}

async function avecTimeout(fetchImpl, url, options, ms) {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetchImpl(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(minuteur);
  }
}

// ── OBTENTION DU JETON ──────────────────────────────────────────────────────
// Rend `{ jeton }` ou `{ cause }` — jamais `null` seul, parce qu'un `null`
// forçait l'appelant à inventer la cause et c'est comme ça que les trois
// pannes finissaient sous un même mot.
export async function obtenirJeton({
  clientId, clientSecret,
  fetchImpl = fetch,
  kvGet, kvSet,
  ignorerCache = false,
  timeout = TIMEOUT_JETON_MS,
} = {}) {
  if (!clientId || !clientSecret) return { cause: 'cle_absente' };

  if (!ignorerCache && kvGet) {
    const enCache = await kvGet(CLE_JETON).catch(() => null);
    if (typeof enCache === 'string' && enCache) return { jeton: enCache, depuisCache: true };
  }

  let res;
  try {
    res = await avecTimeout(fetchImpl, TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: SCOPE,
      }).toString(),
    }, timeout);
  } catch (e) {
    return { cause: e?.name === 'AbortError' ? 'timeout' : 'erreur_reseau' };
  }

  // Le corps d'une erreur OAuth est du JSON (`Content-Type: application/json`
  // d'après la documentation). S'il est illisible, on ne sait pas POURQUOI le
  // serveur a refusé : `jeton_refuse` est alors le mot juste, et non un des
  // deux jetons précis qu'on ne pourrait pas justifier.
  let corps = null;
  try { corps = await res.json(); } catch { corps = null; }

  if (!res.ok) return { cause: causeDErreurOAuth(corps) };

  const jeton = corps?.access_token;
  // 200 sans `access_token` : le serveur a répondu, mais pas ce qu'on attend.
  // Ce n'est ni un refus ni une panne réseau, et le dire autrement serait
  // envoyer chercher la panne du mauvais côté.
  if (typeof jeton !== 'string' || !jeton) return { cause: 'forme_inattendue' };

  const ttl = ttlDepuisExpiration(corps?.expires_in);
  if (kvSet) kvSet(CLE_JETON, jeton, ttl).catch(() => {});
  return { jeton, ttl };
}

// ── NORMALISATION D'UNE OFFRE ───────────────────────────────────────────────
// `contratFranceTravail` est injecté plutôt qu'importé : il vit dans
// `_lib/contrat.js` avec les mappeurs des huit autres sources, et le dupliquer
// ici ouvrirait deux chemins de lecture du contrat au lieu d'un.
export function normaliserOffre(j, { location, contrat }) {
  return {
    id: 'ft_' + j.id,
    title: j.intitule,
    company: j.entreprise?.nom || 'Confidentiel',
    location: j.lieuTravail?.libelle || location || 'France',
    // `typeContrat` est un code d'un référentiel fermé ; `typeContratLibelle`
    // est un libellé libre (« Contrat à durée indéterminée ») exact mais hors
    // du vocabulaire des cinq badges, donc illisible pour un filtre comme
    // pour `typeBadgeClass`. On lit le code.
    type: contrat(j),
    salary: j.salaire?.libelle || null,
    description: (j.description || '').slice(0, 300),
    url: `https://candidat.francetravail.fr/offres/recherche/detail/${j.id}`,
    date: j.dateCreation || new Date().toISOString(),
    remote: (j.lieuTravail?.libelle || '').toLowerCase().includes('télétravail'),
    source: 'France Travail',
    logo: null,
    country: 'FR',
  };
}

export function parametresDeRecherche(q, type, location, page) {
  const debut = page * OFFRES_PAR_PAGE;
  const motsCles = [q || 'emploi', location || ''].filter(Boolean).join(' ');
  const params = new URLSearchParams({
    motsCles,
    range: `${debut}-${debut + OFFRES_PAR_PAGE - 1}`,
    sort: '1',
  });
  const typeContrat = FILTRE_VERS_TYPE_CONTRAT[type];
  if (typeContrat) params.set('typeContrat', typeContrat);
  return params;
}

// ── COLLECTE ────────────────────────────────────────────────────────────────
// Rend `{ offres }`, ou `{ offres: [], cause, raison }` — la `raison` est
// riche et ne part que dans les journaux d'exécution, la `cause` est un jeton
// du vocabulaire fermé et c'est elle seule qui sort en réponse publique.
export async function collecterFranceTravail({
  q, type, location, page = 0,
  clientId, clientSecret,
  fetchImpl = fetch,
  kvGet, kvSet,
  contrat,
  timeout = TIMEOUT_RECHERCHE_MS,
} = {}) {
  if (FILTRES_NON_SERVIS.has(type)) {
    // Zéro offre, mais DÉCLARÉ. C'était un `return []` muet : sous le filtre
    // « stage », la source rendait zéro sans figurer dans `sourcesEnEchec`,
    // donc sans qu'on puisse distinguer « elle s'abstient » de « elle est
    // tombée ». Une abstention n'est pas un échec, mais elle n'est pas non
    // plus un silence.
    return {
      offres: [],
      cause: 'filtre_non_servi',
      raison: `filtre « ${type} » non exposé par le référentiel typeContrat`,
    };
  }

  const params = parametresDeRecherche(q, type, location, page);
  const url = `${RECHERCHE_URL}?${params}`;

  // Deux tentatives au plus, et la seconde seulement sur 401. POURQUOI :
  // le jeton vit en cache KV, et un cache survit à ce qui l'a rendu invalide
  // — un secret changé par l'exploitant, un jeton révoqué côté France Travail,
  // ou simplement un `expires_in` plus court que prévu. Sans ce second essai,
  // un jeton périmé en cache condamnait la source jusqu'à l'expiration de la
  // clé, en rendant `http_401` à chaque requête. La boucle se répare d'elle-
  // même en demandant un jeton neuf, cache ignoré.
  for (const tentative of [0, 1]) {
    const { jeton, cause: causeJeton } = await obtenirJeton({
      clientId, clientSecret, fetchImpl, kvGet, kvSet,
      ignorerCache: tentative === 1,
    });
    if (!jeton) {
      return { offres: [], cause: causeJeton, raison: `jeton indisponible (${causeJeton})` };
    }

    let res;
    try {
      res = await avecTimeout(fetchImpl, url, {
        headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json' },
      }, timeout);
    } catch (e) {
      return {
        offres: [],
        cause: e?.name === 'AbortError' ? 'timeout' : 'erreur_reseau',
        raison: e?.message || String(e),
      };
    }

    if (res.status === 401 && tentative === 0) continue;  // jeton périmé : on rejoue

    if (!res.ok) return { offres: [], cause: `http_${res.status}`, raison: `HTTP ${res.status}` };

    // 204 No Content : l'API a répondu, et sa réponse est « aucune offre ».
    // Le code d'origine appelait `.json()` dessus, ce qui jette sur un corps
    // vide et faisait ressortir une recherche sans résultat en
    // `reponse_illisible` — un faux échec. Je n'ai PAS pu confirmer, sans
    // identifiants, que l'API rend bien 204 dans ce cas ; le traiter coûte une
    // ligne et supprime la possibilité de ce faux échec.
    if (res.status === 204) return { offres: [] };

    let donnees;
    try {
      donnees = await res.json();
    } catch (e) {
      return { offres: [], cause: 'reponse_illisible', raison: e?.message || String(e) };
    }

    // 2xx, JSON valide, mais pas la forme attendue. C'était
    // `(data.resultats || [])` : zéro offre EN SILENCE, indistinguable d'une
    // recherche sans résultat. C'est la troisième panne — « l'API répond, mais
    // autrement que prévu » — et c'est celle qu'un changement de contrat
    // d'interface provoquerait. Elle a maintenant son mot.
    if (!Array.isArray(donnees?.resultats)) {
      return { offres: [], cause: 'forme_inattendue', raison: 'réponse 2xx sans tableau `resultats`' };
    }

    return {
      offres: donnees.resultats
        .slice(0, MAX_OFFRES)
        .map(j => normaliserOffre(j, { location, contrat })),
    };
  }

  // Les deux tentatives ont rendu 401 : le refus ne vient pas d'un jeton
  // périmé en cache, il est réel.
  return { offres: [], cause: 'http_401', raison: 'HTTP 401 après renouvellement du jeton' };
}
