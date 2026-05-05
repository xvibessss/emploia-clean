// Node.js runtime — process.env supported
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
  if (t.includes('stage') || t.includes('intern')) return 'Stage';
  if (t.includes('alternance') || t.includes('apprenti')) return 'Alternance';
  if (t.includes('freelance')) return 'Freelance';
  if (t.includes('cdd')) return 'CDD';
  return 'CDI';
}

async function fetchAdzuna(q, type, location, page) {
  if (!process.env.ADZUNA_APP_ID) return [];
  try {
    const TYPE_MAP = { stage:'part_time', alternance:'permanent', cdi:'permanent', cdd:'contract', freelance:'contract' };
    const params = new URLSearchParams({
      app_id: process.env.ADZUNA_APP_ID,
      app_key: process.env.ADZUNA_APP_KEY,
      results_per_page: '15',
      page: String(page + 1),
      what: [q, type === 'stage' ? 'stage' : type === 'alternance' ? 'alternance' : ''].filter(Boolean).join(' ') || 'emploi',
      where: location || 'France',
      sort_by: 'date',
    });
    if (TYPE_MAP[type]) params.set('contract_type', TYPE_MAP[type]);
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://api.adzuna.com/v1/api/jobs/fr/search/1?${params}`, { signal: ctrl.signal });
    clearTimeout(tid);
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
      remote: (j.title + (j.description||'')).toLowerCase().includes('télétravail') || (j.title + (j.description||'')).toLowerCase().includes('remote'),
      source: 'Adzuna',
      logo: null,
      country: 'FR',
    }));
  } catch (e) { return []; }
}

async function fetchRemotive(q, type) {
  if (type && ['stage','alternance','cdd'].includes(type)) return [];
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(
      `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q || 'developer engineer manager')}&limit=6`,
      { signal: ctrl.signal }
    );
    clearTimeout(tid);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs || [])
      .filter(j => {
        const loc = (j.candidate_required_location || '').toLowerCase();
        return !loc || loc.includes('worldwide') || loc.includes('europe') || loc.includes('france');
      })
      .slice(0, 5)
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

async function fetchArbeitnow(q, type, page) {
  if (type && ['stage','alternance'].includes(type)) return [];
  try {
    const params = new URLSearchParams({ page: String(page + 1) });
    if (q) params.set('search', q);
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`https://www.arbeitnow.com/api/job-board-api?${params}`, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) return [];
    const data = await res.json();
    const filtered = (data.data || []).filter(j => {
      const loc = (j.location || '').toLowerCase();
      return j.remote || loc.includes('france') || loc.includes('paris') || loc.includes('remote');
    });
    return filtered.slice(0, 5).map(j => ({
      id: 'ab_' + j.slug,
      title: j.title,
      company: j.company_name || 'Confidentiel',
      location: j.remote ? 'Remote · EU' : (j.location || 'Europe'),
      type: j.remote ? 'Remote' : detectType(j.title, type),
      salary: null,
      description: (j.description || '').replace(/<[^>]*>/g, '').slice(0, 300),
      url: j.url,
      date: j.created_at ? new Date(j.created_at * 1000).toISOString() : new Date().toISOString(),
      remote: j.remote || false,
      source: 'Arbeitnow',
      logo: j.company_logo || null,
      country: j.remote ? 'REMOTE' : 'EU',
    }));
  } catch { return []; }
}

