// Candidats au catalogue Ashby : des slugs PLAUSIBLES, pas un catalogue.
// Rien d'ici n'entre en production sans être passé par
// `verifier-boards.mjs`, qui seul constate qu'un board PORTE des offres.
//
// POURQUOI ASHBY, ET POURQUOI MAINTENANT. Les trois relevés précédents ont
// convergé sur une liste de huit scale-ups françaises qu'aucun ATS crawlé
// n'avait : Alan, Pennylane, Spendesk, Ledger, Back Market, Leboncoin,
// Mistral, OVHcloud. Le sondage de clôture du relevé Teamtailor les a
// cherchées ailleurs et en a trouvé quatre chez Ashby — Alan (130 offres),
// Pennylane (169), Back Market (33), Ledger (13). Alan et Pennylane portent à
// elles deux plus d'offres que tout le catalogue Teamtailor.
//
// Ce relevé part donc d'une piste mesurée, pas d'une intuition.
//
// LA LISTE mêle les scale-ups françaises, la base de clients connue d'Ashby —
// surtout des entreprises tech bien financées, IA, fintech et outils de
// développement — et les entreprises européennes qui recrutent en France.
//
// Les 404 restent dans cette liste À DESSEIN, comme pour les trois ATS
// précédents : ce fichier est la trace de ce qui a été ESSAYÉ, et sans elle le
// prochain curateur retesterait les mêmes slugs morts en croyant les
// découvrir.
export const CANDIDATS = [
  // ── Les huit introuvables, et ce que le relevé Teamtailor en a dit ──────
  'alan', 'pennylane', 'backmarket', 'back-market', 'ledger', 'ledgerhq',
  'spendesk', 'leboncoin', 'mistral', 'mistralai', 'ovhcloud', 'ovh',

  // ── Scale-ups et entreprises françaises ─────────────────────────────────
  'qonto', 'swile', 'payfit', 'malt', 'blablacar', 'doctolib', 'contentsquare',
  'dataiku', 'mirakl', 'sorare', 'ankorstore', 'aircall', 'algolia',
  'younited', 'lydia', 'vestiairecollective', 'sunday', '360learning',
  'getaround', 'deezer', 'criteo', 'ivalua', 'exotec', 'verkor',
  'huggingface', 'photoroom', 'pigment', 'gorgias', 'agicap', 'veepee',
  'manomano', 'openclassrooms', 'voodoo', 'ubisoft', 'dailymotion',
  'scaleway', 'lucca', 'partoo', 'shippeo', 'akeneo', 'brevo', 'luko',
  'withings', 'devialet', 'jow', 'believe', 'teads', 'adevinta',
  'welcometothejungle', 'ornikar', 'meilleursagents', 'meero', 'libeo',
  'upflow', 'silvr', 'defacto', 'comet', 'kyriba', 'owkin', 'iadvize',
  'prophesee', 'alma', 'getalma', 'joko', 'skello', 'combo', 'payflows',
  'kiln', 'morpho', 'spiko', 'tiime', 'regate', 'pretto', 'wakam',
  'leocare', 'acheel', 'seyna', 'zenchef', 'innovorder', 'choco', 'foodles',
  'ynsect', 'innovafeed', 'electra', 'zeplug', 'dott', 'fifteen', 'cowboy',
  'ecovadis', 'greenly', 'sweep', 'matera', 'homa', 'gameloft', 'sellsy',
  'batch', 'brigad', 'cubyn', 'fretlink', 'ovrsea', 'shipup', 'stuart',
  'shine', 'nickel', 'swan', 'treezor', 'lemonway', 'hiway', 'jump',
  'side', 'hublo', 'medadom', 'lifen', 'nabla', 'posos', 'meilisearch',
  'qovery', 'clever-cloud', 'cleverCloud', 'scalingo', 'platformsh',
  'datadome', 'sqreen', 'cryptosense', 'tehtris', 'vadesecure', 'glimps',
  'hiventive', 'ledgity', 'fairmint', 'bitstack', 'coinhouse', 'paymium',
  'descartesunderwriting', 'shift-technology', 'zelros', 'akur8', 'tinubu',
  'ledgerinsights', 'younited-credit', 'finary', 'yomoni', 'ramify',
  'cashbee', 'goodvest', 'green-got', 'helios', 'tomorrow',

  // ── La base Ashby : tech bien financée, IA, fintech, outils dev ─────────
  'ashby', 'ashbyhq', 'notion', 'linear', 'ramp', 'brex', 'deel', 'rippling',
  'vanta', 'drata', 'secureframe', 'retool', 'airplane', 'render',
  'railway', 'fly', 'supabase', 'planetscale', 'neon', 'xata', 'turso',
  'clerk', 'workos', 'stytch', 'propelauth', 'hanko',
  'posthog', 'june', 'mixpanel', 'amplitude', 'heap', 'statsig',
  'launchdarkly', 'split', 'flagsmith', 'unleash',
  'temporal', 'inngest', 'trigger', 'defer', 'hatchet',
  'sentry', 'highlight', 'bugsnag', 'rollbar', 'honeycomb',
  'grafana', 'chronosphere', 'cribl', 'observe', 'axiom',
  'dbt-labs', 'dbtlabs', 'fivetran', 'airbyte', 'hightouch', 'census',
  'dagster', 'prefect', 'astronomer', 'estuary',
  'clickhouse', 'tinybird', 'materialize', 'singlestore', 'timescale',
  'cockroachlabs', 'yugabyte', 'edgedb', 'surrealdb',
  'pinecone', 'weaviate', 'qdrant', 'chroma', 'lancedb', 'marqo',
  'langchain', 'llamaindex', 'humanloop', 'braintrust', 'langfuse',
  'openai', 'anthropic', 'cohere', 'adept', 'inflection', 'character',
  'perplexity', 'glean', 'harvey', 'hebbia', 'sierra', 'decagon',
  'replicate', 'modal', 'baseten', 'together', 'fireworks', 'anyscale',
  'runpod', 'lambdalabs', 'coreweave', 'nebius',
  'scale', 'scaleai', 'labelbox', 'surge', 'invisible', 'mercor',
  'elevenlabs', 'assemblyai', 'deepgram', 'suno', 'udio',
  'runway', 'pika', 'lumalabs', 'midjourney', 'ideogram', 'leonardo',
  'synthesia', 'heygen', 'descript', 'opus', 'captions',
  'figma', 'framer', 'spline', 'rive', 'playbook',
  'vercel', 'netlify', 'cloudflare', 'fastly', 'bunny',
  'stripe', 'mercury', 'column', 'increase', 'unit', 'lithic',
  'modern-treasury', 'moderntreasury', 'plaid', 'teller', 'method',
  'checkr', 'persona', 'alloy', 'sardine', 'unit21',
  'gusto', 'rippling-hr', 'justworks', 'oyster', 'remote',
  'lattice', 'cultureamp', 'leapsome', 'charthop',
  'gong', 'chorus', 'clari', 'outreach', 'apollo', 'clay',
  'attio', 'folk', 'pipedrive', 'close', 'hubspot',
  'intercom', 'front', 'pylon', 'plain', 'unthread',
  'mintlify', 'readme', 'scalar', 'stainless', 'speakeasy',
  'warp', 'fig', 'raycast', 'arc', 'browsercompany',
  'cursor', 'anysphere', 'codeium', 'tabnine', 'sourcegraph', 'magic',
  'replit', 'stackblitz', 'codesandbox', 'gitpod', 'coder',
  'github', 'gitlab', 'sourcery', 'graphite', 'aviator',

  // ── Europe et Royaume-Uni ───────────────────────────────────────────────
  'revolut', 'monzo', 'starling', 'wise', 'gocardless', 'checkout',
  'paddle', 'truelayer', 'thoughtmachine', 'form3', 'zilch', 'curve',
  'onfido', 'cleo', 'marshmallow', 'multiverse', 'depop', 'vinted',
  'typeform', 'factorial', 'travelperk', 'seedtag', 'docplanner',
  'personio', 'celonis', 'getyourguide', 'n26', 'traderepublic',
  'sumup', 'pleo', 'juni', 'lunar', 'tink', 'klarna', 'northvolt',
  'bolt', 'wolt', 'glovo', 'cabify', 'veriff', 'pipedrive-eu',
  'mews', 'productboard', 'rohlik', 'kiwi', 'bitpanda', 'gostudent',
  'dynatrace', 'adyen', 'mollie', 'messagebird', 'bunq', 'picnic',
  'aiven', 'supercell', 'relex', 'smartly', 'oura', 'swappie',
  'oatly', 'kry', 'voi', 'einride', 'trustly', 'budbee', 'tibber',
];
