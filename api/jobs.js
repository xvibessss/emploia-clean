import { checkRateLimit, kvGet, kvSet, withTimeout } from './_lib/auth.js';
// Les bornes du réservoir RapidAPI sont DÉCLARÉES dans `_lib/rapidapi.js`, pas
// dans le cron qui le remplit : un handler ne doit pas importer un cron pour
// savoir au bout de combien de temps une collecte est périmée.
import { CLE_KV as CLE_RAPIDAPI, AGE_MAX_SECONDES } from './_lib/rapidapi.js';
import { collecterFranceTravail } from './_lib/france-travail.js';
// La règle de lecture de la balise ATS vit dans `_lib/ats.js`, à côté de la
// règle qui l'écrit : deux moitiés d'une même convention ne doivent pas
// pouvoir diverger.
import { CLE_BALISE as CLE_BALISE_ATS, causeDepuisBalise } from './_lib/ats-balise.js';
import { isJobLive, toPublicJob } from './_lib/employer.js';
// Toute transformation d'une donnée amont en type de contrat vit dans
// `_lib/contrat.js`, pour que l'agrégateur et les alertes email lisent la même
// notion de la même façon. La règle y est écrite une fois : ce qu'on
// reconnaît, on le cartographie ; tout le reste vaut `null`.
import {
  FILTRE_VERS_CONTRAT, detectType,
  contratAdzuna, tempsAdzuna, contratArbeitnow, tempsArbeitnow,
  contratFranceTravail,
  contratPublic, formaterSalaireAnnuel, estSalaireEstime,
} from './_lib/contrat.js';

// Runtime Edge, épinglé sur Paris. Le corps de ce handler est écrit pour
// l'API Web (req.headers.get, new URL(req.url), new Response) : en runtime
// Node, req.headers est un objet simple et le handler meurt sur sa deuxième
// ligne. Le commit 0a40c4b avait retiré ce bloc pour « restaurer l'accès à
// process.env » — motif infondé, process.env est lisible en Edge sur Vercel,
// comme le font les 66 autres handlers Edge du projet.
export const config = { runtime: 'edge', regions: ['cdg1'] };

const H = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString(); }

// ── FILTRE DE CONTRAT ─────────────────────────────────
// Il n'en existait aucun. `?type=cdd` était propagé en amont par trois
// collecteurs sur huit, ignoré par les cinq autres, et le seul filtre appliqué
// après la fusion était `remoteOnly` : le candidat recevait des offres non
// filtrées, puis `detectType` les réétiquetait toutes « CDD » pour faire
// croire qu'elles l'étaient. Le point B n'était donc pas « le filtre n'est pas
// propagé », c'était « le filtre n'est appliqué nulle part, et l'étiquette est
// réécrite pour faire croire qu'il l'a été ».
//
// Retirer la réécriture seule aurait laissé le filtre sans effet — d'où ce
// filtre, appliqué après réception, sur la donnée réelle.
//
// Une offre au contrat inconnu (`type === null`) est ÉCARTÉE sous filtre. Elle
// n'est pas connue pour être un CDD ; la montrer en réponse à « CDD » serait la
// même affirmation sans preuve, simplement plus discrète.
//
// Et contrairement au filtre de pertinence, ce filtre n'a pas de repli « plutôt
// que du vide » : les 86 pages SEO n'envoient jamais `type`, donc seul
// l'utilisateur qui a explicitement demandé un contrat peut vider sa liste — et
// /jobs a un état « Aucune offre trouvée » avec un bouton de réinitialisation.
// Servir des CDI à qui demande des CDD serait le défaut d'origine, en silence.
// `ecartees` et `sansContrat` ne partent PAS qu'en journal. Un `console.error`
// ne vit que dans les journaux Vercel, dont la rétention est d'une heure sur le
// plan Hobby : c'est exactement le défaut que `causesEnEchec` vient de
// corriger pour les sources en échec, et le reproduire ici serait reculer.
// Ils entrent dans la réponse HTTP, pour que la couverture soit lisible par
// l'interface et par la sonde au lieu d'être devinée.
function filtrerContrat(jobs, type) {
  const vise = FILTRE_VERS_CONTRAT[type];
  // Hors filtre, la couverture reste mesurable : `sansContrat` compte les
  // offres au contrat inconnu même quand rien n'est écarté. C'est le chiffre
  // qui dira si la lecture des champs amont progresse ou se dégrade, et il
  // n'existerait pas si on ne le comptait que sous filtre.
  if (!vise) return { jobs, ecartees: 0, sansContrat: jobs.filter(j => !j.type).length, vise: null };
  const gardees = jobs.filter(j => j.type === vise);
  return {
    jobs: gardees,
    ecartees: jobs.length - gardees.length,
    sansContrat: jobs.filter(j => !j.type).length,
    vise,
  };
}

function isGermanJob(title, desc) {
  const t = (title || '').toLowerCase();
  const d = (desc || '').toLowerCase();
  return t.includes('(m/w/d)') || t.includes('(w/m/d)') || t.includes('minijob') ||
         t.includes('werkstudent') || t.includes('nebenjob') ||
         d.startsWith('das ') || d.startsWith('wir ') || d.includes(' deutsch');
}

// ── JSEARCH (Indeed + LinkedIn + Glassdoor) ───────────
// Une source indisponible ne doit pas faire tomber la recherche : les huit
// autres ont des offres à rendre. Mais elle ne doit plus tomber en silence.
// Chaque échec se terminait par un `return []` nu, si bien que trois des huit
// sources n'ont rien renvoyé pendant des mois sans que rien ne le signale —
// la réponse était 200, la page affichait des offres, et il en manquait les
// deux tiers. Le journal est créé par requête et traverse les collecteurs :
// pas de variable de module, qui serait partagée entre requêtes concurrentes.
function muet(journal, source, raison, cause) {
  journal?.push({ source, raison, cause: cause || borner_cause(raison) });
  return [];
}

