// Candidats au catalogue SmartRecruiters : des identifiants PLAUSIBLES, pas un
// catalogue. Rien d'ici n'entre en production sans être passé par
// `verifier-boards.mjs`, qui seul constate qu'une entreprise répond ET qu'elle
// est bien celle qu'on croit.
//
// POURQUOI SMARTRECRUITERS, ET POURQUOI CETTE LISTE. Les trois relevés
// précédents (Greenhouse, Lever, Teamtailor) ont élargi le catalogue côté
// tech et scale-ups. Le trou qui reste est nommé par la sonde de surface du
// 2026-11-04 : `coiffeur`, `boulanger`, `aide-soignant` ne trouvent aucune
// offre. Ce ne sont pas des métiers que recrutent les clients de Greenhouse.
// SmartRecruiters est l'ATS des GRANDS employeurs multi-sites — hôtellerie,
// distribution, services, ingénierie — donc l'hypothèse testée est
// « d'autres MÉTIERS », après « d'autres employeurs » pour Teamtailor.
//
// L'API publique (`api.smartrecruiters.com/v1/companies/{id}/postings`) est
// sans clé, accepte `country=fr` côté serveur, et l'identifiant est
// INSENSIBLE À LA CASSE — vérifié : `accor`, `Accor` et `ACCOR` rendent les
// mêmes 582 offres. On ne liste donc que des minuscules.
//
// LE PIÈGE PROPRE À CET ATS : un identifiant inconnu ne rend PAS 404. Il rend
// HTTP 200 avec `totalFound: 0` — mesuré sur `zzzznotacompany123`. « N'existe
// pas » et « ne recrute pas » sont donc indiscernables par le statut, et
// c'est `verifier-boards.mjs` qui doit les départager par le nom de
// l'entreprise servi dans `company.name`.
//
// Les identifiants morts restent dans cette liste À DESSEIN, comme pour les
// trois ATS précédents : ce fichier est la trace de ce qui a été ESSAYÉ.
export const CANDIDATS = [
  // ── Constatés à la main le 2026-11-04, avant la sonde ────────────────────
  'accor', 'ubisoft2', 'boschgroup', 'equinox', 'alten', 'colliers', 'devoteam', 'lvmh',

  // ── Hôtellerie, restauration, loisirs ────────────────────────────────────
  'accorhotels', 'hilton', 'marriott', 'ihg', 'radissonhotels', 'bbhotels', 'louvrehotels',
  'clubmed', 'pierreetvacances', 'centerparcs', 'belambra', 'groupebarriere', 'barriere',
  'disneylandparis', 'compagniedesalpes', 'parcasterix', 'sodexo', 'sodexofrance', 'elior',
  'eliorgroup', 'compassgroup', 'compassgroupfrance', 'newrest', 'apirestauration',
  'mcdonalds', 'burgerking', 'burgerkingfrance', 'kfc', 'kfcfrance', 'dominos', 'starbucks',
  'paul', 'briochedoree', 'bigmamma', 'buffalogrill', 'hippopotamus', 'flunch', 'courtepaille',
  'groupebertrand', 'bertrand', 'ninkasi', 'pokawa', 'fiveguys', 'popeyes', 'ugc', 'pathe',

  // ── Distribution, mode, beauté ───────────────────────────────────────────
  'carrefour', 'auchan', 'intermarche', 'lidl', 'aldi', 'monoprix', 'franprix', 'casino',
  'picard', 'biocoop', 'natureetdecouvertes', 'fnac', 'fnacdarty', 'darty', 'boulanger',
  'leroymerlin', 'castorama', 'kingfisher', 'ikea', 'maisonsdumonde', 'but', 'conforama',
  'decathlon', 'intersport', 'gosport', 'kiabi', 'jules', 'celio', 'etam', 'promod', 'pimkie',
  'galerieslafayette', 'printemps', 'sephora', 'yvesrocher', 'nocibe', 'marionnaud',
  'skechers', 'zara', 'inditex', 'hm', 'primark', 'uniqlo', 'lush', 'rituals', 'pandora',
  'swarovski', 'kering', 'chanel', 'hermes', 'loreal', 'clarins', 'pierrefabre', 'sezane',
  'optic2000', 'krys', 'afflelou', 'grandvision', 'alltricks', 'cultura', 'action', 'normal',
  'gifi', 'stokomani', 'noz', 'foirfouille', 'lapetiteboutique',

  // ── Santé, médico-social, laboratoires ───────────────────────────────────
  'clariane', 'korian', 'emeis', 'orpea', 'domusvi', 'colisee', 'lnasante', 'ramsaysante',
  'elsan', 'vivalto', 'biogroup', 'cerba', 'synlab', 'unilabs', 'servier', 'sanofi', 'ipsen',
  'pierrefabregroup', 'boironlab', 'fresenius', 'diaverum', 'medtronic', 'stryker',
  'ambuliance', 'jussieusecours', 'lna', 'aesio', 'vyv', 'malakoffhumanis',

  // ── Services, propreté, sécurité, intérim ────────────────────────────────
  'onet', 'samsic', 'atalian', 'iss', 'issfrance', 'securitas', 'seris', 'gs4', 'g4s',
  'manpower', 'manpowergroup', 'adecco', 'randstad', 'synergie', 'crit', 'proman',
  'startpeople', 'temporis', 'gojob', 'brigad', 'staffme', 'teleperformance', 'webhelp',
  'concentrix', 'majorel', 'foundever', 'sitel', 'armatis', 'intelcia', 'comdata',
  'o2', 'shiva', 'adhap', 'aideadomicile', 'petitsfils', 'familiesetservices',

  // ── Transport, logistique, automobile ────────────────────────────────────
  'keolis', 'transdev', 'ratp', 'ratpdev', 'sncf', 'airfrance', 'transavia', 'easyjet',
  'geodis', 'dhl', 'kuehnenagel', 'fmlogistic', 'xpo', 'gxo', 'chronopost', 'dpd', 'laposte',
  'idlogistics', 'stef', 'heppner', 'dbschenker', 'ceva', 'cevalogistics', 'amazon',
  'norauto', 'midas', 'speedy', 'feuvert', 'points', 'europcar', 'hertz', 'avisbudget',
  'sixt', 'ayvens', 'stellantis', 'renault', 'renaultgroup', 'toyota', 'volkswagen',
  'bmwgroup', 'mercedesbenz', 'valeo', 'forvia', 'faurecia', 'plasticomnium', 'opmobility',
  'michelin', 'continental', 'schaeffler', 'zf',

  // ── Industrie, énergie, BTP ──────────────────────────────────────────────
  'equans', 'engie', 'dalkia', 'edf', 'totalenergies', 'veolia', 'suez', 'saur', 'spie',
  'vinci', 'vinciconstruction', 'vinciennergies', 'eiffage', 'bouygues', 'colas',
  'bouyguesconstruction', 'saintgobain', 'legrand', 'schneiderelectric', 'hager', 'somfy',
  'airliquide', 'arkema', 'solvay', 'danone', 'lactalis', 'savencia', 'bonduelle', 'fleurymichon',
  'pernodricard', 'remycointreau', 'heineken', 'cocacola', 'nestle', 'unilever', 'ferrero',
  'mars', 'mondelez', 'safran', 'thales', 'airbus', 'dassault', 'naval', 'navalgroup',
  'alstom', 'siemens', 'abb', 'bosch', 'boschfrance', 'daikin', 'atlantic', 'groupeatlantic',
  'tereos', 'avril', 'sodiaal', 'terrena', 'agrial', 'invivo',

  // ── Ingénierie, conseil, numérique ───────────────────────────────────────
  'akkodis', 'altran', 'expleo', 'assystem', 'segula', 'segulatechnologies', 'capgemini',
  'accenture', 'soprasteria', 'cgi', 'atos', 'eviden', 'wavestone', 'sia', 'kpmg', 'ey',
  'deloitte', 'pwc', 'mazars', 'forvismazars', 'onepoint', 'talan', 'sii', 'aubay',
  'neurones', 'inetum', 'econocom', 'scc', 'spiegroup', 'davidson', 'ausy', 'apside',
  'positivethinkingcompany', 'extia', 'meritis', 'viveris', 'niji', 'ippon', 'octo',
  'publicis', 'publicisgroupe', 'havas', 'dentsu', 'wpp', 'criteo', 'gameloft', 'ubisoft',
  'dassaultsystemes', 'ovhcloud', 'orange', 'sfr', 'bouyguestelecom', 'free', 'iliad',

  // ── Banque, assurance, immobilier ────────────────────────────────────────
  'axa', 'allianz', 'generali', 'groupama', 'maif', 'macif', 'matmut', 'covea', 'cnp',
  'bnpparibas', 'societegenerale', 'creditagricole', 'lcl', 'bpce', 'creditmutuel',
  'boursorama', 'hellobank', 'cofidis', 'oney', 'nexity', 'foncia', 'citya', 'orpi',
  'century21', 'laforet', 'iadfrance', 'safti', 'cbre', 'jll', 'cushmanwakefield', 'savills',
  'bnpparibasrealestate', 'icade', 'unibailrodamcowestfield', 'klepierre',

  // ── Éducation, sport, divers ─────────────────────────────────────────────
  'basicfit', 'fitnesspark', 'keepcool', 'onair', 'cmgsports', 'ucpa', 'acadomia',
  'completude', 'studialis', 'galileoglobaleducation', 'ionis', 'omnes', 'skillandyou',
  'openclassrooms', 'studi', 'croixrouge', 'emmaus', 'apf', 'adapei',
];
