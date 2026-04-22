export const config = { runtime: 'edge' };

// France Travail (Pôle Emploi) Official API
// Free, no scraping, 100% legal
// Doc: https://francetravail.io/data/api/offres-emploi

const FT_CLIENT_ID = process.env.FRANCE_TRAVAIL_CLIENT_ID;
const FT_CLIENT_SECRET = process.env.FRANCE_TRAVAIL_CLIENT_SECRET;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function getFTToken() {
  const res = await fetch('https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: FT_CLIENT_ID,
      client_secret: FT_CLIENT_SECRET,
      scope: 'api_offresdemploiv2 o2dsoffre',
    }),
  });
  const data = await res.json();
  return data.access_token;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  const url = new URL(req.url);
  const q = url.searchParams.get('q') || '';
  const typeContrat = url.searchParams.get('type') || ''; // CDI, CDD, MIS, SAI
  const location = url.searchParams.get('location') || '';
  const page = parseInt(url.searchParams.get('page') || '0');

  // Map our types to France Travail codes
  const typeMap = {
    'cdi': 'CDI',
    'cdd': 'CDD',
    'stage': 'STG',
    'alternance': 'CDD', // Alternance = CDD with apprentissage
    'freelance': 'LIB',
  };

  try {
    // If no API keys, return curated mock data (demo mode)
    if (!FT_CLIENT_ID || !FT_CLIENT_SECRET) {
      return new Response(JSON.stringify(getMockJobs(q, typeContrat, page)), { status: 200, headers });
    }

    const token = await getFTToken();
    
    const params = new URLSearchParams({
      motsCles: q,
      range: `${page * 20}-${page * 20 + 19}`,
      sort: '1', // Sort by date
    });
    
    if (typeContrat && typeMap[typeContrat.toLowerCase()]) {
      params.set('typeContrat', typeMap[typeContrat.toLowerCase()]);
    }
    if (typeContrat.toLowerCase() === 'alternance') {
      params.set('experience', '1'); // Young/first experience
    }
    if (location) {
      params.set('commune', location);
    }

    const apiRes = await fetch(`https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${params}`, {
      headers: { 
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!apiRes.ok) {
      return new Response(JSON.stringify(getMockJobs(q, typeContrat, page)), { status: 200, headers });
    }

    const data = await apiRes.json();
    const jobs = (data.resultats || []).map(job => ({
      id: job.id,
      title: job.intitule,
      company: job.entreprise?.nom || 'Entreprise confidentielle',
      location: job.lieuTravail?.libelle || 'France',
      type: job.typeContratLibelle || 'CDI',
      salary: job.salaire?.libelle || null,
      description: job.description?.slice(0, 300) + '...' || '',
      url: job.origineOffre?.urlOrigine || `https://candidat.francetravail.fr/offres/recherche/detail/${job.id}`,
      date: job.dateCreation || new Date().toISOString(),
      experience: job.experienceLibelle || null,
      formation: job.formations?.[0]?.niveauLibelle || null,
      remote: job.lieuTravail?.libelle?.toLowerCase().includes('télétravail') || false,
      source: 'France Travail',
    }));

    return new Response(JSON.stringify({
      jobs,
      total: data.nombreTotalOffres || jobs.length,
      page,
    }), { status: 200, headers });

  } catch (err) {
    console.error('Jobs API error:', err);
    return new Response(JSON.stringify(getMockJobs(q, typeContrat, page)), { status: 200, headers });
  }
}

// High quality mock data for demo (used when no API keys configured)
function getMockJobs(q, type, page) {
  const allJobs = [
    { id:'1', title:'Développeur Full Stack React/Node.js', company:'BNP Paribas', location:'Paris 75009', type:'CDI', salary:'45 000 - 55 000 € / an', description:'Rejoignez notre équipe Digital Banking pour développer les applications web next-gen de BNP Paribas. Vous travaillerez sur des projets à fort impact pour des millions de clients.', url:'https://emploia.fr/app', date: ago(1), experience:'2 ans minimum', formation:'Bac+5', remote:true, source:'France Travail' },
    { id:'2', title:'Chargé(e) de Communication Digitale', company:'Decathlon', location:'Lille 59000', type:'CDI', salary:'32 000 - 38 000 € / an', description:"Gérez la présence digitale de Decathlon sur les réseaux sociaux, créez du contenu engageant et analysez les performances de nos campagnes marketing pour l'enseigne sport #1 en France.", url:'https://emploia.fr/app', date: ago(2), experience:'1-3 ans', formation:'Bac+3/5', remote:false, source:'France Travail' },
    { id:'3', title:'Stage Marketing Digital & Growth', company:"L'Oréal", location:'Paris 75008', type:'Stage', salary:'1 200 € / mois', description:"Stage de 6 mois dans l'équipe Growth de L'Oréal Paris. Participez à des projets data-driven, A/B tests, campagnes Meta Ads et analyse de performance pour l'une des marques les plus influentes du monde.", url:'https://emploia.fr/app', date: ago(1), experience:'Bac+4/5 en cours', formation:'École de commerce / Marketing', remote:false, source:'LinkedIn' },
    { id:'4', title:'Alternance Chef de Projet Digital', company:'SNCF Connect', location:'Paris 75013', type:'Alternance', salary:'1 400 € / mois', description:'Alternance de 12 mois pour accompagner la transformation digitale de SNCF. Vous contribuerez aux projets UX/UI, gestion de produit et analytics sur nos applications qui servent 3M+ voyageurs/jour.', url:'https://emploia.fr/app', date: ago(3), experience:'En alternance Bac+4/5', formation:'École ingénieur / Commerce', remote:true, source:'APEC' },
    { id:'5', title:'Data Analyst — CDD 12 mois', company:'Système U', location:'Paris La Défense', type:'CDD', salary:'38 000 - 42 000 € / an', description:'Analysez les données de ventes et comportements consommateurs pour optimiser les stratégies commerciales de 1500+ supermarchés U. Maîtrise SQL, Python et Tableau requise.', url:'https://emploia.fr/app', date: ago(2), experience:'2-4 ans', formation:'Bac+4/5 Data/Stats', remote:true, source:'France Travail' },
    { id:'6', title:'Product Manager — Apps Mobiles', company:'Meilleurtaux', location:'Paris 75002', type:'CDI', salary:'50 000 - 65 000 € / an', description:'Pilotez le développement de nos applications mobiles (iOS/Android) avec 2M+ téléchargements. Définissez la roadmap produit, collaborez avec les équipes tech et design pour améliorer l\'expérience utilisateur.', url:'https://emploia.fr/app', date: ago(4), experience:'3+ ans Product', formation:'Bac+5', remote:true, source:'LinkedIn' },
    { id:'7', title:'Stage Développement Web Front-End', company:'Withings', location:'Issy-les-Moulineaux 92', type:'Stage', salary:'1 100 € / mois', description:'Stage de 4 à 6 mois pour contribuer au développement de notre plateforme santé connectée. Stack React, TypeScript. Vous travaillerez directement avec les devs seniors sur des features critiques.', url:'https://emploia.fr/app', date: ago(1), experience:'Étudiant Bac+3/5', formation:'Informatique / Web', remote:false, source:'APEC' },
    { id:'8', title:'Alternance RH & Recrutement', company:'Capgemini', location:'Roissy-en-France 95', type:'Alternance', salary:'1 300 € / mois', description:"Rejoignez l'équipe RH de Capgemini France (50 000 collaborateurs) en alternance. Vous participerez aux processus de recrutement, marque employeur, onboarding et projets RH stratégiques.", url:'https://emploia.fr/app', date: ago(5), experience:'Alternance Bac+3/5', formation:'RH / Psychologie / Commerce', remote:true, source:'France Travail' },
    { id:'9', title:'Responsable Marketing — Startup FinTech', company:'Lydia Solutions', location:'Paris 75011', type:'CDI', salary:'42 000 - 52 000 € / an', description:'Rejoignez Lydia (3M+ utilisateurs) pour piloter la stratégie marketing acquisition et fidélisation. Growth hacking, content marketing, partenariats — vous avez carte blanche pour faire grandir la base.', url:'https://emploia.fr/app', date: ago(3), experience:'3-5 ans Marketing', formation:'Bac+4/5 Marketing/Commerce', remote:true, source:'LinkedIn' },
    { id:'10', title:'Stage Communication & Événementiel', company:'Publicis Groupe', location:'Paris 75008', type:'Stage', salary:'900 - 1 100 € / mois', description:"Stage 6 mois au sein de l'agence Publicis Consultants. Vous participerez à l'organisation d'événements clients, production de contenus et gestion des relations presse pour des marques internationales.", url:'https://emploia.fr/app', date: ago(2), experience:'Étudiant Bac+3/5', formation:'Communication / Journalisme', remote:false, source:'APEC' },
    { id:'11', title:'Ingénieur DevOps — Cloud AWS', company:'OVHcloud', location:'Roubaix 59100', type:'CDI', salary:'48 000 - 58 000 € / an', description:"Rejoignez OVHcloud, leader européen du cloud, pour administrer et optimiser notre infrastructure AWS/GCP. CI/CD, Kubernetes, Terraform — vous êtes l'architecte de notre résilience technique.", url:'https://emploia.fr/app', date: ago(1), experience:'3+ ans DevOps', formation:'Bac+5 Informatique', remote:true, source:'France Travail' },
    { id:'12', title:'Alternance Business Developer', company:'Doctolib', location:'Paris 75009', type:'Alternance', salary:'1 500 € / mois', description:"Participez à l'expansion de Doctolib (70M patients, 300K professionnels) en alternance Business Development. Prospection, démonstrations produit, closing — formez-vous à la vente B2B dans une scale-up française #1.", url:'https://emploia.fr/app', date: ago(2), experience:'Alternance Bac+4/5', formation:'Commerce / Business School', remote:false, source:'LinkedIn' },
  ];

  let filtered = allJobs;
  if (q) {
    const ql = q.toLowerCase();
    filtered = filtered.filter(j => j.title.toLowerCase().includes(ql) || j.company.toLowerCase().includes(ql) || j.description.toLowerCase().includes(ql));
  }
  if (type && type !== 'tous') {
    filtered = filtered.filter(j => j.type.toLowerCase() === type.toLowerCase());
  }

  const start = page * 10;
  return { jobs: filtered.slice(start, start + 10), total: filtered.length, page, demo: true };
}

function ago(days) {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString();
}
