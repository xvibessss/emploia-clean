export const config = { runtime: 'edge' };
import { checkRateLimit, kvGet } from './_lib/auth.js';

const H = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString(); }

function detectType(title, filterType) {
  if (filterType && filterType !== 'tous') {
    const m = { stage:'Stage', alternance:'Alternance', cdi:'CDI', cdd:'CDD', freelance:'Freelance' };
    if (m[filterType]) return m[filterType];
  }
  const t = (title || '').toLowerCase();
  if (t.includes('stage') || t.includes('intern') || t.includes('internship')) return 'Stage';
  if (t.includes('alternance') || t.includes('apprenti') || t.includes('apprenticeship')) return 'Alternance';
  if (t.includes('freelance') || t.includes('indépendant')) return 'Freelance';
  if (t.includes('cdd') || t.includes('temporary') || t.includes('contract')) return 'CDD';
  return 'CDI';
}

function isGermanJob(title, desc) {
  const t = (title || '').toLowerCase();
  const d = (desc || '').toLowerCase();
  return t.includes('(m/w/d)') || t.includes('(w/m/d)') || t.includes('minijob') ||
         t.includes('werkstudent') || t.includes('nebenjob') ||
         d.startsWith('das ') || d.startsWith('wir ') || d.includes(' deutsch');
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, r) =>
    setTimeout(() => r(new Error('timeout')), ms)
  )]);
}

// ── JSEARCH (Indeed + LinkedIn + Glassdoor) ───────────
async function fetchJSearch(q, type, location, page) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return [];
  try {
    const typeMap = { stage:'INTERN', alternance:'INTERN', cdd:'CONTRACTOR', cdi:'FULLTIME', freelance:'CONTRACTOR' };
    const locStr = location || 'Paris France';
    const query = [
      q || 'emploi CDI',
      type === 'stage' ? 'stage internship' : type === 'alternance' ? 'alternance' : '',
    ].filter(Boolean).join(' ') + ' ' + locStr;
    const params = new URLSearchParams({
      query,
      num_pages: '1',
      page: String(page + 1),
      country: 'fr',
      date_posted: 'month',
      ...(typeMap[type] ? { employment_type: typeMap[type] } : {}),
    });
    const res = await withTimeout(
      fetch(`https://jsearch.p.rapidapi.com/search?${params}`, {
        headers: { 'x-rapidapi-host': 'jsearch.p.rapidapi.com', 'x-rapidapi-key': key }
      }), 10000
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map(j => ({
      id: 'js_' + j.job_id,
      title: j.job_title,
      company: j.employer_name || 'Confidentiel',
      location: [j.job_city, j.job_country].filter(Boolean).join(', ') || 'France',
      type: j.job_employment_type === 'INTERN' ? 'Stage'
          : j.job_employment_type === 'CONTRACTOR' ? 'CDD'
          : detectType(j.job_title, type),
      salary: j.job_min_salary
        ? `${Math.round(j.job_min_salary)}–${Math.round(j.job_max_salary||j.job_min_salary)} ${j.job_salary_currency||'€'}`
        : null,
      description: (j.job_description || '').slice(0, 300),
      url: j.job_apply_link || j.job_google_link || '',
      date: j.job_posted_at_datetime_utc || new Date().toISOString(),
      remote: j.job_is_remote || false,
      source: j.job_publisher || 'Indeed',
      logo: j.employer_logo || null,
      country: 'FR',
    }));
  } catch { return []; }
}

// ── FRENCH JOB MARKET (APEC + HelloWork + Free-Work) ─
async function fetchFrenchMarket(q, type, location, page) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return [];
  try {
    const typeMap = {
      cdi: ['permanent'], cdd: ['temporary'], stage: ['internship'],
      alternance: ['apprenticeship'], freelance: ['freelance']
    };
    const body = {
      query: q || 'développeur',
      location: location || 'France',
      num_pages: 1,
      page: page + 1,
      ...(typeMap[type] ? { employment_type: typeMap[type] } : {}),
    };
    const res = await withTimeout(
      fetch('https://french-job-market.p.rapidapi.com/v1/jobs/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-host': 'french-job-market.p.rapidapi.com',
          'x-rapidapi-key': key,
        },
        body: JSON.stringify(body),
      }), 10000
    );
    if (!res.ok) return [];
    const data = await res.json();
    const DOM_TOM = ['martinique', 'guadeloupe', 'guyane', 'réunion', 'reunion', 'mayotte', 'lamentin', 'cayenne', 'saint-denis - 97'];
    return (data.data || [])
      .filter(j => {
        const loc = (j.location || '').toLowerCase();
        return !DOM_TOM.some(d => loc.includes(d));
      })
      .map(j => ({
      id: 'fm_' + j.job_id,
      title: j.title,
      company: j.company || 'Confidentiel',
      location: j.location || 'France',
      type: detectType(j.title, type),
      salary: null,
      description: (j.short_description || '').slice(0, 300),
      url: j.source_url || '',
      date: j.posted_at || new Date().toISOString(),
      remote: j.remote === true || (j.remote || '').includes('full'),
      source: j.source_platform || 'APEC',
      logo: null,
      country: 'FR',
    }));
  } catch { return []; }
}

