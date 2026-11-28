// Lexique des compétences demandées par les offres du marché français.
//
// Sert à deux endroits, qui doivent lire de la même façon :
//   · les collecteurs ATS (Ashby, Greenhouse, Lever, Teamtailor), qui voient la
//     description COMPLÈTE et gardent `competences` avec chaque offre — la
//     description stockée, elle, est tronquée à 300 caractères ;
//   · le simulateur de filtre ATS (api/filtre-ats.js), qui lit le CV.
//
// Chaque motif s'applique à un texte en minuscules SANS ACCENTS (`normaliser`).
// Un motif doit rester sans ambiguïté : « Go », « R » ou « C » sont absents
// exprès, ils se confondraient avec des mots courants. Ajouter une entrée :
// un identifiant court et stable (il est stocké dans le KV), un nom affiché,
// un motif — et un cas dans scripts/smoke/competences.test.mjs.

const L = (id, nom, motif) => ({ id, nom, re: new RegExp(motif, 'i') });
const B = (s) => `(?:^|[^a-z0-9])(?:${s})(?![a-z0-9])`; // borne de mot, tolère « . + # »

export const COMPETENCES = [
  // Langues
  L('anglais', 'Anglais', B('anglais|english|bilingue anglais')),
  L('espagnol', 'Espagnol', B('espagnol|spanish')),
  L('allemand', 'Allemand', B('allemand|german')),
  L('italien', 'Italien', B('italien(?:ne)?|italian')),
  L('neerlandais', 'Néerlandais', B('neerlandais|dutch')),

  // Bureautique, gestion
  L('excel', 'Excel', B('excel')),
  L('vba', 'VBA', B('vba')),
  L('powerpoint', 'PowerPoint', B('powerpoint|power point')),
  L('pack-office', 'Pack Office', B('pack office|suite office|microsoft office|ms office')),
  L('sap', 'SAP', B('sap')),
  L('erp', 'ERP', B('erp')),
  L('salesforce', 'Salesforce', B('salesforce')),
  L('crm', 'CRM', B('crm')),
  L('hubspot', 'HubSpot', B('hubspot')),
  L('notion', 'Notion', B('notion\\.so|outil notion|sur notion')),
  L('jira', 'Jira', B('jira')),
  L('gestion-projet', 'Gestion de projet', B('gestion de projets?|chef(?:fe)? de projets?|project management|pilotage de projets?')),
  L('agile', 'Méthodes agiles', B('agile|agilite')),
  L('scrum', 'Scrum', B('scrum')),
  L('gestion-budget', 'Gestion de budget', B('gestion (?:de|du|des) budgets?|suivi budgetaire|pilotage budgetaire|budget management')),

  // Data, BI
  L('sql', 'SQL', B('sql')),
  L('power-bi', 'Power BI', B('power ?bi')),
  L('tableau', 'Tableau (logiciel)', B('tableau software|tableau desktop|sous tableau|tableau, power ?bi|power ?bi, tableau|tableau ou power ?bi|power ?bi ou tableau')),
  L('looker', 'Looker', B('looker')),
  L('python', 'Python', B('python')),
  L('pandas', 'Pandas', B('pandas')),
  L('machine-learning', 'Machine learning', B('machine learning|apprentissage automatique|deep learning')),
  L('ia-generative', 'IA générative', B('ia generative|genai|generative ai|llm|llms|chatgpt|prompt engineering')),
  L('spark', 'Spark', B('spark|pyspark')),
  L('dbt', 'dbt', B('dbt')),
  L('airflow', 'Airflow', B('airflow')),
  L('snowflake', 'Snowflake', B('snowflake')),
  L('bigquery', 'BigQuery', B('bigquery|big query')),
  L('data-analyse', 'Analyse de données', B('analyse de donnees|data analys(?:is|e|t)|analyses? de donnees')),

  // Développement
  // « js » seul, mais pas le suffixe de Node.js ou Vue.js.
  L('javascript', 'JavaScript', '(?:^|[^a-z0-9.])(?:javascript|js)(?![a-z0-9])'),
  L('typescript', 'TypeScript', B('typescript')),
  L('react', 'React', B('react(?:\\.?js)?')),
  L('react-native', 'React Native', B('react native')),
  L('angular', 'Angular', B('angular(?:js)?')),
  L('vue', 'Vue.js', B('vue\\.?js|vue 3|vuejs')),
  L('node', 'Node.js', B('node\\.?js|nodejs')),
  L('php', 'PHP', B('php')),
  L('symfony', 'Symfony', B('symfony')),
  L('laravel', 'Laravel', B('laravel')),
  L('java', 'Java', B('java(?!\\s*script)')),
  L('spring', 'Spring', B('spring boot|spring')),
  L('kotlin', 'Kotlin', B('kotlin')),
  L('swift', 'Swift', B('swift(?!\\s*code)')),
  L('csharp', 'C#', B('c#|c sharp')),
  L('dotnet', '.NET', B('\\.net|dotnet|asp\\.net')),
  L('cpp', 'C++', B('c\\+\\+')),
  L('golang', 'Go (Golang)', B('golang')),
  L('ruby', 'Ruby', B('ruby(?: on rails)?|rails')),
  L('html-css', 'HTML / CSS', B('html|css')),
  L('api-rest', 'API REST', B('api rest|apis? rest|rest api|restful|graphql')),
  L('git', 'Git', B('git|github|gitlab')),
  L('docker', 'Docker', B('docker')),
  L('kubernetes', 'Kubernetes', B('kubernetes|k8s')),
  L('terraform', 'Terraform', B('terraform')),
  L('ci-cd', 'CI/CD', B('ci ?/ ?cd|integration continue|deploiement continu')),
  L('aws', 'AWS', B('aws|amazon web services')),
  L('azure', 'Azure', B('azure')),
  L('gcp', 'Google Cloud', B('gcp|google cloud')),
  L('linux', 'Linux', B('linux|unix')),
  L('postgresql', 'PostgreSQL', B('postgres(?:ql)?')),
  L('mongodb', 'MongoDB', B('mongo ?db')),
  L('cybersecurite', 'Cybersécurité', B('cybersecurite|cyber ?security|securite informatique|securite des systemes')),
  L('reseaux', 'Réseaux informatiques', B('reseaux informatiques|administration reseau|tcp ?/ ?ip|cisco')),
  L('wordpress', 'WordPress', B('wordpress')),
  L('shopify', 'Shopify', B('shopify')),

  // Design
  L('figma', 'Figma', B('figma')),
  L('photoshop', 'Photoshop', B('photoshop')),
  L('illustrator', 'Illustrator', B('illustrator')),
  L('indesign', 'InDesign', B('indesign')),
  L('suite-adobe', 'Suite Adobe', B('suite adobe|adobe creative|creative cloud')),
  L('premiere', 'Premiere Pro', B('premiere pro|adobe premiere')),
  L('after-effects', 'After Effects', B('after effects')),
  L('canva', 'Canva', B('canva')),
  L('ux-ui', 'UX / UI design', B('ux|ui design|ux design|ui/ux|ux/ui|experience utilisateur')),

  // Marketing, communication
  L('seo', 'SEO', B('seo|referencement naturel')),
  L('sea', 'SEA', B('seo ?(?:/|et|&|,) ?sea|sea ?(?:/|et|&|,) ?seo|campagnes? sea|referencement payant|google ads|adwords|bing ads')),
  L('google-analytics', 'Google Analytics', B('google analytics|ga4')),
  L('meta-ads', 'Meta Ads', B('meta ads|facebook ads|instagram ads')),
  L('emailing', 'Emailing', B('e-?mailing|email marketing|newsletters?')),
  L('marketing-automation', 'Marketing automation', B('marketing automation|automation marketing|brevo|sendinblue|mailchimp')),
  L('reseaux-sociaux', 'Réseaux sociaux', B('reseaux sociaux|social media|community management|community manager')),
  L('content-marketing', 'Création de contenu', B('creation de contenus?|content marketing|brand content|redaction web|copywriting')),
  L('growth', 'Growth marketing', B('growth hacking|growth marketing|growth manager|growth marketer')),
  L('b2b', 'B2B', B('b2b')),
  L('b2c', 'B2C', B('b2c')),
  L('relations-presse', 'Relations presse', B('relations? presse|relations? medias')),
  L('evenementiel', 'Événementiel', B('evenementiel|organisation d.evenements')),

  // Commerce, relation client
  L('prospection', 'Prospection', B('prospection|prospecter|outbound|cold calling|lead generation')),
  L('negociation', 'Négociation commerciale', B('negociation|negocier')),
  L('grands-comptes', 'Grands comptes', B('grands comptes|key accounts?|account management')),
  L('relation-client', 'Relation client', B('relation clients?|service clients?|customer success|customer service|experience client')),
  L('vente', 'Vente', B('techniques de vente|vente conseil|vente en magasin|vendeur|vendeuse|experience (?:commerciale|en vente)|cycle de vente')),
  L('retail', 'Commerce de détail', B('merchandising|vente en magasin|points? de vente|grande distribution|retail store')),

  // Finance, comptabilité, juridique
  L('comptabilite', 'Comptabilité générale', B('comptabilite generale|tenue (?:de la )?comptab|saisie comptable|ecritures comptables')),
  L('compta-fournisseurs', 'Comptabilité fournisseurs', B('comptabilite fournisseurs?|compta fournisseurs?|accounts payable')),
  L('compta-clients', 'Comptabilité clients', B('comptabilite clients?|recouvrement|accounts receivable|credit management')),
  L('tva', 'TVA', B('tva|vat')),
  L('liasse-fiscale', 'Liasse fiscale', B('liasses? fiscales?')),
  L('bilan', 'Bilans et clôtures', B('bilans? comptables?|etablissement des bilans|revision des comptes|clotures? (?:mensuelles|annuelles|comptables|des comptes)|month-end closing|year-end closing')),
  L('consolidation', 'Consolidation', B('consolidation')),
  L('ifrs', 'IFRS', B('ifrs')),
  L('controle-gestion', 'Contrôle de gestion', B('controle de gestion|controleur de gestion|fp&a|fp ?& ?a')),
  L('reporting', 'Reporting', B('reporting')),
  L('tresorerie', 'Trésorerie', B('tresorerie|cash management')),
  L('audit', 'Audit', B('audit')),
  L('fiscalite', 'Fiscalité', B('fiscalite|droit fiscal')),
  L('paie', 'Paie', B('paie|payroll')),
  L('sage', 'Sage', B('sage (?:100|1000|x3|compta|paie)|logiciel sage|sous sage')),
  L('cegid', 'Cegid', B('cegid')),
  L('pennylane', 'Pennylane', B('pennylane')),
  L('droit', 'Droit', B('droit des affaires|droit du travail|droit social|juridique|contrats commerciaux')),
  L('rgpd', 'RGPD', B('rgpd|gdpr')),

  // RH
  L('recrutement', 'Recrutement', B('charge(?:e)? de recrutement|talent acquisition (?:specialist|manager|partner|lead)|sourcing de (?:candidats|profils)|gestion du recrutement|cycle de recrutement complet|recrutement de (?:profils|candidats)|full-cycle recruiting')),
  L('sirh', 'SIRH', B('sirh|hris|workday')),
  L('formation', 'Formation', B('ingenierie de formation|plan de formation|formateur|formatrice')),

  // Logistique, achats, industrie
  L('supply-chain', 'Supply chain', B('supply chain|chaine logistique')),
  L('logistique', 'Logistique', B('logistique|entrepot|preparation de commandes?')),
  L('gestion-stocks', 'Gestion des stocks', B('gestion des stocks|inventaires?|approvisionnements?')),
  L('achats', 'Achats', B('service achats|achats (?:industriels|indirects|directs)|acheteur|acheteuse|procurement|sourcing fournisseurs')),
  L('transport', 'Transport', B('transport routier|transport de marchandises|affretement|exploitation transport|plan de transport')),
  L('caces', 'CACES', B('caces')),
  L('lean', 'Lean', B('lean management|lean manufacturing|lean six sigma|methodes? lean|kaizen|six sigma')),
  L('qualite', 'Qualité', B('assurance qualite|controle qualite|responsable qualite|iso 9001|demarche qualite')),
  L('hse', 'HSE / sécurité', B('hse|qhse|sante securite environnement')),
  L('maintenance', 'Maintenance', B('maintenance')),
  L('electricite', 'Électricité', B('electricite|electrotechnique|habilitations? electriques?')),
  L('autocad', 'AutoCAD', B('autocad')),
  L('revit-bim', 'Revit / BIM', B('revit|bim')),
  L('solidworks', 'SolidWorks', B('solidworks')),
  L('catia', 'CATIA', B('catia')),

  // Santé, social, éducation
  L('soins', 'Soins infirmiers', B('soins infirmiers|infirmier|infirmiere|diplome d.etat infirmier')),
  L('aide-soignant', 'Aide-soignant', B('aide-? ?soignante?')),
  L('accompagnement', 'Accompagnement social', B('accompagnement social|travailleur social|educateur specialise|educatrice specialisee')),
  L('enseignement', 'Enseignement', B('enseignant|enseignante|professeure? des ecoles|experience d.enseignement|enseigner')),

  // Permis
  L('permis-b', 'Permis B', B('permis b')),
  L('permis-c', 'Permis C / poids lourd', B('permis c|permis poids lourds?|fimo')),
];

const PAR_ID = new Map(COMPETENCES.map((c) => [c.id, c]));
export const nomDe = (id) => PAR_ID.get(id)?.nom || id;

/** Minuscules, sans accents, espaces simples — la forme que lisent les motifs. */
export function normaliser(texte) {
  return String(texte || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&amp;|&#\d+;/g, ' ')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ');
}

/**
 * Identifiants des compétences citées par le texte, dans l'ordre du lexique.
 * `sauf` : le nom de l'employeur, retiré avant lecture — chez Pennylane,
 * « Pennylane » est la signature de l'annonce, pas une compétence demandée.
 */
export function competencesDe(texte, max = 12, sauf = '') {
  let t = normaliser(texte);
  const nom = normaliser(sauf).trim();
  if (nom.length >= 3) t = t.split(nom).join(' ');
  if (!t.trim()) return [];
  const ids = [];
  for (const c of COMPETENCES) {
    if (c.re.test(t)) ids.push(c.id);
    if (ids.length >= max) break;
  }
  return ids;
}