// ── CAUSES BORNÉES ────────────────────────────────────
// `raison` est riche et part dans les logs d'exécution ; elle ne peut pas
// entrer dans la réponse publique, parce qu'un `e.message` de fetch peut
// porter une URL complète — donc une clé d'API en clair. C'est la décision
// d'origine, et elle est bonne.
//
// Mais ne rien exposer rend la sonde aveugle : il faut lire les journaux
// Vercel pour savoir si une source est en 429 ou sans clé, et sur le plan
// Hobby la rétention est d'une heure. Une panne de nuit est indiagnosticable
// au matin.
//
// D'où une cause ÉNUMÉRÉE. Un code de statut HTTP est un entier à trois
// chiffres : il ne peut rien divulguer. Les autres cas se réduisent à un jeton
// d'un ensemble fermé. Rien de ce qui sort d'ici ne dépend du contenu d'un
// message d'exception ou d'un corps de réponse amont.
// `collecte_absente` est le jeton du collecteur Greenhouse, et il dit une
// chose que les autres ne savaient pas dire : la source n'a pas échoué, elle
// n'a RIEN À LIRE. Sa clé KV est remplie par `api/cron/collect-ats` et
// expire au bout de 72 h ; absente, c'est que le cron quotidien n'a pas tourné
// depuis trois jours. Réutiliser `cle_absente` se serait lu « il manque une
// variable d'environnement » et aurait envoyé chercher la panne au mauvais
// endroit.
//
// `quota_epuise` est le jeton des deux sources RapidAPI, et il dit ce
// qu'aucun autre ne savait dire : la collecte a bien eu lieu, le fournisseur
// l'a REFUSÉE faute de quota mensuel. Les trois lectures possibles d'un
// réservoir vide appellent trois actions différentes, et c'est pourquoi elles
// ne partagent pas un jeton :
//
//   collecte_absente  le cron n'a pas tourné    → regarder les crons Vercel
//   quota_epuise      le plan est épuisé        → décision d'abonnement
//   cle_absente       RAPIDAPI_KEY non posée    → poser la variable
//
// Avant cette PR, le symptôme public était `http_429` — exact, mais rendu une
// fois par requête utilisateur, et sans dire que la cause était un plafond
// MENSUEL plutôt qu'un pic de trafic. Le mesurer a pris une sonde dédiée ;
// `quota_epuise` le dit en un mot.
// `identifiants_refuses`, `droits_insuffisants`, `forme_inattendue` et
// `filtre_non_servi` sont les jetons de France Travail, la seule source qui
// s'authentifie. Elle rendait `cle_absente`, et derrière cette unique cause se
// cachaient quatre situations qui n'appellent pas le même geste :
//
//   cle_absente           la variable n'est pas posée  → la poser dans Vercel
//   identifiants_refuses  posée mais fausse            → la corriger
//   droits_insuffisants   bonne, mais l'application
//                         n'est pas abonnée à l'API    → s'abonner sur
//                                                        francetravail.io
//   forme_inattendue      l'API répond 2xx sans la
//                         forme attendue               → relire son contrat
//
// Les deux du milieu sont ceux qui comptent, parce que ce sont les deux qu'on
// confond : la documentation de France Travail sépare `invalid_client`
// (identifiant ou secret erroné) de `invalid_scope` (« scope pour lequel vous
// ne disposez pas des droits »), et le second se produit avec des identifiants
// parfaitement valides. Sous un jeton commun, on revérifierait ses variables
// pendant que la panne serait un abonnement manquant.
//
// `forme_inattendue` remplace un silence, pas une autre cause : le code lisait
// `(data.resultats || [])`, donc une réponse dont la forme aurait changé
// rendait zéro offre sans figurer nulle part. `filtre_non_servi` remplace
// l'autre silence, le `return []` muet sous le filtre « stage ». Ni l'un ni
// l'autre n'est un échec de l'API — ce sont des zéros DÉCLARÉS, et c'est toute
// la différence avec un zéro.
// `collecte_en_echec` est le dernier jeton de la famille des réservoirs, et il
// comble le trou que JSearch a révélé le 2026-10-22. Les quatre se lisent
// maintenant comme quatre gestes, et c'est la seule raison pour laquelle ils
// sont quatre :
//
//   collecte_absente    le cron n'a pas tourné        → les crons Vercel
//   collecte_en_echec   il a tourné, l'API a mal
//                       répondu sur TOUS ses appels   → le fournisseur
//   quota_epuise        il a tourné, le plafond a
//                       refusé                        → décision d'abonnement
//   cle_absente         RAPIDAPI_KEY non posée        → poser la variable
//
// Les trois derniers se présentaient en `collecte_absente`, parce que le cron
// n'écrivait pas sa clé quand la collecte ne ramenait rien : sans clé, pas
// d'entrée, et sans entrée la lecture n'a qu'un mot. On cherchait la panne du
// côté des crons pendant qu'elle était ailleurs.
const CAUSES = new Set(['cle_absente', 'collecte_absente', 'collecte_en_echec', 'quota_epuise', 'timeout', 'reponse_illisible', 'jeton_refuse', 'identifiants_refuses', 'droits_insuffisants', 'forme_inattendue', 'filtre_non_servi', 'erreur_reseau', 'inconnue']);

// Déduit un jeton d'une raison libre, pour les `catch` qui n'en déclarent pas.
// Le test porte sur la forme du message, jamais sur son contenu : seule la
// branche choisie sort d'ici, pas le texte qui l'a choisie.
function borner_cause(raison) {
  const r = String(raison || '').trim().toLowerCase();
  if (r.includes('clé absente') || r.includes('clés absentes')) return 'cle_absente';
  if (r.includes('timeout') || r.includes('aborted') || r.includes('délai')) return 'timeout';
  if (r.includes('json') || r.includes('unexpected token')) return 'reponse_illisible';
  if (r.includes('jeton oauth')) return 'jeton_refuse';
  // Le test porte sur `r`, en minuscules : les sites d'échec écrivent
  // « HTTP 429 », et un `/^http /` appliqué au texte d'origine ne l'attrapait
  // pas — la cause la plus utile de toutes (le quota de French Job Market)
  // ressortait en `inconnue`. C'est la sonde qui l'a relevé.
  const http = /^http (\d{3})$/.exec(r);
  if (http) return `http_${http[1]}`;
  if (r.includes('fetch') || r.includes('network') || r.includes('econn') ||
      r.includes('enotfound') || r.includes('dns')) return 'erreur_reseau';
  return 'inconnue';
}

// Dernier verrou avant la réponse. Un appelant distrait — ou un collecteur
// ajouté dans six mois — ne peut pas faire fuiter un message en le passant
// comme `cause` : ce qui n'est ni un `http_NNN` ni un jeton du vocabulaire
// devient `inconnue`. La garantie ne repose pas sur la discipline des 22 sites
// d'échec, elle est appliquée ici, en un seul endroit.
function causePublique(cause) {
  const c = String(cause || '');
  if (/^http_\d{3}$/.test(c)) return c;
  return CAUSES.has(c) ? c : 'inconnue';
}

async function fetchJSearch(q, type, location, page, journal, reservoir) {
  const cause = causeReservoir(reservoir?.jsearch, 'jsearch');
  if (cause) return muet(journal, 'JSearch', `réservoir jsearch indisponible (${cause})`, cause);
  return servirReservoir(reservoir.jsearch.offres, q, type, location, page);
}

// ── FRENCH JOB MARKET (APEC + HelloWork + Free-Work) ─
async function fetchFrenchMarket(q, type, location, page, journal, reservoir) {
  const cause = causeReservoir(reservoir?.frenchmarket, 'frenchmarket');
  if (cause) return muet(journal, 'French Job Market', `réservoir frenchmarket indisponible (${cause})`, cause);
  return servirReservoir(reservoir.frenchmarket.offres, q, type, location, page);
}

// ── INTERNSHIPS : SOURCE RETIRÉE ────────────────────────────────────────────
// Il y avait ici un neuvième collecteur, appelant
// `internships-api.p.rapidapi.com/active-jb-7d`. Il rendait `http_404` en
// production, et ce n'était ni un chemin mal construit ni un abonnement à
// renouveler : la fiche RapidAPI de l'API porte, relevée le 2026-10-21, la
// mention « This API is no longer available » et l'avis du fournisseur
// « This API is deprecated and will no longer serve jobs starting August 3rd
// 2026 ». L'API est retirée depuis deux mois et demi ; aucune correction de
// code ne la ramène.
//
// Fantastic.jobs redirige vers deux remplaçantes payantes au même quota
// partagé. Elles n'ont pas été reprises, et le chiffre le dit mieux qu'un
// argument : ce collecteur était borné à `.slice(0, 10)`, soit DIX offres de
// stage au maximum, là où le collecteur Greenhouse de la PR #99 ramène 6 484
// offres crawlées en direct sur les ATS d'employeurs, sans clé et sans quota —
// la même nature de donnée (pages carrière), gratuite. Rouvrir un abonnement
// pour dix offres aurait ajouté de la pression sur le quota qui fait tomber
// JSearch et French Job Market, en échange de ce qu'on obtient déjà.

