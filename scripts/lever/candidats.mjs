// Candidats au catalogue Lever : des slugs PLAUSIBLES, pas un catalogue.
// Rien d'ici n'entre en production sans être passé par
// `verifier-boards.mjs`, qui seul constate qu'un board répond.
//
// POURQUOI CETTE LISTE-LÀ, et pas un autre tirage. Le relevé Greenhouse du
// 2026-10-19 a laissé un trou précis : 5,2 % seulement de ses offres étaient
// en France, et les scale-ups françaises les plus évidentes y répondaient
// toutes 404 — Qonto, Alan, Swile, Payfit, Pennylane, Spendesk, Ledger,
// BlaBlaCar, Back Market, Leboncoin, Malt, Mistral, OVHcloud. Un ATS
// anglophone ne porte pas le marché français. L'hypothèse à tester est donc
// que ces entreprises sont ailleurs, et Lever est le candidat suivant.
//
// Les 404 restent dans cette liste À DESSEIN, comme chez Greenhouse : ce
// fichier est la trace de ce qui a été ESSAYÉ, et sans elle le prochain
// curateur retesterait les mêmes slugs morts en croyant les découvrir.
export const CANDIDATS = [
  // ── Les treize que Greenhouse n'avait pas, en premier ───────────────────
  'qonto', 'alan', 'swile', 'payfit', 'pennylane', 'spendesk', 'ledger',
  'blablacar', 'backmarket', 'back-market', 'leboncoin', 'malt', 'mistral',
  'mistralai', 'ovhcloud', 'ovh',

  // ── Scale-ups et licornes françaises ───────────────────────────────────
  'doctolib', 'contentsquare', 'dataiku', 'mirakl', 'sorare', 'ankorstore',
  'aircall', 'algolia', 'younited', 'lydia', 'vestiairecollective', 'sunday',
  '360learning', 'getaround', 'deezer', 'criteo', 'ivalua', 'exotec',
  'verkor', 'huggingface', 'photoroom', 'pigment', 'gorgias', 'agicap',
  'veepee', 'manomano', 'openclassrooms', 'voodoo', 'ubisoft', 'dailymotion',
  'scaleway', 'lucca', 'partoo', 'shippeo', 'akeneo', 'talend', 'brevo',
  'sendinblue', 'luko', 'withings', 'devialet', 'jow', 'believe', 'teads',
  'adevinta', 'welcometothejungle', 'wttj', 'ornikar', 'meilleursagents',
  'meero', 'libeo', 'upflow', 'silvr', 'defacto', 'comet', 'kyriba',
  'dentalmonitoring', 'owkin', 'iadvize', 'prophesee', 'ledgerhq',
  'shift-technology', 'shifttechnology', 'jellysmack', 'sorare-labs',
  'alma', 'getalma', 'joko', 'skello', 'combo', 'payflows', 'qevlar',
  'hiflow', 'cajoo', 'flowdesk', 'kiln', 'morpho', 'fairmint', 'spiko',
  'tiime', 'regate', 'pretto', 'luko-insurance', 'descartes-underwriting',
  'descartesunderwriting', 'wakam', 'leocare', 'acheel', 'seyna',
  'zenchef', 'innovorder', 'choco', 'foodles', 'frichti', 'nestor',
  'ynsect', 'innovafeed', 'agriconomie', 'weenat', 'javelot',
  'electra', 'zeplug', 'beev', 'wattpark', 'mob-energy', 'gazelle',
  'dott', 'cityscoot', 'fifteen', 'zoov', 'pony', 'tier',
  'cowboy', 'angell', 'moustachebikes', 'virvolt',
  'ecovadis', 'greenly', 'sweep', 'carbo', 'plan-a', 'traace',
  'matera', 'homa', 'homagames', 'voodooio', 'gameloft', 'quantic-dream',
  'dontnod', 'asobo', 'amplitude-studios', 'spiders',
  'sellsy', 'axonaut', 'pennylane-tech', 'fygr', 'rubypayeur',
  'batch', 'brigad', 'cubyn', 'everoad', 'sennder-fr', 'fretlink',
  'ovrsea', 'shipup', 'colisweb', 'stuart', 'woop',
  'spartoo', 'showroomprive', 'cdiscount', 'fnac', 'laredoute',
  'sarenza', 'sezane', 'balzac-paris', 'asphalte', 'loom',
  'tediber', 'emma', 'merinos', 'kipli', 'maisons-du-monde',
  'typology', 'respire', 'nidé', 'oden', 'cozie',

  // ── Entreprises tech étrangères connues pour recruter en France ─────────
  'netflix', 'spotify', 'shopify', 'twitch', 'quora', 'lyft', 'coinbase',
  'palantir', 'plaid', 'brex', 'ramp', 'rippling', 'deel', 'remote',
  'personio', 'celonis', 'getyourguide', 'n26', 'trade-republic',
  'traderepublic', 'wefox', 'raisin', 'solarisbank', 'mambu', 'sumup',
  'klarna', 'tink', 'pleo', 'juni', 'lunar', 'northvolt', 'einride',
  'bolt', 'wolt', 'glovo', 'cabify', 'typeform', 'factorial', 'jobandtalent',
  'travelperk', 'redpoints', 'seedtag', 'jeff', 'exoticca',
  'docplanner', 'zowie', 'booksy', 'packhelp', 'autenti',
  'uipath', 'bitdefender', 'fintechos', 'elrond', 'multiversx',
  'revolut', 'monzo', 'starlingbank', 'wise', 'gocardless', 'checkout',
  'paddle', 'truelayer', 'thoughtmachine', 'form3', 'zilch', 'curve',
  'onfido', 'cleo', 'marshmallow', 'beam', 'multiverse',
  'deliveroo', 'gousto', 'huel', 'papier', 'depop', 'vinted',
  'bolttech', 'luno', 'yoco', 'chipper', 'flutterwave',
  'databricks', 'snowflake', 'confluent', 'hashicorp', 'gitlab',
  'elastic', 'mongodb', 'neo4j', 'datastax', 'cockroachlabs',
  'dbt-labs', 'dbtlabs', 'fivetran', 'airbyte', 'dagster', 'prefect',
  'temporal', 'grafana', 'chronosphere', 'honeycomb', 'lightstep',
  'sentry', 'rollbar', 'bugsnag', 'launchdarkly', 'split',
  'segment', 'amplitude', 'mixpanel', 'heap', 'posthog', 'june',
  'algolia-search', 'meilisearch', 'typesense', 'qdrant', 'weaviate',
  'pinecone', 'chroma', 'langchain', 'llamaindex',
  'stability', 'stabilityai', 'cohere', 'anthropic', 'openai',
  'scale', 'scaleai', 'labelbox', 'snorkel', 'weightsandbiases',
  'replicate', 'modal', 'anyscale', 'together', 'fireworks',
  'figma', 'canva', 'miro', 'notion', 'linear', 'airtable', 'retool',
  'zapier', 'make', 'n8n', 'tray', 'workato',
  'intercom', 'front', 'zendesk', 'freshworks', 'hubspot',
  'pipedrive', 'close', 'outreach', 'salesloft', 'gong', 'chorus',
  'lattice', 'culture-amp', 'cultureamp', 'gusto', 'justworks',
  'remote-com', 'oyster', 'papaya', 'velocity-global',
  'contentful', 'sanity', 'strapi', 'storyblok', 'prismic',
  'vercel', 'netlify', 'render', 'railway', 'fly', 'supabase',
  'planetscale', 'neon', 'xata', 'turso', 'upstash',
  'auth0', 'okta', 'clerk', 'workos', 'stytch', 'frontegg',
  'twilio', 'sendgrid', 'mailgun', 'postmark', 'resend', 'loops',
  'stripe', 'adyen', 'mollie', 'rapyd', 'airwallex', 'nium',
  'toast', 'lightspeed', 'square', 'shopware', 'commercetools',
  'veeva', 'benchling', 'dotmatics', 'schrodinger',
  'tempus', 'flatiron', 'komodo', 'truveta',
];
