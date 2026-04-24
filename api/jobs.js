export const config = { runtime: 'edge' };

const H = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function getFTToken() {
  const res = await fetch(
    'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.FRANCE_TRAVAIL_CLIENT_ID,
        client_secret: process.env.FRANCE_TRAVAIL_CLIENT_SECRET,
        scope: 'api_offresdemploiv2 o2dsoffre',
      }),
    }
  );
  const d = await res.json();
  return d.access_token;
}

const TYPE_MAP = { cdi:'CDI', cdd:'CDD', stage:'STG', alternance:'CDD', freelance:'LIB' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });

  const url = new URL(req.url);
  const q        = url.searchParams.get('q') || '';
  const type     = (url.searchParams.get('type') || '').toLowerCase();
  const location = url.searchParams.get('location') || '';
  const page     = Math.max(0, parseInt(url.searchParams.get('page') || '0'));

  const hasFTKeys = process.env.FRANCE_TRAVAIL_CLIENT_ID && process.env.FRANCE_TRAVAIL_CLIENT_SECRET;

  if (hasFTKeys) {
    try {
      const token = await getFTToken();
      const params = new URLSearchParams({
        motsCles: q || (type === 'stage' ? 'stage' : type === 'alternance' ? 'alternance' : ''),
        range: `${page * 20}-${page * 20 + 19}`,
        sort: '1',
      });
      if (TYPE_MAP[type]) params.set('typeContrat', TYPE_MAP[type]);
      if (location) params.set('commune', location);
      if (type === 'alternance') params.set('natureContrat', 'E2');

      const apiRes = await fetch(
        `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${params}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );

      if (apiRes.ok) {
        const data = await apiRes.json();
        const jobs = (data.resultats || []).map(j => ({
          id: j.id,
          title: j.intitule,
          company: j.entreprise?.nom || 'Entreprise confidentielle',
          location: j.lieuTravail?.libelle || 'France',
          type: j.typeContratLibelle || 'CDI',
          salary: j.salaire?.libelle || null,
          description: (j.description || '').slice(0, 320) + '…',
          url: j.origineOffre?.urlOrigine || `https://candidat.francetravail.fr/offres/recherche/detail/${j.id}`,
          date: j.dateCreation || new Date().toISOString(),
          experience: j.experienceLibelle || null,
          remote: (j.lieuTravail?.libelle || '').toLowerCase().includes('télétravail'),
          source: 'France Travail',
        }));
        return new Response(JSON.stringify({ jobs, total: data.nombreTotalOffres || jobs.length, page, demo: false }), { status: 200, headers: H });
      }
    } catch (e) {
      // fall through to mock
    }
  }

  return new Response(JSON.stringify(getMock(q, type, page)), { status: 200, headers: H });
}

function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString(); }

function hashN(s, min, range) {
  let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31,h) + s.charCodeAt(i)) | 0;
  return min + (Math.abs(h) % range);
}

