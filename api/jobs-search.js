// Additional search endpoint that aggregates more sources
// Used for real-time search suggestions and extended results
export const config = { runtime: 'edge' };
import { getAllowedOrigin, checkRateLimit } from './_lib/auth.js';

// Scrape-free APEC via their public RSS feed
async function fetchAPECRSS(q, type) {
  if (!['cdi', 'cdd', 'tous', ''].includes(type || '')) return [];
  try {
    const query = q || 'ingénieur développeur manager';
    const res = await fetch(
      `https://www.apec.fr/candidat/recherche-emploi.html/emploi?sortsType=SCORE&sortsDirection=DESC&motsCles=${encodeURIComponent(query)}&libelleMetier=&nbParPage=20&page=0&lieu=75%7C1%7CParis%7CParis`,
      { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.resultats || []).slice(0, 8).map(j => ({
      id: 'apec_' + j.numOffre,
      title: j.intitulePoste,
      company: j.nomSociete || 'Confidentiel',
      location: j.lieuPoste || 'France',
      type: 'CDI',
      salary: j.salaireTexte || null,
      description: (j.texteHtml || '').replace(/<[^>]*>/g, '').slice(0, 300),
      url: `https://www.apec.fr/candidat/recherche-emploi.html/emploi/${j.numOffre}`,
      date: j.datePublication || new Date().toISOString(),
      experience: j.experienceMin ? `${j.experienceMin}+ ans` : null,
      remote: (j.typeContrat || '').includes('télétravail'),
      source: 'APEC',
      logo: null,
    }));
  } catch { return []; }
}

// HelloWork public API (aggregator for France)
async function fetchHelloWork(q, type, location) {
  try {
    const params = new URLSearchParams({
      what: q || 'emploi',
      where: location || 'france',
      contract: type === 'stage' ? 'stage' : type === 'alternance' ? 'alternance' : '',
    });
    const res = await fetch(`https://www.hellowork.com/fr-fr/emploi/recherche.html?${params}`, {
      signal: AbortSignal.timeout(8000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
      }
    });
    if (!res.ok) return [];
    // HelloWork returns HTML, so skip if no JSON
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) return [];
    const data = await res.json();
    return (data.jobs || []).slice(0, 8).map(j => ({
      id: 'hw_' + j.id,
      title: j.title,
      company: j.company || 'Confidentiel',
      location: j.location || 'France',
      type: j.contract || 'CDI',
      salary: j.salary || null,
      description: (j.description || '').slice(0, 300),
      url: j.url || '',
      date: j.date || new Date().toISOString(),
      experience: null,
      remote: false,
      source: 'HelloWork',
      logo: null,
    }));
  } catch { return []; }
}

// WeLoveDevs (tech jobs France — public API)
async function fetchWeLoveDevs(q, type) {
  try {
    const res = await fetch(
      `https://welovedevs.com/app/api/v1/search?search=${encodeURIComponent(q || 'développeur')}&size=10`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.hits?.hits || []).slice(0, 6).map(j => {
      const s = j._source || {};
      return {
        id: 'wld_' + j._id,
        title: s.title || s.job?.title || 'Développeur',
        company: s.company?.name || s.company || 'Confidentiel',
        location: s.location?.city || 'France',
        type: s.contract || 'CDI',
        salary: s.salaryRange ? `${s.salaryRange.min}k – ${s.salaryRange.max}k€/an` : null,
        description: (s.description || '').replace(/<[^>]*>/g, '').slice(0, 300),
        url: `https://welovedevs.com/app/jobs/${j._id}`,
        date: s.publishedAt || new Date().toISOString(),
        experience: s.experienceLevel || null,
        remote: s.remote || s.hasRemote || false,
        source: 'WeLoveDevs',
        logo: s.company?.logoUrl || null,
      };
    });
  } catch { return []; }
}

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'jobs-search', 60, 60);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '60' } });

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').slice(0, 200);
  const type = (url.searchParams.get('type') || '').toLowerCase().slice(0, 20);
  const location = (url.searchParams.get('location') || '').slice(0, 100);

  const [apecJobs, helloWorkJobs, wldJobs] = await Promise.allSettled([
    fetchAPECRSS(q, type),
    fetchHelloWork(q, type, location),
    fetchWeLoveDevs(q, type),
  ]);

  const jobs = [
    ...(apecJobs.status === 'fulfilled' ? apecJobs.value : []),
    ...(helloWorkJobs.status === 'fulfilled' ? helloWorkJobs.value : []),
    ...(wldJobs.status === 'fulfilled' ? wldJobs.value : []),
  ];

  return new Response(JSON.stringify({ jobs, total: jobs.length }), { status: 200, headers: H });
}