// ── REMOTIVE ──────────────────────────────────────────
async function fetchRemotive(q, type, journal) {
  if (type && ['stage', 'alternance', 'cdd'].includes(type)) return [];
  try {
    const res = await withTimeout(
      fetch(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q||'developer engineer manager')}&limit=8`),
      8000
    );
    if (!res.ok) return muet(journal, 'Remotive', `HTTP ${res.status}`, `http_${res.status}`);
    const data = await res.json();
    return (data.jobs || [])
      .filter(j => {
        const loc = (j.candidate_required_location || '').toLowerCase();
        return !loc || loc.includes('worldwide') || loc.includes('europe') ||
               loc.includes('france') || loc.includes('eu') || loc.includes('global');
      })
      .slice(0, 6)
      .map(j => ({
        id: 'rm_' + j.id,
        title: j.title,
        company: j.company_name || 'Confidentiel',
        location: 'Remote · ' + (j.candidate_required_location || 'Worldwide'),
        // `'Remote'` n'est pas un contrat : c'est un mode de travail, déjà
        // porté par le champ `remote` et par le badge « Remote » de la carte.
        // L'écrire dans `type` ajoutait une sixième valeur à un champ qui en a
        // cinq, et répondait à une question qu'on n'avait pas posée — même
        // faute de catégorie que `full_time → CDI`. Remotive ne publie aucun
        // champ de contrat ; il reste le titre, et `null` s'il est muet.
        type: contratPublic(detectType(j.title)),
        salary: j.salary || null,
        description: (j.description || '').replace(/<[^>]*>/g, '').slice(0, 300),
        url: j.url,
        date: j.publication_date || new Date().toISOString(),
        remote: true,
        source: 'Remotive',
        logo: j.company_logo_url || null,
        country: 'REMOTE',
      }));
  } catch (e) { return muet(journal, 'Remotive', e.message || String(e)); }
}

// ── ARBEITNOW ─────────────────────────────────────────
async function fetchArbeitnow(q, type, page, journal) {
  if (type && ['stage', 'alternance'].includes(type)) return [];
  try {
    const params = new URLSearchParams({ page: String(page + 1) });
    if (q) params.set('search', q);
    const res = await withTimeout(
      fetch(`https://www.arbeitnow.com/api/job-board-api?${params}`), 7000
    );
    if (!res.ok) return muet(journal, 'Arbeitnow', `HTTP ${res.status}`, `http_${res.status}`);
    const data = await res.json();
    return (data.data || [])
      .filter(j => {
        const loc = (j.location || '').toLowerCase();
        return (loc.includes('france') || loc.includes('paris') ||
                (j.remote && !isGermanJob(j.title, j.description)));
      })
      .slice(0, 5)
      .map(j => ({
        id: 'ab_' + j.slug,
        title: j.title,
        company: j.company_name || 'Confidentiel',
        location: j.remote ? 'Remote · EU' : j.location || 'Europe',
        // `job_types` est le champ de contrat d'Arbeitnow. Le dépôt le lisait
        // déjà dans `api/cron/send-alerts.js` — et pas ici, où le contrat était
        // deviné depuis le titre. Zéro occurrence dans ce fichier avant ce
        // commit.
        type: contratArbeitnow(j),
        workTime: tempsArbeitnow(j),
        salary: null,
        description: (j.description || '').replace(/<[^>]*>/g, '').slice(0, 300),
        url: j.url,
        date: j.created_at ? new Date(j.created_at * 1000).toISOString() : new Date().toISOString(),
        remote: j.remote || false,
        source: 'Arbeitnow',
        logo: j.company_logo || null,
        country: j.remote ? 'REMOTE' : 'FR',
      }));
  } catch (e) { return muet(journal, 'Arbeitnow', e.message || String(e)); }
}

// ── ADZUNA ────────────────────────────────────────────
async function fetchAdzuna(q, type, location, page, journal) {
  if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) return muet(journal, 'Adzuna', 'clés absentes : ADZUNA_APP_ID / ADZUNA_APP_KEY', 'cle_absente');
  try {
    // Adzuna prend la page dans le chemin, pas en paramètre. L'ancien appel
    // envoyait `page=N` à côté d'un chemin figé sur `/search/1` : la pagination
    // ne bougeait jamais, toutes les pages rendaient la première.
    const params = new URLSearchParams({
      app_id: process.env.ADZUNA_APP_ID,
      app_key: process.env.ADZUNA_APP_KEY,
      results_per_page: '10',
      what: [q, type==='stage'?'stage':type==='alternance'?'alternance':''].filter(Boolean).join(' ') || 'emploi',
      sort_by: 'date',
    });
    // `where` attend un lieu à l'intérieur du pays, pas le pays lui-même :
    // l'endpoint est déjà `/jobs/fr/`. Envoyer « France » est la cause la plus
    // probable du HTTP 400 observé — une clé invalide donnerait 401 AUTH_FAIL,
    // vérifié. Sans lieu, on ne met donc rien et la recherche porte sur le pays.
    if (location) params.set('where', location);
    // Le filtre de contrat n'était propagé que pour `stage` et `alternance`,
    // et par mots ajoutés à `what` — donc rien pour `cdd` ni pour `cdi`. La
    // documentation du point d'entrée `search` montre des filtres en DRAPEAU
    // (`permanent=1`, `full_time=1`) : `cdi` et `cdd` sont donc propageables.
    //
    // `contract_type=` n'est PAS un paramètre de requête documenté de
    // `search` — il n'apparaît que dans la réponse et comme filtre de l'API
    // Intelligence. On ne le suppose donc pas accepté en query string.
    //
    // Et la propagation ne dispense pas du filtre en aval : ces drapeaux ne
    // sont pas confirmés par un appel réel, et `filtrerContrat` vérifie de
    // toute façon la donnée reçue. L'un réduit le bruit, l'autre garantit.
    if (type === 'cdi') params.set('permanent', '1');
    if (type === 'cdd') params.set('contract', '1');
    const res = await withTimeout(
      fetch(`https://api.adzuna.com/v1/api/jobs/fr/search/${page + 1}?${params}`), 12000
    );
    if (!res.ok) return muet(journal, 'Adzuna', `HTTP ${res.status}`, `http_${res.status}`);
    const data = await res.json();
    return (data.results || []).map(j => {
      const estime = estSalaireEstime(j.salary_is_predicted);
      return {
        id: 'az_' + j.id,
        title: j.title,
        company: j.company?.display_name || 'Confidentiel',
        location: j.location?.display_name || 'France',
        // Adzuna porte le contrat dans `contract_type` ; on le lit au lieu de
        // le deviner depuis le titre. On devinait ce qu'on nous avait dit.
        type: contratAdzuna(j),
        // `contract_time` est une durée de travail, pas un contrat : son
        // propre champ, qui ne touche jamais `type`.
        workTime: tempsAdzuna(j),
        // DÉCISION : la fourchette est émise même estimée — ne rien afficher
        // privait le candidat d'un ordre de grandeur réel. C'est `jobs.html`
        // qui porte la mention « estimation Adzuna », sur un badge distinct de
        // celui des salaires annoncés par l'employeur.
        salary: formaterSalaireAnnuel(j.salary_min, j.salary_max),
        // Donc ce drapeau n'est plus un simple signal conservé pour plus tard :
        // c'est lui qui distingue un montant publié d'une estimation d'un
        // tiers. Le perdre reviendrait à présenter la seconde comme le premier.
        salaryEstimated: estime,
        description: (j.description || '').slice(0, 300),
        url: j.redirect_url || '',
        date: j.created || new Date().toISOString(),
        remote: (j.title+(j.description||'')).toLowerCase().includes('télétravail')||(j.title+(j.description||'')).toLowerCase().includes('remote'),
        source: 'Adzuna',
        logo: null,
        country: 'FR',
      };
    });
  } catch (e) { return muet(journal, 'Adzuna', e.message || String(e)); }
}