const MOCK = [
  { id:'m1', title:'Développeur Full Stack React/Node.js', company:'BNP Paribas', location:'Paris 75009', type:'CDI', salary:'45 000 – 55 000 €/an', description:"Rejoignez notre équipe Digital Banking pour développer les applications web de BNP Paribas. Stack React, Node.js, PostgreSQL. Méthodes agiles Scrum. Fort impact sur des millions de clients.", url:'https://emploia-clean.vercel.app/app', date:daysAgo(1), experience:'2 ans min', remote:true, source:'France Travail' },
  { id:'m2', title:'Chargé(e) de Communication Digitale', company:'Decathlon', location:'Lille 59000', type:'CDI', salary:'32 000 – 38 000 €/an', description:"Gérez la présence digitale de Decathlon : réseaux sociaux, création de contenu, campagnes Meta Ads, analytics. Rejoignez l'enseigne sport #1 en France.", url:'https://emploia-clean.vercel.app/app', date:daysAgo(2), experience:'1-3 ans', remote:false, source:'France Travail' },
  { id:'m3', title:'Stage Marketing Digital & Growth', company:"L'Oréal", location:'Paris 75008', type:'Stage', salary:'1 200 €/mois', description:"Stage 6 mois dans l'équipe Growth de L'Oréal Paris. A/B tests, campagnes Meta Ads, analyse SEO/SEA. Encadrement par des experts top marché.", url:'https://emploia-clean.vercel.app/app', date:daysAgo(1), experience:'Bac+4/5 en cours', remote:false, source:'LinkedIn' },
  { id:'m4', title:'Alternance Chef de Projet Digital', company:'SNCF Connect', location:'Paris 75013', type:'Alternance', salary:'1 400 €/mois', description:'Alternance 12 mois sur la transformation digitale de SNCF. UX/UI, product management, analytics sur des apps à 3M+ utilisateurs/jour.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(3), experience:'En alternance Bac+4/5', remote:true, source:'APEC' },
  { id:'m5', title:'Data Analyst — CDD 12 mois', company:'Système U', location:'Paris La Défense', type:'CDD', salary:'38 000 – 42 000 €/an', description:'Analysez les données de ventes pour optimiser les stratégies commerciales de 1 500+ supermarchés U. SQL, Python, Tableau requis.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(2), experience:'2-4 ans', remote:true, source:'France Travail' },
  { id:'m6', title:'Product Manager — Apps Mobiles', company:'Meilleurtaux', location:'Paris 75002', type:'CDI', salary:'50 000 – 65 000 €/an', description:'Pilotez nos apps mobiles (2M+ téléchargements). Définissez la roadmap produit, collaborez avec les équipes tech et design.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(4), experience:'3+ ans Product', remote:true, source:'LinkedIn' },
  { id:'m7', title:'Stage Développement Web Front-End', company:'Withings', location:'Issy-les-Moulineaux 92', type:'Stage', salary:'1 100 €/mois', description:'Stage 4-6 mois sur notre plateforme santé connectée. Stack React, TypeScript. Vous travaillez directement avec des devs seniors sur des features critiques.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(1), experience:'Bac+3/5', remote:false, source:'APEC' },
  { id:'m8', title:'Alternance RH & Recrutement', company:'Capgemini', location:'Paris 75017', type:'Alternance', salary:'1 300 €/mois', description:"Alternance RH chez Capgemini France (50 000 collaborateurs). Recrutement, marque employeur, onboarding. Formation sur les meilleures pratiques RH d'une ESN leader.", url:'https://emploia-clean.vercel.app/app', date:daysAgo(5), experience:'Bac+3/5', remote:true, source:'France Travail' },
  { id:'m9', title:'Responsable Marketing — FinTech', company:'Lydia Solutions', location:'Paris 75011', type:'CDI', salary:'42 000 – 52 000 €/an', description:'Pilotez la stratégie marketing de Lydia (3M+ utilisateurs). Growth hacking, content, partenariats — carte blanche pour faire grandir la base.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(3), experience:'3-5 ans', remote:true, source:'LinkedIn' },
  { id:'m10', title:'Stage Communication & Événementiel', company:'Publicis Consultants', location:'Paris 75008', type:'Stage', salary:'950 €/mois', description:"Stage 6 mois chez Publicis. Événements clients, production de contenus, relations presse pour des marques internationales. Immersion en agence top 5 mondiale.", url:'https://emploia-clean.vercel.app/app', date:daysAgo(2), experience:'Bac+3/5', remote:false, source:'APEC' },
  { id:'m11', title:'Ingénieur DevOps — Cloud AWS', company:'OVHcloud', location:'Roubaix 59100', type:'CDI', salary:'48 000 – 58 000 €/an', description:"Leader européen du cloud. CI/CD, Kubernetes, Terraform. Vous concevez et maintenez l'infrastructure qui héberge des millions de sites.", url:'https://emploia-clean.vercel.app/app', date:daysAgo(1), experience:'3+ ans DevOps', remote:true, source:'France Travail' },
  { id:'m12', title:'Alternance Business Developer', company:'Doctolib', location:'Paris 75009', type:'Alternance', salary:'1 500 €/mois', description:"Alternance BD chez Doctolib (70M patients, 300K professionnels). Prospection, démos, closing. Formez-vous à la vente B2B dans la scale-up santé française #1.", url:'https://emploia-clean.vercel.app/app', date:daysAgo(2), experience:'Bac+4/5', remote:false, source:'LinkedIn' },
  { id:'m13', title:'UX Designer — Startup SaaS', company:'Pennylane', location:'Paris 75009', type:'CDI', salary:'40 000 – 50 000 €/an', description:'Concevez les parcours utilisateurs de notre logiciel comptable (20 000 clients). Figma, user research, design system. Impact direct produit.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(0), experience:'2+ ans UX', remote:true, source:'LinkedIn' },
  { id:'m14', title:'Stage Analyse de Données / Python', company:'Criteo', location:'Paris 75009', type:'Stage', salary:'1 350 €/mois', description:'Stage 6 mois Data chez Criteo (leader AdTech). Python, pandas, SQL, visualisation. Vous travaillez sur des datasets de plusieurs milliards de lignes.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(1), experience:'Bac+4/5 Data/Stats', remote:true, source:'APEC' },
  { id:'m15', title:'Alternance Développeur Mobile Flutter', company:'Qonto', location:'Paris 75002', type:'Alternance', salary:'1 600 €/mois', description:"Alternance dev mobile chez Qonto (400 000 clients pro). Flutter, Dart, architecture propre. Rejoignez l'une des fintech françaises les plus admirées.", url:'https://emploia-clean.vercel.app/app', date:daysAgo(0), experience:'Bac+4/5', remote:true, source:'LinkedIn' },
];

function getMock(q, type, page) {
  let items = [...MOCK];
  if (q) {
    const ql = q.toLowerCase();
    items = items.filter(j =>
      j.title.toLowerCase().includes(ql) ||
      j.company.toLowerCase().includes(ql) ||
      j.description.toLowerCase().includes(ql)
    );
  }
  if (type && type !== 'tous') {
    items = items.filter(j => j.type.toLowerCase() === type.toLowerCase() ||
      (type === 'stage' && j.type === 'Stage') ||
      (type === 'alternance' && j.type === 'Alternance') ||
      (type === 'cdi' && j.type === 'CDI') ||
      (type === 'cdd' && j.type === 'CDD')
    );
  }
  const start = page * 10;
  return { jobs: items.slice(start, start + 10), total: items.length, page, demo: true };
}
