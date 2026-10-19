// Candidats au catalogue Greenhouse : des slugs PLAUSIBLES, pas un catalogue.
// Rien d'ici n'entre en production sans être passé par
// `verifier-boards.mjs`, qui seul constate qu'un board répond.
//
// Le choix : scale-ups et licornes françaises, plus les entreprises tech
// étrangères connues pour recruter en France. Greenhouse est un ATS surtout
// anglophone — l'hypothèse à tester est justement de savoir combien d'offres
// FRANÇAISES il porte réellement.
//
// Relevé du 2026-10-19 sur ces 319 candidats : 63 boards répondent, 256
// répondent 404. Les 404 restent dans cette liste À DESSEIN : ce fichier est
// la trace de ce qui a été ESSAYÉ, et sans elle le prochain curateur
// retesterait les mêmes slugs morts en croyant les découvrir.
export const CANDIDATS = [
  'doctolib', 'qonto', 'alan', 'swile', 'payfit', 'contentsquare', 'dataiku',
  'mirakl', 'backmarket', 'back-market', 'ledger', 'sorare', 'ankorstore',
  'spendesk', 'pennylane', 'aircall', 'algolia', 'shifttechnology', 'shift',
  'younited', 'lydia', 'jellysmack', 'vestiairecollective', 'malt',
  '360learning', 'getaround', 'blablacar', 'deezer', 'criteo', 'ivalua',
  'exotec', 'verkor', 'mistralai', 'mistral', 'huggingface', 'photoroom',
  'pigment', 'gorgias', 'agicap', 'leboncoin', 'veepee', 'manomano',
  'openclassrooms', 'voodoo', 'ubisoft', 'dailymotion', 'scaleway', 'lucca',
  'partoo', 'platformsh', 'shippeo', 'akeneo', 'talend', 'brevo',
  'sendinblue', 'luko', 'withings', 'devialet', 'jow', 'believe', 'teads',
  'adevinta', 'welcometothejungle', 'wttj', 'ornikar', 'meilleursagents',
  'meero', 'cajoo', 'sunday', 'libeo', 'upflow', 'silvr', 'defacto', 'memo',
  'hiflow', 'cometeo', 'comet', 'kyriba', 'dental-monitoring',
  'dentalmonitoring', 'owkin', 'iadvize', 'tinyclues', 'dcbrain', 'sinay',
  'cosmian', 'prophesee', 'ledgerhq', 'younitedcredit', 'bpifrance', 'octo',
  'theodo', 'sipios', 'padok', 'zenika', 'deuxfleurs', 'clever-cloud',
  'clevercloud', 'numberly', 'datadome', 'sqreen', 'cryptosense', 'snips',
  'heuritech', 'golem', 'skello', 'combo', 'payfitfr', 'factorial',
  'legalstart', 'captaincontrat', 'hellowork', 'figaro', 'lefigaro',
  'mediapart', 'arte', 'radiofrance', 'stripe', 'datadog', 'gitlab', 'figma',
  'notion', 'airbnb', 'dropbox', 'cloudflare', 'elastic', 'mongodb',
  'hashicorp', 'confluent', 'snowflake', 'databricks', 'sentry', 'vercel',
  'supabase', 'canva', 'miro', 'typeform', 'personio', 'n8n', 'deepl',
  'spotify', 'klarna', 'revolut', 'n26', 'wise', 'bolt', 'glovo', 'justeat',
  'deliveroo', 'uber', 'lyft', 'doordash', 'zalando', 'booking', 'expedia',
  'tripadvisor', 'skyscanner', 'getyourguide', 'contentful', 'algoliafr',
  'amplitude', 'segment', 'mixpanel', 'hotjar', 'pleo', 'remote', 'deel',
  'rippling', 'gusto', 'brex', 'ramp', 'mercury', 'anthropic', 'openai',
  'scaleai', 'cohere', 'stabilityai', 'runway', 'nvidia', 'amd', 'intel',
  'qualcomm', 'arm', 'sifive', 'graphcore', 'sonos', 'tesla', 'rivian',
  'northvolt', 'einride', 'wallbox', 'voltalia', 'alma', 'qare', 'tiime',
  'yousign', 'aramisauto', 'vulog', 'sellsy', 'batch', 'brigad', 'cubyn',
  'dalma', 'descartesunderwriting', 'ecovadis', 'flowdesk', 'hublo', 'indy',
  'kard', 'karnott', 'klaxoon', 'lifen', 'livestorm', 'matera', 'medadom',
  'nickel', 'onfido', 'payplug', 'phenix', 'pretto', 'rydoo', 'swan',
  'tehtris', 'ubble', 'vade', 'wemaintain', 'worklife', 'yubo', 'zefir',
  'trainline', 'sncf', 'michelin', 'loreal', 'sanofi', 'airbus', 'thales',
  'safran', 'capgemini', 'atos', 'sopra', 'worldline', 'edenred', 'ingenico',
  'accor', 'carrefour', 'decathlon', 'backmarketjobs', 'sorareofficial',
  'twilio', 'hubspot', 'zendesk', 'asana', 'slack', 'atlassian', 'cloudbees',
  'snyk', 'jfrog', 'sumologic', 'newrelic', 'pagerduty', 'fastly', 'akamai',
  'okta', 'auth0', 'onetrust', 'sprinklr', 'braze', 'iterable', 'klaviyo',
  'attentive', 'gong', 'outreach', 'clari', 'instacart', 'robinhood',
  'coinbase', 'kraken', 'bitpanda', 'chainalysis', 'consensys', 'alchemy',
  'circle', 'checkoutcom', 'adyen', 'mollie', 'sumup', 'gocardless', 'tink',
  'truelayer', 'unity', 'epicgames', 'riotgames', 'king', 'rovio',
  'supercell', 'spendeskhq', 'qontoit', 'alantech', 'veolia', 'engie',
  'totalenergies', 'schneiderelectric', 'danone', 'pernodricard', 'lvmh',
  'kering', 'chanel', 'servicenow', 'workday', 'splunk', 'zscaler',
  'crowdstrike', 'sentinelone', 'palantir', 'scale', 'weights-biases',
  'wandb', 'perplexityai', 'together',
];
