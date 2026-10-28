// Candidats au catalogue Teamtailor : des slugs PLAUSIBLES, pas un catalogue.
// Rien d'ici n'entre en production sans être passé par
// `verifier-boards.mjs`, qui seul constate qu'un board répond.
//
// POURQUOI TEAMTAILOR, ET POURQUOI CETTE LISTE. Les deux relevés précédents
// ont laissé un trou nommé. Greenhouse (2026-10-19) : 5,2 % d'offres
// françaises. Lever (2026-10-21) : 17,4 %, mais ZÉRO entreprise qu'emploia ne
// servait pas déjà. Treize scale-ups françaises évidentes manquaient aux deux ;
// Lever en a rendu quatre (Qonto, Swile, Malt, BlaBlaCar), et neuf restaient
// introuvables — Alan, Payfit, Pennylane, Spendesk, Ledger, Back Market,
// Leboncoin, Mistral, OVHcloud.
//
// Le critère de ce troisième relevé n'est donc PAS le nombre d'offres, c'est
// le nombre d'ENTREPRISES NOUVELLES. Un ATS qui ajoute des offres d'employeurs
// déjà couverts rend la liste plus profonde ; un ATS qui ajoute des employeurs
// rend le site utile à des candidats qu'il ne servait pas.
//
// Teamtailor est nordique et vend en Europe continentale, donc ses clients
// sont rarement ceux des deux ATS américains que les agrégateurs republient
// déjà. La liste mêle les neuf manquants, les scale-ups françaises, et les
// entreprises nordiques et européennes connues pour recruter en France.
//
// Les 404 restent dans cette liste À DESSEIN, comme pour Greenhouse et Lever :
// ce fichier est la trace de ce qui a été ESSAYÉ, et sans elle le prochain
// curateur retesterait les mêmes slugs morts en croyant les découvrir.
export const CANDIDATS = [
  // ── Les neuf que ni Greenhouse ni Lever n'avaient ───────────────────────
  'alan', 'payfit', 'pennylane', 'spendesk', 'ledger', 'ledgerhq',
  'backmarket', 'back-market', 'leboncoin', 'mistral', 'mistralai',
  'ovhcloud', 'ovh',

  // ── Scale-ups et entreprises françaises ─────────────────────────────────
  'qonto', 'swile', 'malt', 'blablacar', 'doctolib', 'contentsquare',
  'dataiku', 'mirakl', 'sorare', 'ankorstore', 'aircall', 'algolia',
  'younited', 'lydia', 'vestiairecollective', 'sunday', '360learning',
  'getaround', 'deezer', 'criteo', 'ivalua', 'exotec', 'verkor',
  'huggingface', 'photoroom', 'pigment', 'gorgias', 'agicap', 'veepee',
  'manomano', 'openclassrooms', 'voodoo', 'ubisoft', 'dailymotion',
  'scaleway', 'lucca', 'partoo', 'shippeo', 'akeneo', 'brevo', 'luko',
  'withings', 'devialet', 'jow', 'believe', 'teads', 'adevinta',
  'welcometothejungle', 'wttj', 'ornikar', 'meilleursagents', 'meero',
  'libeo', 'upflow', 'silvr', 'defacto', 'comet', 'kyriba', 'owkin',
  'iadvize', 'prophesee', 'alma', 'getalma', 'joko', 'skello', 'combo',
  'payflows', 'kiln', 'morpho', 'spiko', 'tiime', 'regate', 'pretto',
  'wakam', 'leocare', 'acheel', 'seyna', 'zenchef', 'innovorder', 'choco',
  'foodles', 'frichti', 'ynsect', 'innovafeed', 'agriconomie', 'electra',
  'zeplug', 'beev', 'dott', 'cityscoot', 'fifteen', 'cowboy', 'ecovadis',
  'greenly', 'sweep', 'carbo', 'matera', 'homa', 'gameloft', 'dontnod',
  'sellsy', 'axonaut', 'batch', 'brigad', 'cubyn', 'fretlink', 'ovrsea',
  'shipup', 'colisweb', 'stuart', 'spartoo', 'showroomprive', 'cdiscount',
  'laredoute', 'sezane', 'tediber', 'typology', 'respire', 'lafourche',
  'jimmyfairly', 'nickel', 'shine', 'memo-bank', 'memobank', 'swan',
  'treezor', 'lemonway', 'hiway', 'jump', 'embarq', 'side', 'crew',
  'wttj-group', 'hublo', 'medadom', 'lifen', 'nabla', 'posos', 'honestica',

  // ── Le marché nordique, cœur de Teamtailor ──────────────────────────────
  'teamtailor', 'oatly', 'kry', 'livi', 'normative', 'voi', 'einride',
  'northvolt', 'klarna', 'tink', 'trustly', 'izettle', 'budbee', 'instabox',
  'mathem', 'tibber', 'lendify', 'anyfin', 'juni', 'pleo', 'lunar',
  'templafy', 'zendesk', 'siteimprove', 'trustpilot', 'unity', 'planday',
  'corti', 'donkey', 'vivino', 'podimo', 'too-good-to-go', 'toogoodtogo',
  'wolt', 'supercell', 'relex', 'smartly', 'aiven', 'swappie', 'oura',
  'iceye', 'varjo', 'epassi', 'sanoma', 'reaktor', 'futurice', 'vincit',
  'kognitiv', 'cognite', 'xeneta', 'remarkable', 'tise', 'oda', 'kolonial',
  'vipps', 'gelato', 'no-isolation', 'huddly', 'zedge', 'spacemaker',

  // ── Europe continentale et Royaume-Uni ──────────────────────────────────
  'personio', 'celonis', 'getyourguide', 'n26', 'traderepublic', 'wefox',
  'raisin', 'solarisbank', 'mambu', 'sumup', 'grover', 'forto', 'sennder',
  'choco-app', 'enpal', 'taxfix', 'moonfare', 'scalable', 'clark',
  'flixbus', 'flix', 'omio', 'tourlane', 'homelike', 'mysugr',
  'bitpanda', 'gostudent', 'refurbed', 'storyblok', 'dynatrace',
  'adyen', 'mollie', 'messagebird', 'bird', 'backbase', 'bunq',
  'picnic', 'catawiki', 'takeaway', 'justeattakeaway', 'mews',
  'rohlik', 'productboard', 'kiwi', 'pipedrive', 'bolt', 'veriff',
  'wise', 'glia', 'starship', 'skeleton', 'zego', 'cazoo', 'bulb',
  'monzo', 'starling', 'gocardless', 'checkout', 'paddle', 'truelayer',
  'thoughtmachine', 'form3', 'zilch', 'curve', 'onfido', 'cleo',
  'marshmallow', 'multiverse', 'depop', 'vinted', 'gousto', 'huel',
  'typeform', 'factorial', 'jobandtalent', 'travelperk', 'redpoints',
  'seedtag', 'exoticca', 'docplanner', 'booksy', 'packhelp',
  'uipath', 'bitdefender', 'glovo', 'cabify', 'jeff', 'paack',
  'wallbox', 'cover-manager', 'holded', 'cobee', 'payflow',

  // ── Entreprises tech mondiales recrutant en Europe ──────────────────────
  'spotify', 'shopify', 'netflix', 'databricks', 'snowflake', 'confluent',
  'hashicorp', 'gitlab', 'elastic', 'mongodb', 'neo4j', 'grafana',
  'sentry', 'posthog', 'supabase', 'vercel', 'netlify', 'contentful',
  'sanity', 'strapi', 'prismic', 'algolia-search', 'meilisearch',
  'qdrant', 'weaviate', 'cohere', 'stabilityai', 'huggingface-hub',
  'figma', 'canva', 'miro', 'notion', 'linear', 'airtable', 'retool',
  'zapier', 'intercom', 'front', 'freshworks', 'hubspot', 'close',
  'gong', 'lattice', 'cultureamp', 'gusto', 'deel', 'remote', 'oyster',
  'papaya', 'twilio', 'sendgrid', 'resend', 'stripe', 'airwallex',
  'nium', 'rapyd', 'toast', 'lightspeed', 'commercetools', 'shopware',
  'veeva', 'benchling', 'palantir', 'coinbase', 'plaid', 'brex', 'ramp',
  'rippling', 'anthropic', 'openai', 'scaleai', 'labelbox', 'replicate',
  'modal', 'anyscale', 'together', 'fireworks', 'langchain',
];