// ── INTERNSHIPS API ───────────────────────────────────
async function fetchInternships(q, type, location) {
  if (type && !['stage', 'alternance', 'tous', ''].includes(type)) return [];
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return [];
  try {
    const params = new URLSearchParams({
      location_filter: location || 'France',
      limit: '15',
      description_type: 'text',
    });
    if (q) params.set('title_filter', q);
    const res = await withTimeout(
      fetch(`https://internships-api.p.rapidapi.com/active-jb-7d?${params}`, {
        headers: {
          'x-rapidapi-host': 'internships-api.p.rapidapi.com',
          'x-rapidapi-key': key,
        }
      }), 10000
    );
    if (!res.ok) return [];
    const data = await res.json();
    const jobs = Array.isArray(data) ? data : (data.data || []);
    return jobs
      .filter(j => {
        const countries = (j.countries_derived || []).map(c => c.toLowerCase());
        const isFR = countries.some(c => ['france','fr'].includes(c));
        const isRemote = j.remote_derived === true;
        return isFR || isRemote;
      })
      .slice(0, 10)
      .map(j => {
        const loc = (j.locations_derived || j.cities_derived || [])[0] || 'France';
        const empType = (j.employment_type || '').toUpperCase();
        const isAlternance = j.title?.toLowerCase().includes('alternance') || j.title?.toLowerCase().includes('apprenti');
        return {
          id: 'int_' + j.id,
          title: j.title,
          company: j.organization || 'Confidentiel',
          location: j.remote_derived ? 'Remote · France' : loc,
          type: isAlternance ? 'Alternance' : empType.includes('INTERN') ? 'Stage' : 'Stage',
          salary: j.salary_raw || null,
          description: (j.linkedin_org_slogan || j.linkedin_org_description || '').slice(0, 300),
          url: j.url || j.external_apply_url || '',
          date: j.date_posted || new Date().toISOString(),
          remote: j.remote_derived || false,
          source: 'LinkedIn Internships',
          logo: j.organization_logo || null,
          country: 'FR',
        };
      });
  } catch { return []; }
}

// ── REMOTIVE ──────────────────────────────────────────
async function fetchRemotive(q, type) {
  if (type && ['stage', 'alternance', 'cdd'].includes(type)) return [];
  try {
    const res = await withTimeout(
      fetch(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q||'developer engineer manager')}&limit=8`),
      8000
    );
    if (!res.ok) return [];
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
        type: 'Remote',
        salary: j.salary || null,
        description: (j.description || '').replace(/<[^>]*>/g, '').slice(0, 300),
        url: j.url,
        date: j.publication_date || new Date().toISOString(),
        remote: true,
        source: 'Remotive',
        logo: j.company_logo_url || null,
        country: 'REMOTE',
      }));
  } catch { return []; }
}

// ── ARBEITNOW ─────────────────────────────────────────
async function fetchArbeitnow(q, type, page) {
  if (type && ['stage', 'alternance'].includes(type)) return [];
  try {
    const params = new URLSearchParams({ page: String(page + 1) });
    if (q) params.set('search', q);
    const res = await withTimeout(
      fetch(`https://www.arbeitnow.com/api/job-board-api?${params}`), 7000
    );
    if (!res.ok) return [];
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
        type: detectType(j.title, type),
        salary: null,
        description: (j.description || '').replace(/<[^>]*>/g, '').slice(0, 300),
        url: j.url,
        date: j.created_at ? new Date(j.created_at * 1000).toISOString() : new Date().toISOString(),
        remote: j.remote || false,
        source: 'Arbeitnow',
        logo: j.company_logo || null,
        country: j.remote ? 'REMOTE' : 'FR',
      }));
  } catch { return []; }
}

// ── ADZUNA ────────────────────────────────────────────
async function fetchAdzuna(q, type, location, page) {
  if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) return [];
  try {
    const params = new URLSearchParams({
      app_id: process.env.ADZUNA_APP_ID,
      app_key: process.env.ADZUNA_APP_KEY,
      results_per_page: '10',
      page: String(page + 1),
      what: [q, type==='stage'?'stage':type==='alternance'?'alternance':''].filter(Boolean).join(' ') || 'emploi',
      where: location || 'France',
      sort_by: 'date',
    });
    const res = await withTimeout(
      fetch(`https://api.adzuna.com/v1/api/jobs/fr/search/1?${params}`), 12000
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map(j => ({
      id: 'az_' + j.id,
      title: j.title,
      company: j.company?.display_name || 'Confidentiel',
      location: j.location?.display_name || 'France',
      type: detectType(j.title, type),
      salary: j.salary_min ? `${Math.round(j.salary_min/1000)}k–${Math.round((j.salary_max||j.salary_min)/1000)}k€/an` : null,
      description: (j.description || '').slice(0, 300),
      url: j.redirect_url || '',
      date: j.created || new Date().toISOString(),
      remote: (j.title+(j.description||'')).toLowerCase().includes('télétravail')||(j.title+(j.description||'')).toLowerCase().includes('remote'),
      source: 'Adzuna',
      logo: null,
      country: 'FR',
    }));
  } catch { return []; }
}