// ── FRANCE TRAVAIL (OAuth2 + Offres d'emploi v2) ─────
// Le corps du collecteur vit dans `_lib/france-travail.js`. Il en est sorti
// parce qu'il s'authentifie : c'est le seul du lot dont la panne peut venir de
// trois endroits — la variable absente, le serveur d'autorisation qui refuse,
// l'API qui répond autrement que prévu — et ces trois-là ne se distinguent
// qu'avec une sonde, que du code écrit en ligne dans ce handler interdisait.
async function fetchFranceTravail(q, type, location, page, journal) {
  const { offres, cause, raison } = await collecterFranceTravail({
    q, type, location, page,
    clientId: process.env.FRANCE_TRAVAIL_CLIENT_ID,
    clientSecret: process.env.FRANCE_TRAVAIL_CLIENT_SECRET,
    kvGet, kvSet,
    contrat: contratFranceTravail,
  });
  if (cause) return muet(journal, 'France Travail', raison || cause, cause);
  return offres;
}

// ── GREENHOUSE (crawl direct des ATS, via Upstash KV) ─
// Le seul collecteur qui ne sorte pas sur le réseau. Les 28 boards Greenhouse
// sont crawlés une fois par jour par `api/cron/collect-ats` — le plan
// Hobby n'autorise pas plus souvent — et ce qu'on lit ici est le relevé qu'il
// a déposé. La raison est mesurée : la
// collecte prend 10,1 s, le handler borne chaque source à 10 s, et la durée
// d'un crawl ATS croît avec le nombre d'entreprises — ce qu'une requête
// utilisateur ne peut pas se permettre.
//
// Ce que ce collecteur apporte, mesuré le 2026-10-19 contre la production :
// 257 de ses 334 offres françaises (76,9 %) n'étaient servies par aucune des
// huit autres sources, y compris en les interrogeant entreprise par
// entreprise par leur nom exact et en paginant jusqu'au bout. Ce ne sont pas
// les entreprises qui manquaient — 26 des 28 apparaissaient déjà — ce sont
// leurs offres.
//
// Il est placé AVANT les sources tierces dans la liste des collecteurs, et
// c'est une décision, pas un hasard : `deduplicate()` garde la PREMIÈRE
// occurrence de chaque couple titre+entreprise. Une offre vue à la fois ici et
// chez un agrégateur sort donc avec l'URL de la page carrière de l'employeur
// plutôt qu'avec celle du republicateur. C'est tout l'intérêt de crawler la
// source.
const PAR_PAGE = 10;

// ── SERVIR UN RÉSERVOIR KV ──────────────────────────────────────────────────
// Trois sources sont désormais des réservoirs remplis par cron et lus en KV :
// Greenhouse, JSearch, French Job Market. Le travail de LECTURE est le même
// pour les trois — filtrer sur la requête, trier par date, paginer — et il
// n'était écrit que pour Greenhouse. L'écrire deux fois de plus garantirait
// qu'elles divergent, et la divergence a déjà un précédent dans ce fichier :
// `?type=cdd` était propagé par trois collecteurs sur huit et ignoré par les
// cinq autres. Il vit donc ici, une seule fois.
//
// Paginé à dix comme les sources réseau le sont, et pour la même raison :
// rendre tout un réservoir d'un coup noierait les autres collecteurs dans un
// agrégat où il passerait devant.
function servirReservoir(offres, q, type, location, page) {
  let jobs = offres;
  if (type && type !== 'tous' && FILTRE_VERS_CONTRAT[type]) {
    // Une offre au contrat inconnu est écartée sous filtre, comme partout
    // ailleurs : la servir en réponse à « CDI » serait l'affirmation sans
    // preuve que `_lib/contrat.js` interdit.
    jobs = jobs.filter(j => j.type === FILTRE_VERS_CONTRAT[type]);
  }
  if (q) {
    const ql = q.toLowerCase();
    jobs = jobs.filter(j =>
      (j.title || '').toLowerCase().includes(ql) ||
      (j.company || '').toLowerCase().includes(ql) ||
      (j.description || '').toLowerCase().includes(ql)
    );
  }
  if (location) {
    const ll = location.toLowerCase();
    jobs = jobs.filter(j => !j.location || j.location.toLowerCase().includes(ll) || j.remote);
  }
  return jobs
    .slice()
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(page * PAR_PAGE, page * PAR_PAGE + PAR_PAGE);
}

// Une source de réservoir a trois façons d'être absente, et les confondre
// envoie chercher la panne au mauvais endroit — c'est toute la raison d'être du
// vocabulaire borné. Rend `null` quand le réservoir est frais et servable.
//
// La vérification porte sur le `collecteLe` DE LA SOURCE, pas sur le TTL de la
// clé. Les deux sources RapidAPI partagent une clé que le cron réécrit chaque
// jour : son TTL resterait neuf même si French Job Market était refusée depuis
// six semaines, et le réservoir servirait du périmé sans le dire.
// `!entree` veut dire que la clé KV n'existe pas, et depuis que
// `collect-rapidapi` écrit sa clé INCONDITIONNELLEMENT, ça ne veut plus dire
// qu'une chose : le cron n'a pas tourné. Avant, ça en voulait dire quatre — le
// cron écartait l'écriture dès qu'une collecte ne ramenait aucune offre, donc
// un refus de quota, une clé non posée et une API en panne arrivaient tous ici
// sous la forme d'une clé absente. Le diagnostic était calculé par `fusionner`,
// puis jeté avant d'atteindre KV ; `quota_epuise` n'était publiable que si une
// collecte ANTÉRIEURE avait laissé une clé pour le porter, donc jamais au
// premier passage — exactement le moment où on en a besoin. C'est ce qui a fait
// lire `collecte_absente` sur JSearch le 2026-10-22 alors que son cron avait
// bien tourné à 3 h.
function causeReservoir(entree, source) {
  if (!entree) return 'collecte_absente';
  if (entree.etat === 'cle_absente') return 'cle_absente';
  // `erreur` : la collecte a eu lieu et AUCUN de ses appels n'a abouti. Ce
  // n'est ni un plafond atteint (`quota_epuise` → décision d'abonnement) ni un
  // cron muet (`collecte_absente` → voir les crons Vercel) : c'est l'API qui
  // répond mal, et ça s'instruit chez le fournisseur.
  const perime = entree.etat === 'quota' ? 'quota_epuise'
    : entree.etat === 'erreur' ? 'collecte_en_echec'
    : 'collecte_absente';
  if (!entree.collecteLe || !entree.offres?.length) return perime;
  const age = (Date.now() - new Date(entree.collecteLe).getTime()) / 1000;
  return age > AGE_MAX_SECONDES[source] ? perime : null;
}

// `!offres.length` est AJOUTÉ au test, et ce n'est pas de la prudence
// décorative : le commentaire d'origine disait déjà « la clé ne vaut pas une
// liste vide », mais le code ne le faisait pas. `Array.isArray([])` est vrai et
// `![]` est faux, donc une clé portant `offres: []` traversait le garde et
// partait dans `servirReservoir`, qui rendait zéro offre SANS publier de cause
// — le silence exact que `causesEnEchec` existe pour retirer. Le cas est
// aujourd'hui inatteignable parce que le cron refuse d'écrire une collecte
// vide, mais une clé écrite par un déploiement antérieur, ou à la main, y
// arriverait. Le commentaire avait raison avant le code.
//
// Et la cause ne vaut plus `collecte_absente` d'office : la BALISE de passage
// dit si le cron est venu. Clé absente + balise muette, il n'est pas passé ;
// clé absente + balise qui déclare un échec, il est passé et le crawl n'a rien
// ramené. Deux écrans différents à aller regarder.
async function fetchGreenhouse(q, type, location, page, journal, lireBalise) {
  try {
    const collecte = await kvGet('greenhouse_jobs');
    const offres = Array.isArray(collecte?.offres) ? collecte.offres : null;
    if (!offres || !offres.length) {
      return muet(journal, 'Greenhouse', 'réservoir greenhouse_jobs sans offre servable',
        causeDepuisBalise(await lireBalise(), 'Greenhouse'));
    }
    return servirReservoir(offres, q, type, location, page);
  } catch (e) { return muet(journal, 'Greenhouse', e.message || String(e)); }
}

