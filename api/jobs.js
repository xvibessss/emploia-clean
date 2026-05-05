// Node.js runtime — process.env supported

const H = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ── HELPERS ──────────────────────────────────────────
function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString(); }

function detectType(title, filterType) {
  if (filterType && filterType !== 'tous') {
    const m = { stage:'Stage', alternance:'Alternance', cdi:'CDI', cdd:'CDD', freelance:'Freelance' };
    if (m[filterType]) return m[filterType];
  }
  const t = (title || '').toLowerCase();
  if (t.includes('stage') || t.includes('intern') || t.includes('internship')) return 'Stage';
  if (t.includes('alternance') || t.includes('apprenti') || t.includes('apprenticeship')) return 'Alternance';
  if (t.includes('freelance') || t.includes('indépendant') || t.includes('independent')) return 'Freelance';
  if (t.includes('cdd') || t.includes('temporary') || t.includes('contract')) return 'CDD';
  return 'CDI';
}

function isGermanJob(title, description) {
  const t = (title || '').toLowerCase();
  const d = (description || '').toLowerCase();
  return t.includes('(m/w/d)') || t.includes('(w/m/d)') || t.includes('minijob') ||
         t.includes('werkstudent') || t.includes('nebenjob') || t.includes('homeoffice job') ||
         d.includes(' deutsch') || d.startsWith('das ') || d.startsWith('wir ');
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

// ── ADZUNA ────────────────────────────────────────────
async function fetchAdzuna(q, type, location, page) {
  if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) return [];
  try {
    const what = [
      q,
      type === 'stage' ? 'stage' : type === 'alternance' ? 'alternance' : ''
    ].filter(Boolean).join(' ') || 'emploi';
    const params = new URLSearchParams({
      app_id: process.env.ADZUNA_APP_ID,
      app_key: process.env.ADZUNA_APP_KEY,
      results_per_page: '15',
      page: String(page + 1),
      what,
      where: location || 'France',
      sort_by: 'date',
    });
    const res = await withTimeout(
      fetch(`https://api.adzuna.com/v1/api/jobs/fr/search/1?${params}`),
      12000
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map(j => ({
      id: 'az_' + j.id,
      title: j.title,
      company: j.company?.display_name || 'Confidentiel',
      location: j.location?.display_name || 'France',
      type: detectType(j.title, type),
      salary: j.salary_min
        ? `${Math.round(j.salary_min/1000)}k–${Math.round((j.salary_max||j.salary_min)/1000)}k€/an`
        : null,
      description: (j.description || '').slice(0, 300),
      url: j.redirect_url || '',
      date: j.created || new Date().toISOString(),
      remote: (j.title + (j.description||'')).toLowerCase().includes('télétravail') ||
              (j.title + (j.description||'')).toLowerCase().includes('remote'),
      source: 'Adzuna',
      logo: null,
      country: 'FR',
    }));
  } catch { return []; }
}

// ── REMOTIVE ──────────────────────────────────────────
async function fetchRemotive(q, type) {
  if (type && ['stage', 'alternance', 'cdd'].includes(type)) return [];
  try {
    const search = q || 'developer engineer product manager designer';
    const res = await withTimeout(
      fetch(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(search)}&limit=10`),
      8000
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs || [])
      .filter(j => {
        const loc = (j.candidate_required_location || '').toLowerCase();
        return !loc || loc.includes('worldwide') || loc.includes('europe') ||
               loc.includes('france') || loc.includes('eu') || loc.includes('anywhere') ||
               loc.includes('global');
      })
      .slice(0, 8)
      .map(j => ({
        id: 'rm_' + j.id,
        title: j.title,
        company: j.company_name || 'Confidentiel',
        location: 'Remote · ' + (j.candidate_required_location || 'Worldwide'),
        type: detectType(j.title, type) === 'CDI' ? 'Remote' : detectType(j.title, type),
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
      fetch(`https://www.arbeitnow.com/api/job-board-api?${params}`),
      8000
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || [])
      .filter(j => {
        const loc = (j.location || '').toLowerCase();
        const isFR = loc.includes('france') || loc.includes('paris') || loc.includes('lyon') ||
                     loc.includes('bordeaux') || loc.includes('marseille') || loc.includes('toulouse');
        const isRemote = j.remote && !isGermanJob(j.title, j.description);
        return isFR || isRemote;
      })
      .slice(0, 8)
      .map(j => ({
        id: 'ab_' + j.slug,
        title: j.title,
        company: j.company_name || 'Confidentiel',
        location: j.remote ? 'Remote · EU' : (j.location || 'Europe'),
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

// ── THE MUSE ──────────────────────────────────────────
async function fetchTheMuse(q, type, page) {
  if (type && !['cdi', 'tous', '', 'freelance'].includes(type)) return [];
  try {
    const params = new URLSearchParams({
      page: String(page),
      results_per_page: '10',
      ...(q ? { name: q } : {}),
      ...(type === 'stage' ? { level: 'Internship' } : {}),
    });
    const res = await withTimeout(
      fetch(`https://www.themuse.com/api/public/jobs?${params}`),
      8000
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || [])
      .filter(j => {
        const locs = (j.locations || []).map(l => (l.name || '').toLowerCase());
        return locs.length === 0 ||
               locs.some(l => l.includes('france') || l.includes('paris') ||
                              l.includes('remote') || l.includes('anywhere') ||
                              l.includes('flexible'));
      })
      .slice(0, 5)
      .map(j => ({
        id: 'tm_' + j.id,
        title: j.name,
        company: j.company?.name || 'Confidentiel',
        location: (j.locations || []).map(l => l.name).join(', ') || 'Remote / Flexible',
        type: j.levels?.some(l => (l.name||'').toLowerCase().includes('intern')) ? 'Stage' : 'CDI',
        salary: null,
        description: (j.contents || '').replace(/<[^>]*>/g, '').slice(0, 300),
        url: j.refs?.landing_page || '',
        date: j.publication_date || new Date().toISOString(),
        remote: (j.locations || []).some(l => (l.name||'').toLowerCase().includes('remote')),
        source: 'The Muse',
        logo: j.company?.refs?.logo_image || null,
        country: 'INTL',
      }));
  } catch { return []; }
}

// ── JOBICY (Remote FR focus) ──────────────────────────
async function fetchJobicy(q, type) {
  if (type && ['stage', 'alternance', 'cdd'].includes(type)) return [];
  try {
    const params = new URLSearchParams({ count: '10', geo: 'france' });
    if (q) params.set('tag', q);
    const res = await withTimeout(
      fetch(`https://jobicy.com/api/v2/remote-jobs?${params}`),
      8000
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs || []).map(j => ({
      id: 'jc_' + j.id,
      title: j.jobTitle,
      company: j.companyName || 'Confidentiel',
      location: 'Remote · France / EU',
      type: detectType(j.jobTitle, type),
      salary: j.annualSalaryMin
        ? `${Math.round(j.annualSalaryMin/1000)}k–${Math.round(j.annualSalaryMax/1000)}k ${j.salaryCurrency||'€'}/an`
        : null,
      description: (j.jobExcerpt || '').slice(0, 300),
      url: j.url || '',
      date: j.pubDate || new Date().toISOString(),
      remote: true,
      source: 'Jobicy',
      logo: j.companyLogo || null,
      country: 'REMOTE',
    }));
  } catch { return []; }
}

// ── DEDUPLICATION & SORT ──────────────────────────────
function deduplicate(jobs) {
  const seen = new Set();
  return jobs.filter(j => {
    const key = (j.title + j.company).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function prioritize(jobs) {
  const order = { FR: 0, REMOTE: 1, INTL: 2, EU: 3 };
  return jobs.sort((a, b) => {
    const ao = order[a.country] ?? 4, bo = order[b.country] ?? 4;
    if (ao !== bo) return ao - bo;
    return new Date(b.date) - new Date(a.date);
  });
}

// ── MOCK FALLBACK ─────────────────────────────────────
const MOCK = [
  { id:'m1', title:'Développeur Full Stack React/Node.js', company:'BNP Paribas', location:'Paris 75009', type:'CDI', salary:'45–55k€/an', description:'Stack React, Node.js, PostgreSQL. Fort impact sur des millions de clients.', url:'/app', date:daysAgo(1), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m2', title:'Growth Marketing Manager', company:'Doctolib', location:'Paris 75009', type:'CDI', salary:'40–50k€/an', description:'Pilotez la croissance B2B. SEA, Growth Hacking, Content Marketing.', url:'/app', date:daysAgo(2), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m3', title:'Stage Marketing Digital — 6 mois', company:"L'Oréal", location:'Paris 75008', type:'Stage', salary:'1 200€/mois', description:"Stage 6 mois en Growth. A/B tests, Meta Ads, SEO/SEA.", url:'/app', date:daysAgo(1), remote:false, source:'Emploia', logo:null, country:'FR' },
  { id:'m4', title:'Alternance Business Developer', company:'Capgemini', location:'Paris 75017', type:'Alternance', salary:'1 500€/mois', description:'Alternance 12 mois. Prospection, démos, closing B2B.', url:'/app', date:daysAgo(3), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m5', title:'Data Analyst — CDD 12 mois', company:'Société Générale', location:'Paris La Défense', type:'CDD', salary:'38–42k€/an', description:'SQL, Python, Tableau. Analyse des performances clients.', url:'/app', date:daysAgo(2), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m6', title:'UX Designer', company:'Pennylane', location:'Paris 75009', type:'CDI', salary:'42–52k€/an', description:'Figma, user research. Logiciel comptable 2M+ utilisateurs.', url:'/app', date:daysAgo(0), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m7', title:'DevOps Engineer', company:'OVHcloud', location:'Roubaix 59100', type:'CDI', salary:'48–58k€/an', description:'Kubernetes, Terraform, AWS. Leader européen du cloud.', url:'/app', date:daysAgo(1), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m8', title:'Alternance Cybersécurité — 2 ans', company:'Thales', location:'Vélizy 78', type:'Alternance', salary:'1 700€/mois', description:'SOC, pentest, conformité. Groupe de défense de rang mondial.', url:'/app', date:daysAgo(0), remote:false, source:'Emploia', logo:null, country:'FR' },
  { id:'m9', title:'Product Manager Apps Mobiles', company:'Meilleurtaux', location:'Paris 75002', type:'CDI', salary:'50–65k€/an', description:'Roadmap produit, 2M+ téléchargements. Agile, Figma, SQL.', url:'/app', date:daysAgo(4), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m10', title:'Stage Data Python — 6 mois', company:'Criteo', location:'Paris 75009', type:'Stage', salary:'1 350€/mois', description:'Python, pandas, SQL. Équipe Data Science à fort impact.', url:'/app', date:daysAgo(1), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m11', title:'Ingénieur Backend Node.js', company:'Qonto', location:'Paris 75002', type:'CDI', salary:'45–58k€/an', description:'API REST, microservices. Fintech française top 10 européen.', url:'/app', date:daysAgo(0), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m12', title:'Alternance RH & Recrutement', company:'Decathlon', location:'Lille 59000', type:'Alternance', salary:'1 300€/mois', description:'Recrutement, marque employeur, onboarding.', url:'/app', date:daysAgo(5), remote:false, source:'Emploia', logo:null, country:'FR' },
  { id:'m13', title:'Commercial B2B SaaS', company:'Salesforce', location:'Paris 75008', type:'CDI', salary:'45–70k€/an + variable', description:'Account Executive sur le marché FR. Closing, négociation grands comptes.', url:'/app', date:daysAgo(2), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m14', title:'Stage Communication & Brand', company:'LVMH', location:'Paris 75008', type:'Stage', salary:'1 100€/mois', description:'Stage 6 mois au sein de la direction communication du groupe.', url:'/app', date:daysAgo(1), remote:false, source:'Emploia', logo:null, country:'FR' },
  { id:'m15', title:'Alternance Développeur Mobile Flutter', company:'Qonto', location:'Paris 75002', type:'Alternance', salary:'1 600€/mois', description:'Alternance dev mobile chez Qonto. Flutter, Dart. 24 mois.', url:'/app', date:daysAgo(0), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m16', title:'Chef de Projet IT', company:'Société Générale', location:'Paris La Défense', type:'CDI', salary:'52–65k€/an', description:'Transformation IT à la DSI. Méthodes agiles, conduite du changement.', url:'/app', date:daysAgo(1), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m17', title:'Data Engineer', company:'Criteo', location:'Paris 75009', type:'CDI', salary:'50–65k€/an', description:'Spark, Kafka, Airflow. Pipeline de données à grande échelle.', url:'/app', date:daysAgo(3), remote:true, source:'Emploia', logo:null, country:'FR' },
  { id:'m18', title:'Stage Analyse Financière — 6 mois', company:'BNP Paribas', location:'Paris 75009', type:'Stage', salary:'1 200€/mois', description:'Modélisation financière, M&A, reporting. Direction Finance Groupe.', url:'/app', date:daysAgo(2), remote:false, source:'Emploia', logo:null, country:'FR' },
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
    const m = { stage:'Stage', alternance:'Alternance', cdi:'CDI', cdd:'CDD', freelance:'Freelance' };
    if (m[type]) items = items.filter(j => j.type === m[type]);
  }
  const start = page * 12;
  return { jobs: items.slice(start, start + 12), total: items.length, page, demo: true, sources: ['Emploia'] };
}

// ── MAIN HANDLER ──────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(H).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(204).end();
  }

  const q        = (req.query?.q || '').trim();
  const type     = (req.query?.type || '').toLowerCase();
  const location = req.query?.location || '';
  const page     = Math.max(0, parseInt(req.query?.page || '0'));

  try {
    const [adzRes, rmRes, abRes, muRes, jcRes] = await Promise.allSettled([
      fetchAdzuna(q, type, location, page),
      fetchRemotive(q, type),
      fetchArbeitnow(q, type, page),
      fetchTheMuse(q, type, page),
      fetchJobicy(q, type),
    ]);

    const allJobs = [
      ...(adzRes.status === 'fulfilled' ? adzRes.value : []),
      ...(rmRes.status === 'fulfilled' ? rmRes.value : []),
      ...(abRes.status === 'fulfilled' ? abRes.value : []),
      ...(muRes.status === 'fulfilled' ? muRes.value : []),
      ...(jcRes.status === 'fulfilled' ? jcRes.value : []),
    ];

    if (allJobs.length > 0) {
      const final = prioritize(deduplicate(allJobs));
      const sources = [...new Set(final.map(j => j.source))];
      Object.entries(H).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(200).json({ jobs: final, total: final.length, page, demo: false, sources });
    }
  } catch {}

  Object.entries(H).forEach(([k, v]) => res.setHeader(k, v));
  return res.status(200).json(getMock(q, type, page));
}