// ── FRANCE TRAVAIL (OAuth2 + Offres API) ─────────────
async function fetchFranceTravail(q, type, location, page) {
  const clientId = process.env.FRANCE_TRAVAIL_CLIENT_ID;
  const clientSecret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];
  if (type === 'stage') return []; // stages not well represented
  try {
    const tokenRes = await withTimeout(
      fetch('https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'api_offresdemploiv2 o2dsoffre',
        }).toString(),
      }), 7000
    );
    if (!tokenRes.ok) return [];
    const { access_token } = await tokenRes.json();
    if (!access_token) return [];

    const typeMap = { cdi: 'CDI', cdd: 'CDD', alternance: 'CA,CP', freelance: 'LIB' };
    const start = page * 10;
    const keywords = [q || 'emploi', location || ''].filter(Boolean).join(' ');
    const params = new URLSearchParams({ motsCles: keywords, range: `${start}-${start + 9}`, sort: '1' });
    if (typeMap[type]) params.set('typeContrat', typeMap[type]);

    const jobsRes = await withTimeout(
      fetch(`https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${params}`, {
        headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
      }), 10000
    );
    if (!jobsRes.ok) return [];
    const data = await jobsRes.json();
    return (data.resultats || []).slice(0, 8).map(j => ({
      id: 'ft_' + j.id,
      title: j.intitule,
      company: j.entreprise?.nom || 'Confidentiel',
      location: j.lieuTravail?.libelle || location || 'France',
      type: j.typeContratLibelle || detectType(j.intitule, type),
      salary: j.salaire?.libelle || null,
      description: (j.description || '').slice(0, 300),
      url: `https://candidat.francetravail.fr/offres/recherche/detail/${j.id}`,
      date: j.dateCreation || new Date().toISOString(),
      remote: (j.lieuTravail?.libelle || '').toLowerCase().includes('télétravail'),
      source: 'France Travail',
      logo: null,
      country: 'FR',
    }));
  } catch { return []; }
}

// ── EMPLOYER DIRECT JOBS (Upstash KV) ────────────────
async function fetchEmployerJobs(q, type, location) {
  try {
    let jobs = await kvGet('employer_jobs') || [];
    if (!Array.isArray(jobs)) return [];
    jobs = jobs.filter(j => j.status === 'active');
    if (type && type !== 'tous') {
      const m = { stage: 'Stage', alternance: 'Alternance', cdi: 'CDI', cdd: 'CDD', freelance: 'Freelance' };
      if (m[type]) jobs = jobs.filter(j => j.type === m[type]);
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
    return jobs.slice(0, 5);
  } catch { return []; }
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
  if (type && type!=='tous') { const m={stage:'Stage',alternance:'Alternance',cdi:'CDI',cdd:'CDD',freelance:'Freelance'}; if(m[type]) items=items.filter(j=>j.type===m[type]); }
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

  try {
    const [jsRes, fmRes, intRes, rmRes, abRes, azRes, empRes, ftRes] = await Promise.allSettled([
      fetchJSearch(q, type, location, page),
      fetchFrenchMarket(q, type, location, page),
      fetchInternships(q, type, location),
      fetchRemotive(q, type),
      fetchArbeitnow(q, type, page),
      fetchAdzuna(q, type, location, page),
      fetchEmployerJobs(q, type, location),
      fetchFranceTravail(q, type, location, page),
    ]);

    const employerJobs = empRes.status === 'fulfilled' ? empRes.value : [];
    const allJobs = [
      ...employerJobs,
      ...(ftRes.status === 'fulfilled' ? ftRes.value : []),
      ...(fmRes.status === 'fulfilled' ? fmRes.value : []),
      ...(jsRes.status === 'fulfilled' ? jsRes.value : []),
      ...(azRes.status === 'fulfilled' ? azRes.value : []),
      ...(intRes.status === 'fulfilled' ? intRes.value : []),
      ...(rmRes.status === 'fulfilled' ? rmRes.value : []),
      ...(abRes.status === 'fulfilled' ? abRes.value : []),
    ];

    if (allJobs.length > 0) {
      let final = prioritize(deduplicate(allJobs));
      if (remoteOnly) final = final.filter(j => j.remote === true);
      const sources = [...new Set(final.map(j => j.source))];
      return new Response(
        JSON.stringify({ jobs: final, total: final.length, page, demo: false, sources }),
        { status: 200, headers: H }
      );
    }
  } catch {}

  const mock = getMock(q, type, page);
  if (remoteOnly) mock.jobs = mock.jobs.filter(j => j.remote === true);
  return new Response(JSON.stringify(mock), { status: 200, headers: H });
}