// ── LEVER (crawl direct des ATS, via Upstash KV) ──────
// Le second collecteur qui ne sorte pas sur le réseau, après Greenhouse, et il
// vise le gisement que Greenhouse n'avait pas : 5,2 % seulement des offres
// Greenhouse étaient en France, et les scale-ups françaises évidentes y
// répondaient 404. Lever porte 17 boards vivants pour 358 offres françaises,
// soit 18,5 % de sa collecte — trois fois la densité de Greenhouse.
//
// Ce que ce collecteur apporte, mesuré le 2026-10-21 contre la production, en
// interrogeant entreprise par entreprise par le nom exact ET EN PAGINANT
// jusqu'à épuisement : voir `RAPPORT-lever-2026-10-21.md`. Le relevé sur la
// seule `page=0` donnait 90,2 % d'offres absentes ; la mesure paginée corrige
// ce chiffre, et c'est elle qui compte — la production borne chaque source par
// page, donc mesurer une page mesure la taille d'une page, pas la couverture.
//
// Il est placé AVANT les sources tierces, comme Greenhouse et pour la même
// raison : `deduplicate()` garde la PREMIÈRE occurrence de chaque couple
// titre+entreprise. Une offre vue à la fois ici et chez un agrégateur sort donc
// avec l'URL de la page de candidature de l'employeur plutôt qu'avec celle du
// republicateur. C'est l'apport qui subsiste même là où le recouvrement est
// total.
// Même garde et même balise que Greenhouse, et c'est le point d'avoir une clé
// d'offres PAR fournisseur : Lever peut être muette pendant que Greenhouse
// sert, et la balise le dit fournisseur par fournisseur plutôt qu'en bloc.
async function fetchLever(q, type, location, page, journal, lireBalise) {
  try {
    const collecte = await kvGet('lever_jobs');
    const offres = Array.isArray(collecte?.offres) ? collecte.offres : null;
    if (!offres || !offres.length) {
      return muet(journal, 'Lever', 'réservoir lever_jobs sans offre servable',
        causeDepuisBalise(await lireBalise(), 'Lever'));
    }

    let jobs = offres;
    if (type && type !== 'tous' && FILTRE_VERS_CONTRAT[type]) {
      // Une offre au contrat inconnu est écartée sous filtre, comme partout
      // ailleurs : 45,3 % des offres Lever sortent avec `type: null`, et les
      // servir en réponse à « CDI » serait l'affirmation sans preuve que
      // `_lib/contrat.js` interdit.
      jobs = jobs.filter(j => j.type === FILTRE_VERS_CONTRAT[type]);
    }
    if (q) {
      const ql = q.toLowerCase();
      jobs = jobs.filter(j =>
        j.title.toLowerCase().includes(ql) ||
        j.company.toLowerCase().includes(ql) ||
        (j.description || '').toLowerCase().includes(ql)
      );
    }
    if (location) {
      const ll = location.toLowerCase();
      jobs = jobs.filter(j => !j.location || j.location.toLowerCase().includes(ll) || j.remote);
    }
    // Paginé comme les sources réseau le sont, et pour la même raison : rendre
    // les 358 offres d'un coup noierait les autres collecteurs dans un agrégat
    // où elles passeraient toutes devant — `prioritize` classe la France au
    // premier rang. Dix par page les rend accessibles sans déséquilibrer la
    // liste.
    const PAR_PAGE = 10;
    return jobs
      .slice()
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(page * PAR_PAGE, page * PAR_PAGE + PAR_PAGE);
  } catch (e) { return muet(journal, 'Lever', e.message || String(e)); }
}

// ── TEAMTAILOR (crawl direct des ATS, via Upstash KV) ─
// Le troisième collecteur qui ne sorte pas sur le réseau, et celui qui ÉLARGIT
// le catalogue au lieu de l'épaissir. Lever avait rendu 331 offres françaises
// sans une seule entreprise nouvelle ; Teamtailor rend moins d'offres mais des
// employeurs qu'emploia ne servait pas — Skello, Hublo, Foodles, Spiko,
// Ornikar, Innovorder, Memo Bank, Leocare. Chiffres complets dans
// `PROTO-teamtailor-ats-2026-10-23.md`.
//
// C'est aussi la collecte la plus dense en France des trois : 228 offres FR
// sur 322, soit 70,8 %, contre 17,4 % chez Lever et 5,2 % chez Greenhouse. Et
// la plus rapide — 5,1 s pour 19 boards — parce que ces entreprises sont plus
// petites.
//
// Le seul des trois à publier un SALAIRE : 26 offres françaises en portent un,
// et seulement celles libellées en euros ET annuelles. Le mensuel est écarté
// plutôt que multiplié par douze (voir `salaireSchemaOrg`).
//
// Placé APRÈS Greenhouse et Lever mais AVANT les sources tierces : l'ordre
// entre les trois ATS est sans conséquence puisqu'ils ne partagent aucun
// employeur, et ce qui compte est que les trois passent avant les
// republicateurs, pour que `deduplicate()` garde l'URL de l'employeur.
// Même garde et même balise que les deux autres.
async function fetchTeamtailor(q, type, location, page, journal, lireBalise) {
  try {
    const collecte = await kvGet('teamtailor_jobs');
    const offres = Array.isArray(collecte?.offres) ? collecte.offres : null;
    if (!offres || !offres.length) {
      return muet(journal, 'Teamtailor', 'réservoir teamtailor_jobs sans offre servable',
        causeDepuisBalise(await lireBalise(), 'Teamtailor'));
    }

    let jobs = offres;
    if (type && type !== 'tous' && FILTRE_VERS_CONTRAT[type]) {
      // Une offre au contrat inconnu est écartée sous filtre, comme partout
      // ailleurs — et ici c'est le cas le plus fréquent des trois ATS : 75,9 %
      // des offres Teamtailor sortent avec `type: null`, parce que le champ
      // `employmentType` que le standard schema.org définit est servi ZÉRO
      // fois sur 602. Les servir en réponse à « CDI » serait l'affirmation
      // sans preuve que `_lib/contrat.js` interdit.
      jobs = jobs.filter(j => j.type === FILTRE_VERS_CONTRAT[type]);
    }
    if (q) {
      const ql = q.toLowerCase();
      jobs = jobs.filter(j =>
        j.title.toLowerCase().includes(ql) ||
        j.company.toLowerCase().includes(ql) ||
        (j.description || '').toLowerCase().includes(ql)
      );
    }
    if (location) {
      const ll = location.toLowerCase();
      jobs = jobs.filter(j => !j.location || j.location.toLowerCase().includes(ll) || j.remote);
    }
    const PAR_PAGE = 10;
    return jobs
      .slice()
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(page * PAR_PAGE, page * PAR_PAGE + PAR_PAGE);
  } catch (e) { return muet(journal, 'Teamtailor', e.message || String(e)); }
}

