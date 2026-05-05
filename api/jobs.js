export const config = { runtime: 'edge' };

const H = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ── FRANCE TRAVAIL ───────────────────────────────────────────────────────────
async function getFTToken() {
  const res = await fetch(
    'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.FRANCE_TRAVAIL_CLIENT_ID || '',
        client_secret: process.env.FRANCE_TRAVAIL_CLIENT_SECRET || '',
        scope: 'api_offresdemploiv2 o2dsoffre',
      }),
    }
  );
  const d = await res.json();
  return d.access_token;
}

const FT_TYPE_MAP = { cdi:'CDI', cdd:'CDD', stage:'STG', alternance:'CDD', freelance:'LIB' };

async function fetchFranceTravail(q, type, location, page) {
  if (!process.env.FRANCE_TRAVAIL_CLIENT_ID) return [];
  try {
    const token = await getFTToken();
    const params = new URLSearchParams({
      motsCles: q || (type === 'stage' ? 'stage' : type === 'alternance' ? 'alternance' : ''),
      range: `${page * 15}-${page * 15 + 14}`,
      sort: '1',
    });
    if (FT_TYPE_MAP[type]) params.set('typeContrat', FT_TYPE_MAP[type]);
    if (location) params.set('commune', location);
    if (type === 'alternance') params.set('natureContrat', 'E2');
    const res = await fetch(
      `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${params}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.resultats || []).map(j => ({
      id: 'ft_' + j.id,
      title: j.intitule,
      company: j.entreprise?.nom || 'Entreprise confidentielle',
      location: j.lieuTravail?.libelle || 'France',
      type: j.typeContratLibelle || 'CDI',
      salary: j.salaire?.libelle || null,
      description: (j.description || '').slice(0, 300),
      url: j.origineOffre?.urlOrigine || `https://candidat.francetravail.fr/offres/recherche/detail/${j.id}`,
      date: j.dateCreation || new Date().toISOString(),
      experience: j.experienceLibelle || null,
      remote: (j.lieuTravail?.libelle || '').toLowerCase().includes('télétravail'),
      source: 'France Travail',
      logo: null,
      country: 'FR',
    }));
  } catch { return []; }
}