function deduplicate(jobs) {
  const seen = new Set();
  return jobs.filter(j => {
    const key = (j.title + j.company).toLowerCase().replace(/[^a-z0-9]/g,'');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

const MOCK = [
  { id:'m1', title:'Développeur Full Stack React/Node.js', company:'BNP Paribas', location:'Paris', type:'CDI', salary:'45–55k€/an', description:'Stack React, Node.js, PostgreSQL.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(1), remote:true, source:'Démo', logo:null, country:'FR' },
  { id:'m2', title:'Growth Marketing Manager', company:'Doctolib', location:'Paris', type:'CDI', salary:'40–50k€/an', description:'Pilotez la croissance B2B.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(2), remote:true, source:'Démo', logo:null, country:'FR' },
  { id:'m3', title:'Stage Marketing Digital', company:"L'Oréal", location:'Paris', type:'Stage', salary:'1 200€/mois', description:'Stage 6 mois en Growth.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(1), remote:false, source:'Démo', logo:null, country:'FR' },
  { id:'m4', title:'Alternance Business Developer', company:'Capgemini', location:'Paris', type:'Alternance', salary:'1 500€/mois', description:'Alternance 12 mois.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(3), remote:true, source:'Démo', logo:null, country:'FR' },
  { id:'m5', title:'Data Analyst', company:'Société Générale', location:'Paris', type:'CDI', salary:'40–48k€/an', description:'SQL, Python, Tableau.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(2), remote:true, source:'Démo', logo:null, country:'FR' },
  { id:'m6', title:'UX Designer', company:'Qonto', location:'Paris', type:'CDI', salary:'42–52k€/an', description:'Figma, user research.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(0), remote:true, source:'Démo', logo:null, country:'FR' },
  { id:'m7', title:'DevOps Engineer', company:'OVHcloud', location:'Roubaix', type:'CDI', salary:'48–58k€/an', description:'Kubernetes, Terraform, AWS.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(1), remote:true, source:'Démo', logo:null, country:'FR' },
  { id:'m8', title:'Alternance Cybersécurité', company:'Thales', location:'Vélizy', type:'Alternance', salary:'1 700€/mois', description:'SOC, pentest, conformité.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(0), remote:false, source:'Démo', logo:null, country:'FR' },
  { id:'m9', title:'Product Manager', company:'Meilleurtaux', location:'Paris', type:'CDI', salary:'50–65k€/an', description:'Roadmap produit, apps mobiles.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(4), remote:true, source:'Démo', logo:null, country:'FR' },
  { id:'m10', title:'Stage Data Python', company:'Criteo', location:'Paris', type:'Stage', salary:'1 350€/mois', description:'Python, pandas, SQL.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(1), remote:true, source:'Démo', logo:null, country:'FR' },
  { id:'m11', title:'Ingénieur Backend Node.js', company:'Pennylane', location:'Paris', type:'CDI', salary:'45–58k€/an', description:'API REST, microservices.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(0), remote:true, source:'Démo', logo:null, country:'FR' },
  { id:'m12', title:'Alternance RH & Recrutement', company:'Decathlon', location:'Lille', type:'Alternance', salary:'1 300€/mois', description:'Recrutement, marque employeur.', url:'https://emploia-clean.vercel.app/app', date:daysAgo(5), remote:false, source:'Démo', logo:null, country:'FR' },
];

function getMock(q, type, page) {
  let items = [...MOCK];
  if (q) {
    const ql = q.toLowerCase();
    items = items.filter(j => j.title.toLowerCase().includes(ql) || j.company.toLowerCase().includes(ql) || j.description.toLowerCase().includes(ql));
  }
  if (type && type !== 'tous') {
    const m = { stage:'Stage', alternance:'Alternance', cdi:'CDI', cdd:'CDD', freelance:'Freelance' };
    if (m[type]) items = items.filter(j => j.type === m[type]);
  }
  return { jobs: items.slice(page*12, page*12+12), total: items.length, page, demo: true, sources: ['Démo'] };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(H).forEach(([k,v]) => res.setHeader(k,v));
    return res.status(204).end();
  }

  const q        = req.query?.q || '';
  const type     = (req.query?.type || '').toLowerCase();
  const location = req.query?.location || '';
  const page     = Math.max(0, parseInt(req.query?.page || '0'));

  try {
    const [adzRes, rmRes, abRes] = await Promise.allSettled([
      fetchAdzuna(q, type, location, page),
      fetchRemotive(q, type),
      fetchArbeitnow(q, type, page),
    ]);

    const allJobs = [
      ...(adzRes.status === 'fulfilled' ? adzRes.value : []),
      ...(rmRes.status === 'fulfilled' ? rmRes.value : []),
      ...(abRes.status === 'fulfilled' ? abRes.value : []),
    ];

    if (allJobs.length > 0) {
      const final = deduplicate(allJobs).sort((a,b) => new Date(b.date) - new Date(a.date));
      const sources = [...new Set(final.map(j => j.source))];
      Object.entries(H).forEach(([k,v]) => res.setHeader(k,v));
      return res.status(200).json({ jobs: final, total: final.length, page, demo: false, sources });
    }
  } catch (e) {}

  Object.entries(H).forEach(([k,v]) => res.setHeader(k,v));
  return res.status(200).json(getMock(q, type, page));
}