// ── EMPLOYER DIRECT JOBS (Upstash KV) ────────────────
async function fetchEmployerJobs(q, type, location, journal) {
  try {
    let jobs = await kvGet('employer_jobs') || [];
    if (!Array.isArray(jobs)) return [];
    const now = Date.now();
    jobs = jobs.filter(j => isJobLive(j, now));
    if (type && type !== 'tous') {
      if (FILTRE_VERS_CONTRAT[type]) jobs = jobs.filter(j => j.type === FILTRE_VERS_CONTRAT[type]);
    }
    if (q) {
      const ql = q.toLowerCase();
      jobs = jobs.filter(j =>
        j.title.toLowerCase().includes(ql) ||
        j.company.toLowerCase().includes(ql) ||
        (j.description || '').toLowerCase().includes(ql)
      );
    }
    if (location) {
      const ll = location.toLowerCase();
      jobs = jobs.filter(j => !j.location || j.location.toLowerCase().includes(ll) || j.remote);
    }
    return jobs.slice(0, 5).map(toPublicJob);
  } catch (e) { return muet(journal, 'Emploia', e.message || String(e)); }
}

// ── DEDUPE & SORT ─────────────────────────────────────
function deduplicate(jobs) {
  const seen = new Set();
  return jobs.filter(j => {
    const k = (j.title+j.company).toLowerCase().replace(/[^a-z0-9]/g,'');
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

function prioritize(jobs) {
  const order = { FR:0, REMOTE:1, INTL:2, EU:3 };
  return jobs.sort((a,b) => {
    const d = (order[a.country]??4) - (order[b.country]??4);
    return d !== 0 ? d : new Date(b.date) - new Date(a.date);
  });
}

// ── PERTINENCE ────────────────────────────────────────
// Deux des neuf collecteurs ignorent purement et simplement le terme de
// recherche. Mesuré sur l'API publique de Remotive, qui rend les mêmes 18
// offres et le même premier titre pour `search=coiffeur`, `search=boulanger`,
// `search=nurse` et `search=python` ; Arbeitnow se comporte de même. Leur
// `search=` est accepté puis ignoré, donc leurs offres ne sont pas « peu
// pertinentes » : elles sont indépendantes de la requête.
//
// Conséquence sur les 86 pages SEO : un bloc fixe de 11 offres — « Inside
// Sales Contractor », « Senior Consultant (m/w/d) » — identique sur
// /emploi/limoges, /emploi/amiens, /metier/coiffeur et /metier/aide-soignant.
// Du quasi-dupliqué sur toute la surface indexée, et jusqu'à la moitié du
// contenu des pages à faible rendement.
//
// On ne peut pas le corriger par le classement : une offre hors sujet reste
// hors sujet en bas de page, et Google lit la page entière. Il faut l'écarter.
//
// Le filtre est volontairement permissif — il retient une offre dès qu'UN
// indice la relie à la requête — parce que le risque à éviter est de vider une
// page, pas d'y laisser une offre de trop.
//
// Pourquoi filtrer par pertinence et non par source. La liste noire des deux
// collecteurs fautifs était plus simple, et elle est fausse : sur une mesure
// d'Amiens, parmi les offres Arbeitnow écartées figurent « Responsable
// Métrologie — Saint Ouen » et « Chargé de Ressources Humaines en alternance —
// Saint Ouen ». De vraies offres françaises, simplement pas à Amiens. Les
// écarter par pertinence les laisse remonter sur la page qui leur correspond ;
// les écarter par source les perdrait pour toutes les pages.
//
// Mesuré en production (annexe 3 de AUDIT-flux-offres-2026-10-10.md) : sur six
// villes, ce filtre garde 47,6 % à 63,3 % des offres — soit 10 à 19 annonces
// mentionnant réellement la ville — et écarte presque exactement 11 offres par
// page, vérifiées une à une sur Amiens comme étant 6 Remotive + 5 Arbeitnow.
// Le bloc fixe, à l'unité, sans une seule offre légitime perdue.
function normaliser(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // « santé » → « sante »
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Mots trop courts ou trop communs pour porter du sens : les garder ferait
// correspondre n'importe quoi (« de », « et », « job »).
const MOTS_VIDES = new Set(['pour', 'avec', 'dans', 'chez', 'les', 'des', 'une', 'job', 'jobs', 'emploi', 'poste', 'offre', 'cdi', 'cdd']);

function motsDeRecherche(q, location) {
  return [...new Set([...normaliser(q).split(' '), ...normaliser(location).split(' ')])]
    .filter(m => m.length >= 4 && !MOTS_VIDES.has(m));
}

// Une offre est retenue si l'un de ses champs porte l'un des mots de la
// requête. On regarde le titre, l'entreprise, le lieu ET la description : une
// offre d'aide-soignant peut ne pas porter « EHPAD » dans son titre.
function estPertinente(job, mots) {
  if (!mots.length) return true;                     // pas de requête → tout passe
  const foin = normaliser(`${job.title} ${job.company} ${job.location} ${job.description}`);
  return mots.some(m => foin.includes(m));
}

// Filtre l'agrégat, mais JAMAIS jusqu'au vide : si aucune offre ne survit, on
// rend la liste entière plutôt qu'une page blanche. Une page SEO vide est la
// panne qu'on vient de réparer ; mieux vaut du bruit visible qu'un trou, et
// c'est la sonde qui doit alerter sur ce cas, pas l'utilisateur qui le découvre.
// Le drapeau `filtre` dit laquelle des deux branches a été prise, pour que
// l'écart soit mesurable depuis l'extérieur au lieu d'être deviné.
function filtrerPertinence(jobs, q, location) {
  const mots = motsDeRecherche(q, location);
  if (!mots.length) return { jobs, filtrees: 0, filtre: 'inactif' };
  const gardees = jobs.filter(j => estPertinente(j, mots));
  if (!gardees.length) return { jobs, filtrees: 0, filtre: 'abandonne' };
  return { jobs: gardees, filtrees: jobs.length - gardees.length, filtre: 'actif' };
}

// ── MOCK FALLBACK ─────────────────────────────────────
const MOCK = [
  { id:'m1', title:'Développeur Full Stack React/Node.js', company:'BNP Paribas', location:'Paris 75009', type:'CDI', salary:'45–55k€/an', description:'Stack React, Node.js, PostgreSQL.', url:'/app', date:daysAgo(1), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m2', title:'Growth Marketing Manager', company:'Doctolib', location:'Paris 75009', type:'CDI', salary:'40–50k€/an', description:'Pilotez la croissance B2B.', url:'/app', date:daysAgo(2), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m3', title:'Stage Marketing Digital — 6 mois', company:"L'Oréal", location:'Paris 75008', type:'Stage', salary:'1 200€/mois', description:'Stage 6 mois en Growth.', url:'/app', date:daysAgo(1), remote:false, source:'Emploia', logo:null, country:'FR' },
  { id:'m4', title:'Alternance Business Developer', company:'Capgemini', location:'Paris 75017', type:'Alternance', salary:'1 500€/mois', description:'Alternance 12 mois BD.', url:'/app', date:daysAgo(3), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m5', title:'Data Analyst — CDD 12 mois', company:'Société Générale', location:'Paris La Défense', type:'CDD', salary:'38–42k€/an', description:'SQL, Python, Tableau.', url:'/app', date:daysAgo(2), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m6', title:'UX Designer', company:'Pennylane', location:'Paris 75009', type:'CDI', salary:'42–52k€/an', description:'Figma, user research.', url:'/app', date:daysAgo(0), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m7', title:'DevOps Engineer', company:'OVHcloud', location:'Roubaix 59100', type:'CDI', salary:'48–58k€/an', description:'Kubernetes, Terraform, AWS.', url:'/app', date:daysAgo(1), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m8', title:'Alternance Cybersécurité — 2 ans', company:'Thales', location:'Vélizy 78', type:'Alternance', salary:'1 700€/mois', description:'SOC, pentest, conformité.', url:'/app', date:daysAgo(0), remote:false, source:'Emploia', logo:null, country:'FR' },
  { id:'m9', title:'Product Manager Apps Mobiles', company:'Meilleurtaux', location:'Paris 75002', type:'CDI', salary:'50–65k€/an', description:'Roadmap produit, 2M+ DL.', url:'/app', date:daysAgo(4), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m10', title:'Stage Data Python — 6 mois', company:'Criteo', location:'Paris 75009', type:'Stage', salary:'1 350€/mois', description:'Python, pandas, SQL.', url:'/app', date:daysAgo(1), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m11', title:'Ingénieur Backend Node.js', company:'Qonto', location:'Paris 75002', type:'CDI', salary:'45–58k€/an', description:'API REST, microservices.', url:'/app', date:daysAgo(0), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m12', title:'Alternance RH & Recrutement', company:'Decathlon', location:'Lille 59000', type:'Alternance', salary:'1 300€/mois', description:'Recrutement, onboarding.', url:'/app', date:daysAgo(5), remote:false, source:'Emploia', logo:null, country:'FR' },
  { id:'m13', title:'Commercial B2B SaaS', company:'Salesforce', location:'Paris 75008', type:'CDI', salary:'45–70k€/an + var.', description:'Account Executive marché FR.', url:'/app', date:daysAgo(2), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m14', title:'Stage Communication & Brand', company:'LVMH', location:'Paris 75008', type:'Stage', salary:'1 100€/mois', description:'Stage 6 mois direction com.', url:'/app', date:daysAgo(1), remote:false, source:'Emploia', logo:null, country:'FR' },
  { id:'m15', title:'Data Engineer', company:'Criteo', location:'Paris 75009', type:'CDI', salary:'50–65k€/an', description:'Spark, Kafka, Airflow.', url:'/app', date:daysAgo(3), remote:true, source:'Emploia', logo:null, country:'FR' },
];

function getMock(q, type, page) {
  let items = [...MOCK];
  if (q) { const ql=q.toLowerCase(); items=items.filter(j=>j.title.toLowerCase().includes(ql)||j.company.toLowerCase().includes(ql)); }
  if (type && type!=='tous') { if(FILTRE_VERS_CONTRAT[type]) items=items.filter(j=>j.type===FILTRE_VERS_CONTRAT[type]); }
  return { jobs:items.slice(page*12,page*12+12), total:items.length, page, demo:true, sources:['Emploia'] };
}

// ── MAIN HANDLER (Edge Runtime) ───────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'jobs', 60, 60);
  if (!rl.allowed) return new Response(
    JSON.stringify({ error: 'Trop de requêtes. Réessayez dans 1 minute.' }),
    { status: 429, headers: { ...H, 'Retry-After': '60' } }
  );

  const url = new URL(req.url);
  const q          = (url.searchParams.get('q')       || '').trim().slice(0, 200);
  const type       = (url.searchParams.get('type')     || '').toLowerCase().slice(0, 20);
  const location   = (url.searchParams.get('location') || '').slice(0, 100);
  const remoteOnly = url.searchParams.get('remote') === 'true';
  const page       = Math.max(0, Math.min(10, parseInt(url.searchParams.get('page') || '0')));

  // `limit` borne le nombre de cartes rendues. Les 86 pages SEO l'envoient
  // (&limit=18, &limit=24 pour /recherche) et recevaient sinon tout l'agrégat,
  // soit 21 à 87 cartes sur un gabarit dessiné pour en montrer dix-huit.
  // Absent ou invalide ⇒ aucune troncature : les 3 pages applicatives, qui ne
  // le passent pas, gardent exactement la réponse qu'elles ont aujourd'hui.
  // La borne haute à 50 empêche de transformer le paramètre en levier de
  // charge sur les 8 sources amont.
  const limitBrut = parseInt(url.searchParams.get('limit') || '', 10);
  const limit     = Number.isFinite(limitBrut) ? Math.max(1, Math.min(50, limitBrut)) : null;
  // Tronque après tous les filtres, jamais avant la mise en cache : l'entrée
  // de cache reste la liste complète, donc deux pages aux `limit` différents
  // la partagent au lieu de se l'écraser l'une l'autre.
  const borner = (jobs) => (limit === null ? jobs : jobs.slice(0, limit));

  // 5-minute KV cache — key combines all search params (already bounded above)
  const cacheKey = `jobs:${q}|${type}|${location}|${page}`;
  try {
    const cached = await kvGet(cacheKey);
    if (cached?.jobs?.length) {
      let final = cached.jobs;
      if (remoteOnly) final = final.filter(j => j.remote === true);
      final = borner(final);
      // Les entrées écrites par le déploiement précédent ne portent pas de
      // causes. On rend alors `inconnue` par source en échec plutôt qu'un
      // objet vide : un `{}` se lirait comme « aucune cause à signaler »,
      // c'est-à-dire exactement le silence qu'on retire. Et on repasse par
      // `causePublique` à la lecture — une entrée de cache est une donnée qui
      // revient de l'extérieur du processus, elle se filtre comme telle.
      const brut = cached.causesEnEchec || {};
      const causesEnEchec = Object.fromEntries(
        (cached.sourcesEnEchec || []).map(s => [s, causePublique(brut[s])])
      );
      // Même raisonnement pour la couverture du contrat. Une entrée écrite par
      // le déploiement précédent n'en porte pas, et un objet à zéros se lirait
      // comme « aucune offre au contrat inconnu » — l'affirmation la plus
      // trompeuse possible ici, puisque c'est précisément le chiffre qu'on
      // vient de rendre visible. Absente, elle vaut `null`, et l'interface
      // n'affiche alors rien plutôt qu'un zéro inventé.
      const couvertureContrat = cached.couvertureContrat || null;
      return new Response(
        JSON.stringify({ jobs: final, total: final.length, page, demo: false, sources: cached.sources, sourcesEnEchec: cached.sourcesEnEchec || [], causesEnEchec, filtre: cached.filtre || 'inconnu', couvertureContrat, cached: true }),
        { status: 200, headers: H }
      );
    }
  } catch {}

  // Les collecteurs dans l'ordre de priorité du résultat : les offres déposées
  // sur Emploia d'abord, les sources françaises ensuite, le reste après. Une
  // seule liste, donc un seul ordre à tenir à jour — l'ancienne version en
  // tenait deux, celui du lancement et celui de la fusion.
  const journal = [];

  // Lu UNE fois, pour les deux sources que la clé porte. Deux `kvGet` de la
  // même clé dans la même requête seraient deux allers-retours pour la même
  // valeur ; et un memo de module serait partagé entre requêtes concurrentes,
  // ce que ce fichier s'interdit déjà pour `journal`.
  //
  // Une lecture KV en échec ne fait pas tomber la requête : elle vaut `null`,
  // et les deux sources rendront `collecte_absente` comme si la clé était vide.
  const reservoirRapidapi = await kvGet(CLE_RAPIDAPI).catch(() => null);

  // La balise ATS est lue PARESSEUSEMENT, et une seule fois pour les deux
  // fournisseurs. Une source saine ne paie donc rien : la lecture ne part que
  // si une clé d'offres ne donne rien, c'est-à-dire seulement quand il y a une
  // panne à expliquer. Le réservoir RapidAPI, lui, est lu d'avance parce que
  // ses offres SONT dans la clé ; ici la balise n'en porte aucune.
  let baliseAts;
  const lireBaliseAts = () => (baliseAts ??= kvGet(CLE_BALISE_ATS).catch(() => null));

  const collecteurs = [
    ['Emploia',           () => fetchEmployerJobs(q, type, location, journal)],
    ['Greenhouse',        () => fetchGreenhouse(q, type, location, page, journal, lireBaliseAts)],
    ['Lever',             () => fetchLever(q, type, location, page, journal, lireBaliseAts)],
    ['Teamtailor',        () => fetchTeamtailor(q, type, location, page, journal, lireBaliseAts)],
    ['France Travail',    () => fetchFranceTravail(q, type, location, page, journal)],
    ['French Job Market', () => fetchFrenchMarket(q, type, location, page, journal, reservoirRapidapi)],
    ['JSearch',           () => fetchJSearch(q, type, location, page, journal, reservoirRapidapi)],
    ['Adzuna',            () => fetchAdzuna(q, type, location, page, journal)],
    ['Remotive',          () => fetchRemotive(q, type, journal)],
    ['Arbeitnow',         () => fetchArbeitnow(q, type, page, journal)],
  ];

  try {
    const resultats = await Promise.allSettled(collecteurs.map(([, appel]) => appel()));
    const allJobs = [];
    resultats.forEach((r, i) => {
      if (r.status === 'fulfilled') allJobs.push(...r.value);
      else journal.push({ source: collecteurs[i][0], raison: r.reason?.message || String(r.reason), cause: borner_cause(r.reason?.message || String(r.reason)) });
    });

    // Deux niveaux, délibérément. La raison complète part dans les logs
    // d'exécution, où elle est lisible par qui a accès au compte Vercel ; la
    // réponse publique ne porte qu'une cause d'un vocabulaire fermé, filtrée
    // par `causePublique`. Un code HTTP ne divulgue rien, un message
    // d'exception peut porter une URL signée.
    //
    // Pourquoi exposer la cause : sans elle, diagnostiquer une source morte
    // exige d'ouvrir les journaux Vercel, dont la rétention est d'une heure
    // sur le plan Hobby. Une panne survenue la nuit était illisible au matin,
    // et c'est ainsi que le 429 de French Job Market et le 404 d'Internships
    // ont dû être relevés à la main au lieu de sortir de `smoke:sources`.
    //
    // Ces deux pannes ont été instruites depuis : Internships était une API
    // RETIRÉE par son fournisseur le 2026-08-03, et les deux 429 étaient des
    // plafonds MENSUELS de plan gratuit (200 et 30 requêtes). Le `http_429`
    // rendu ici disait vrai sans être actionnable — il ne distinguait pas un
    // pic de trafic d'un quota épuisé. D'où `quota_epuise`, et d'où le passage
    // des deux sources au réservoir KV qui borne les appels au calendrier.
    if (journal.length) console.error('jobs: sources en échec — ' + JSON.stringify(journal));
    // Une source peut échouer plusieurs fois dans la même requête (pagination,
    // deux appels) : on garde la première cause vue par source, et le nom reste
    // la clé — la sonde compare des noms.
    const causes = new Map();
    for (const e of journal) if (!causes.has(e.source)) causes.set(e.source, causePublique(e.cause));
    const sourcesEnEchec = [...causes.keys()];
    const causesEnEchec = Object.fromEntries(causes);

    if (allJobs.length > 0) {
      // L'ordre compte. Le filtre de pertinence s'applique AVANT la mise en
      // cache, pas après : la clé de cache porte déjà `q` et `location`, donc
      // l'entrée est propre à cette requête et la liste filtrée lui
      // correspond. Filtrer après lecture du cache aurait refait le travail à
      // chaque appel ; filtrer avant l'écriture le fait une fois par requête
      // et par fenêtre de cinq minutes.
      const pertinence = filtrerPertinence(prioritize(deduplicate(allJobs)), q, location);
      // Le filtre de contrat s'applique après la pertinence et AVANT le cache,
      // pour la même raison : la clé de cache porte déjà `type`, donc l'entrée
      // est propre à ce filtre. C'est le filtre qui n'existait nulle part —
      // seul `remoteOnly` était appliqué après la fusion.
      const contrat = filtrerContrat(pertinence.jobs, type);
      let final = contrat.jobs;
      // La couverture du contrat, telle qu'elle sera rendue. Le journal reste
      // utile pour qui lit les logs à chaud, mais il n'est plus le SEUL endroit
      // où le chiffre existe : `couvertureContrat` entre dans la réponse et
      // dans le cache, comme `causesEnEchec`.
      //
      // `confirmees` est compté sur la liste servie, et `total` sur celle
      // d'avant filtrage : l'interface annonce « n offres au contrat confirmé
      // sur m », donc les deux bornes doivent venir du même passage, pas d'un
      // recomptage côté client sur une liste déjà tronquée par `limit`.
      const couvertureContrat = {
        filtre: contrat.vise,
        total: pertinence.jobs.length,
        confirmees: final.filter(j => j.type).length,
        sansContrat: contrat.sansContrat,
        ecartees: contrat.ecartees,
      };
      if (contrat.ecartees) {
        console.error(`jobs: ${contrat.ecartees} offre(s) écartée(s) par le filtre de contrat type=${JSON.stringify(type)} (dont ${contrat.sansContrat} au contrat inconnu)`);
      }
      if (pertinence.filtrees) {
        console.error(`jobs: ${pertinence.filtrees} offre(s) hors sujet écartée(s) pour q=${JSON.stringify(q)} location=${JSON.stringify(location)}`);
      }
      if (pertinence.filtre === 'abandonne') {
        // Aucune offre ne correspond : on sert l'agrégat brut plutôt qu'une
        // page vide, et on le dit assez fort pour que la sonde le voie.
        console.error(`jobs: filtre abandonné pour q=${JSON.stringify(q)} — aucune offre pertinente, agrégat brut servi`);
      }
      const sources = [...new Set(final.map(j => j.source))];
      // Store in cache before applying remoteOnly so we can serve both variants from same entry
      // sourcesEnEchec entre aussi en cache : sans lui, une panne de source
      // disparaîtrait de la réponse pendant les cinq minutes suivantes.
      kvSet(cacheKey, { jobs: final, sources, sourcesEnEchec, causesEnEchec, filtre: pertinence.filtre, couvertureContrat }, 300).catch(() => {});
      if (remoteOnly) final = final.filter(j => j.remote === true);
      final = borner(final);
      return new Response(
        JSON.stringify({ jobs: final, total: final.length, page, demo: false, sources, sourcesEnEchec, causesEnEchec, filtre: pertinence.filtre, couvertureContrat }),
        { status: 200, headers: H }
      );
    }
  } catch {}

  const mock = getMock(q, type, page);
  if (remoteOnly) mock.jobs = mock.jobs.filter(j => j.remote === true);
  mock.jobs = borner(mock.jobs);
  // getMock expose `total` = toutes les offres de secours correspondantes, pas
  // seulement celles de la page — sémantique de pagination qu'on laisse
  // strictement intacte quand `limit` est absent (15 pour 12 cartes : c'est le
  // comportement que les 3 pages applicatives reçoivent aujourd'hui).
  // Mais les pages affichent « ${data.total} offres trouvées » au-dessus des
  // cartes : laisser 15 au-dessus de 3 cartes réimprimerait, en plus petit, le
  // mensonge qu'on vient de retirer des 86 pages.
  if (limit !== null) mock.total = Math.min(mock.total, mock.jobs.length);
  return new Response(JSON.stringify(mock), { status: 200, headers: H });
}