// ── ADZUNA ───────────────────────────────────────────────────────────────────
async function fetchAdzuna(q, type, location, page) {
  if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) return [];
  try {
    const what = [
      q,
      type === 'stage' ? 'stage intern' : type === 'alternance' ? 'alternance apprenti' : ''
    ].filter(Boolean).join(' ') || 'emploi';

    const params = new URLSearchParams({
      app_id: process.env.ADZUNA_APP_ID,
      app_key: process.env.ADZUNA_APP_KEY,
      results_per_page: '15',
      page: String(page + 1),
      what,
      where: location || 'France',
      content_type: 'application/json',
      sort_by: 'date',
    });
    const res = await fetch(`https://api.adzuna.com/v1/api/jobs/fr/search/1?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map(j => ({
      id: 'az_' + j.id,
      title: j.title,
      company: j.company?.display_name || 'Confidentiel',
      location: j.location?.display_name || 'France',
      type: detectType(j.contract_type, j.title, type),
      salary: j.salary_min && j.salary_max
        ? `${Math.round(j.salary_min / 1000)}k – ${Math.round(j.salary_max / 1000)}k€/an`
        : null,
      description: (j.description || '').slice(0, 300),
      url: j.redirect_url || '',
      date: j.created || new Date().toISOString(),
      experience: null,
      remote: (j.title + ' ' + (j.description || '')).toLowerCase().includes('télétravail') ||
              (j.title + ' ' + (j.description || '')).toLowerCase().includes('remote'),
      source: 'Adzuna',
      logo: null,
      country: 'FR',
    }));
  } catch { return []; }
}

// ── JSEARCH (Indeed + LinkedIn + Glassdoor) ───────────────────────────────────
async function fetchJSearch(q, type, location, page) {
  if (!process.env.JSEARCH_API_KEY) return [];
  try {
    const query = [
      q || 'emploi france',
      location || 'France',
      type === 'stage' ? 'stage internship' : type === 'alternance' ? 'alternance apprenticeship' : ''
    ].filter(Boolean).join(' ');

    const res = await fetch(
      `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}&page=${page + 1}&num_pages=1&country=fr&language=fr&date_posted=week`,
      {
        headers: {
          'X-RapidAPI-Key': process.env.JSEARCH_API_KEY,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        }
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).slice(0, 12).map(j => ({
      id: 'js_' + j.job_id,
      title: j.job_title,
      company: j.employer_name || 'Confidentiel',
      location: [j.job_city, j.job_country].filter(Boolean).join(', ') || 'France',
      type: j.job_employment_type === 'INTERN' ? 'Stage'
          : j.job_employment_type === 'CONTRACTOR' ? 'Freelance'
          : j.job_employment_type === 'PARTTIME' ? 'CDD' : 'CDI',
      salary: j.job_min_salary && j.job_max_salary
        ? `${Math.round(j.job_min_salary)}–${Math.round(j.job_max_salary)} ${j.job_salary_currency || '€'}`
        : null,
      description: (j.job_description || '').slice(0, 300),
      url: j.job_apply_link || j.job_google_link,
      date: j.job_posted_at_datetime_utc || new Date().toISOString(),
      experience: null,
      remote: j.job_is_remote || false,
      source: j.job_publisher || 'Indeed',
      logo: j.employer_logo || null,
      country: 'FR',
    }));
  } catch { return []; }
}

// ── REMOTIVE (remote jobs — 100% French-language filter) ─────────────────────
async function fetchRemotive(q, type, page) {
  // Only for remote/freelance/CDI searches
  if (type && ['stage', 'alternance', 'cdd'].includes(type)) return [];
  try {
    const search = q || 'developer engineer manager';
    const res = await fetch(
      `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(search)}&limit=8`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    // Filter: prefer jobs open to France/EU/worldwide
    const filtered = (data.jobs || []).filter(j => {
      const loc = (j.candidate_required_location || '').toLowerCase();
      return !loc || loc.includes('worldwide') || loc.includes('europe') ||
             loc.includes('france') || loc.includes('eu') || loc.includes('anywhere');
    });
    return filtered.slice(0, 5).map(j => ({
      id: 'rm_' + j.id,
      title: j.title,
      company: j.company_name || 'Confidentiel',
      location: 'Remote · ' + (j.candidate_required_location || 'Worldwide'),
      type: 'Remote',
      salary: j.salary || null,
      description: (j.description || '').replace(/<[^>]*>/g, '').slice(0, 300),
      url: j.url,
      date: j.publication_date || new Date().toISOString(),
      experience: null,
      remote: true,
      source: 'Remotive',
      logo: j.company_logo_url || null,
      country: 'REMOTE',
    }));
  } catch { return []; }
}

// ── ARBEITNOW — filtré France + Remote EU ────────────────────────────────────
async function fetchArbeitnow(q, type, location, page) {
  // Only for remote/freelance type (Arbeitnow is primarily EU remote)
  if (type && ['stage', 'alternance'].includes(type)) return [];
  try {
    const params = new URLSearchParams({ page: String(page + 1) });
    if (q) params.set('search', q);

    const res = await fetch(`https://www.arbeitnow.com/api/job-board-api?${params}`, {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    // Strict filter: only remote jobs or France-located
    const frJobs = (data.data || []).filter(j => {
      const loc = (j.location || '').toLowerCase();
      const desc = (j.description || '').toLowerCase();
      const isFrance = loc.includes('france') || loc.includes('paris') ||
                       loc.includes('lyon') || loc.includes('marseille') ||
                       loc.includes('bordeaux') || loc.includes('toulouse');
      const isEuRemote = j.remote && (
        loc.includes('europe') || loc.includes('eu') || loc.includes('worldwide') ||
        loc.includes('anywhere') || loc === 'remote' || j.remote
      );
      // Exclude German-only jobs (no French context)
      const isGermanOnly = (desc.includes('in Deutschland') || loc.includes('germany') ||
                             loc.includes('berlin') || loc.includes('munich') ||
                             loc.includes('hamburg')) && !j.remote;
      return (isFrance || isEuRemote) && !isGermanOnly;
    });
    return frJobs.slice(0, 6).map(j => ({
      id: 'ab_' + j.slug,
      title: j.title,
      company: j.company_name || 'Confidentiel',
      location: j.remote ? 'Remote · EU' : (j.location || 'Europe'),
      type: j.remote ? 'Remote' : detectType(null, j.title, type),
      salary: null,
      description: (j.description || '').replace(/<[^>]*>/g, '').slice(0, 300),
      url: j.url,
      date: j.created_at ? new Date(j.created_at * 1000).toISOString() : new Date().toISOString(),
      experience: null,
      remote: j.remote || false,
      source: 'Arbeitnow',
      logo: j.company_logo || null,
      country: j.remote ? 'REMOTE' : 'EU',
    }));
  } catch { return []; }
}

// ── THE MUSE (stages & internships) ──────────────────────────────────────────
async function fetchTheMuse(q, type, page) {
  if (type && !['stage', 'tous', ''].includes(type)) return [];
  try {
    const params = new URLSearchParams({ page: String(page), results_per_page: '10' });
    if (q) params.set('name', q);
    if (type === 'stage') params.set('level', 'Internship');

    const res = await fetch(`https://www.themuse.com/api/public/jobs?${params}`, {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    // Filter: France or remote
    const filtered = (data.results || []).filter(j => {
      const locs = (j.locations || []).map(l => (l.name || '').toLowerCase());
      return locs.some(l => l.includes('france') || l.includes('paris') || l.includes('remote') || l.includes('anywhere'));
    });
    return filtered.slice(0, 4).map(j => ({
      id: 'tm_' + j.id,
      title: j.name,
      company: j.company?.name || 'Confidentiel',
      location: (j.locations || []).map(l => l.name).join(', ') || 'Remote',
      type: j.levels?.some(l => l.name.toLowerCase().includes('intern')) ? 'Stage' : 'CDI',
      salary: null,
      description: (j.contents || '').replace(/<[^>]*>/g, '').slice(0, 300),
      url: j.refs?.landing_page || '',
      date: j.publication_date || new Date().toISOString(),
      experience: j.levels?.map(l => l.name).join(', ') || null,
      remote: (j.locations || []).some(l => (l.name || '').toLowerCase().includes('remote')),
      source: 'The Muse',
      logo: j.company?.refs?.logo_image || null,
      country: 'INTL',
    }));
  } catch { return []; }
}

// ── HELPER ────────────────────────────────────────────────────────────────────
function detectType(apiType, title, filterType) {
  if (filterType && filterType !== 'tous') {
    const m = { stage:'Stage', alternance:'Alternance', cdi:'CDI', cdd:'CDD', freelance:'Freelance' };
    if (m[filterType]) return m[filterType];
  }
  const t = (title || '').toLowerCase();
  if (t.includes('stage') || t.includes('intern')) return 'Stage';
  if (t.includes('alternance') || t.includes('apprenti')) return 'Alternance';
  if (t.includes('freelance') || t.includes('indépendant')) return 'Freelance';
  if (t.includes('cdd') || t.includes('contract')) return 'CDD';
  if (apiType) return apiType;
  return 'CDI';
}

function deduplicate(jobs) {
  const seen = new Set();
  return jobs.filter(j => {
    const key = (j.title + '|' + j.company).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortByDate(jobs) {
  return jobs.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Prioritize French sources first
function prioritizeByCountry(jobs) {
  const order = { FR: 0, REMOTE: 1, EU: 2, INTL: 3 };
  return jobs.sort((a, b) => {
    const ao = order[a.country] ?? 4;
    const bo = order[b.country] ?? 4;
    if (ao !== bo) return ao - bo;
    return new Date(b.date) - new Date(a.date);
  });
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });

  const url      = new URL(req.url);
  const q        = url.searchParams.get('q') || '';
  const type     = (url.searchParams.get('type') || '').toLowerCase();
  const location = url.searchParams.get('location') || '';
  const page     = Math.max(0, parseInt(url.searchParams.get('page') || '0'));

  try {
    const [ftRes, adzRes, jsRes, rmRes, abRes, tmRes, ajdbRes] = await Promise.allSettled([
      fetchFranceTravail(q, type, location, page),
      fetchAdzuna(q, type, location, page),
      fetchJSearch(q, type, location, page),
      fetchRemotive(q, type, page),
      fetchArbeitnow(q, type, location, page),
      fetchTheMuse(q, type, page),
      fetchActiveJobsDB(q, type, location, page),
    ]);

    const allJobs = [
      ...(ftRes.value || []),
      ...(adzRes.value || []),
      ...(jsRes.value || []),
      ...(ajdbRes.value || []),
      ...(abRes.value || []),
      ...(rmRes.value || []),
      ...(tmRes.value || []),
    ];

    if (allJobs.length > 0) {
      const final = prioritizeByCountry(deduplicate(allJobs));
      const activeSources = [...new Set(final.map(j => j.source))];
      const sourcesStatus = {
        'France Travail': ftRes.status === 'fulfilled' && (ftRes.value?.length ?? 0) > 0,
        'Adzuna': adzRes.status === 'fulfilled' && (adzRes.value?.length ?? 0) > 0,
        'Indeed/LinkedIn': jsRes.status === 'fulfilled' && (jsRes.value?.length ?? 0) > 0,
        'Arbeitnow': abRes.status === 'fulfilled' && (abRes.value?.length ?? 0) > 0,
        'Remotive': rmRes.status === 'fulfilled' && (rmRes.value?.length ?? 0) > 0,
        'The Muse': tmRes.status === 'fulfilled' && (tmRes.value?.length ?? 0) > 0,
        'Active Jobs DB': ajdbRes.status === 'fulfilled' && (ajdbRes.value?.length ?? 0) > 0,
      };
      return new Response(JSON.stringify({
        jobs: final,
        total: final.length,
        page,
        demo: false,
        sources: activeSources,
        sourcesStatus,
      }), { status: 200, headers: H });
    }
  } catch {}

  return new Response(JSON.stringify(getMock(q, type, page)), { status: 200, headers: H });
}

// ── MOCK DATA ─────────────────────────────────────────────────────────────────
function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString(); }

const MOCK = [
  { id:'m1', title:'Développeur Full Stack React/Node.js', company:'BNP Paribas', location:'Paris 75009', type:'CDI', salary:'45 000 – 55 000 €/an', description:'Rejoignez notre équipe Digital Banking. Stack React, Node.js, PostgreSQL. Fort impact sur des millions de clients.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(1), experience:'2 ans min', remote:true, source:'France Travail', logo:null },
  { id:'m2', title:'Chargé(e) de Communication Digitale', company:'Decathlon', location:'Lille 59000', type:'CDI', salary:'32 000 – 38 000 €/an', description:"Gérez la présence digitale de Decathlon : réseaux sociaux, création de contenu, campagnes Meta Ads, analytics.", url:'https://emploia-clean.vercel.app/app', date:daysAgo(2), experience:'1-3 ans', remote:false, source:'France Travail', logo:null },
  { id:'m3', title:'Stage Marketing Digital & Growth', company:"L'Oréal", location:'Paris 75008', type:'Stage', salary:'1 200 €/mois', description:"Stage 6 mois dans l'équipe Growth de L'Oréal Paris. A/B tests, campagnes Meta Ads, analyse SEO/SEA.", url:'https://emploia-clean.vercel.app/app', date:daysAgo(1), experience:'Bac+4/5', remote:false, source:'LinkedIn', logo:null },
  { id:'m4', title:'Alternance Chef de Projet Digital', company:'SNCF Connect', location:'Paris 75013', type:'Alternance', salary:'1 400 €/mois', description:'Alternance 12 mois sur la transformation digitale de SNCF. UX/UI, product management, analytics.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(3), experience:'Bac+4/5', remote:true, source:'APEC', logo:null },
  { id:'m5', title:'Data Analyst — CDD 12 mois', company:'Système U', location:'Paris La Défense', type:'CDD', salary:'38 000 – 42 000 €/an', description:'Analysez les données de ventes. SQL, Python, Tableau requis.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(2), experience:'2-4 ans', remote:true, source:'France Travail', logo:null },
  { id:'m6', title:'Product Manager — Apps Mobiles', company:'Meilleurtaux', location:'Paris 75002', type:'CDI', salary:'50 000 – 65 000 €/an', description:'Pilotez nos apps mobiles (2M+ téléchargements). Définissez la roadmap produit.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(4), experience:'3+ ans', remote:true, source:'LinkedIn', logo:null },
  { id:'m7', title:'Stage Développement Web Front-End', company:'Withings', location:'Issy-les-Moulineaux 92', type:'Stage', salary:'1 100 €/mois', description:'Stage 4-6 mois sur notre plateforme santé. Stack React, TypeScript.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(1), experience:'Bac+3/5', remote:false, source:'APEC', logo:null },
  { id:'m8', title:'Alternance RH & Recrutement', company:'Capgemini', location:'Paris 75017', type:'Alternance', salary:'1 300 €/mois', description:"Alternance RH chez Capgemini France. Recrutement, marque employeur, onboarding.", url:'https://emploia-clean.vercel.app/app', date:daysAgo(5), experience:'Bac+3/5', remote:true, source:'France Travail', logo:null },
  { id:'m9', title:'Ingénieur DevOps — Cloud AWS', company:'OVHcloud', location:'Roubaix 59100', type:'CDI', salary:'48 000 – 58 000 €/an', description:"Leader européen du cloud. CI/CD, Kubernetes, Terraform.", url:'https://emploia-clean.vercel.app/app', date:daysAgo(1), experience:'3+ ans', remote:true, source:'France Travail', logo:null },
  { id:'m10', title:'Alternance Business Developer', company:'Doctolib', location:'Paris 75009', type:'Alternance', salary:'1 500 €/mois', description:"Alternance BD chez Doctolib. Prospection, démos, closing B2B santé.", url:'https://emploia-clean.vercel.app/app', date:daysAgo(2), experience:'Bac+4/5', remote:false, source:'LinkedIn', logo:null },
  { id:'m11', title:'UX Designer — Startup SaaS', company:'Pennylane', location:'Paris 75009', type:'CDI', salary:'40 000 – 50 000 €/an', description:'Concevez les parcours utilisateurs de notre logiciel comptable. Figma, user research.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(0), experience:'2+ ans', remote:true, source:'LinkedIn', logo:null },
  { id:'m12', title:'Stage Analyse de Données / Python', company:'Criteo', location:'Paris 75009', type:'Stage', salary:'1 350 €/mois', description:'Stage 6 mois Data chez Criteo. Python, pandas, SQL.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(1), experience:'Bac+4/5', remote:true, source:'APEC', logo:null },
  { id:'m13', title:'Alternance Développeur Mobile Flutter', company:'Qonto', location:'Paris 75002', type:'Alternance', salary:'1 600 €/mois', description:"Alternance dev mobile chez Qonto. Flutter, Dart. Top fintech française.", url:'https://emploia-clean.vercel.app/app', date:daysAgo(0), experience:'Bac+4/5', remote:true, source:'LinkedIn', logo:null },
  { id:'m14', title:'Chef de Projet IT', company:'Société Générale', location:'Paris La Défense', type:'CDI', salary:'52 000 – 65 000 €/an', description:'Projets de transformation IT à la DSI de SG. Méthodes agiles.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(1), experience:'5+ ans', remote:true, source:'APEC', logo:null },
  { id:'m15', title:'Alternance Cybersécurité', company:'Thales', location:'Vélizy 78', type:'Alternance', salary:'1 700 €/mois', description:"Alternance 2 ans en cybersécurité chez Thales. SOC, pentest, conformité.", url:'https://emploia-clean.vercel.app/app', date:daysAgo(0), experience:'Bac+4/5', remote:false, source:'France Travail', logo:null },
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
    const typeMap = { stage:'Stage', alternance:'Alternance', cdi:'CDI', cdd:'CDD', freelance:'Freelance' };
    const target = typeMap[type];
    if (target) items = items.filter(j => j.type === target);
  }
  const start = page * 12;
  return { jobs: items.slice(start, start + 12), total: items.length, page, demo: true, sources: ['Démo'] };
}
