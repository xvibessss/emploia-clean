  const DEFAULT_QUERY = "Perpignan";
  const DEFAULT_LOCATION = "Perpignan";
  function esc(s) { return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function formatDate(d) { if(!d) return ''; const diff=Math.floor((Date.now()-new Date(d))/86400000); if(diff===0) return "Aujourd'hui"; if(diff===1) return "Hier"; if(diff<7) return `Il y a ${diff}j`; return `Il y a ${Math.floor(diff/7)} sem.`; }
  const JOB_TYPES = { full_time:'CDI', part_time:'Temps partiel', contract:'CDD', internship:'Stage', apprenticeship:'Alternance', temporary:'Intérim', freelance:'Freelance' };
  function renderJob(job) {
    const card = document.createElement('div'); card.className = 'job-card reveal';
    const typeLabel = JOB_TYPES[job.job_type] || job.type || job.job_type || '';
    const companyLogo = job.company_logo || job.logo || '';
    const encoded = encodeURIComponent((job.title||'')+(job.company_name||job.company?` chez ${job.company_name||job.company}`:''));
    const logo = companyLogo ? `<img src="${esc(companyLogo)}" alt="" loading="lazy" data-on-error="this_parentElement_textContent_56d8">` : '🏢';
    const loc = job.location || job.job_city || '';
    card.innerHTML = `
      <div class="job-card-top"><div class="job-logo">${logo}</div><div><div class="job-title">${esc(job.title||'Poste')}</div><div class="job-company">${esc(job.company_name||job.company||'')} ${loc?'· '+esc(loc):''}</div></div></div>
      <div class="job-tags">${typeLabel?`<span class="job-tag type">${esc(typeLabel)}</span>`:''}${job.remote?'<span class="job-tag">🌐 Remote</span>':''}${(job.created_at||job.date_posted||job.date)?`<span class="job-tag">${formatDate(job.created_at||job.date_posted||job.date)}</span>`:''}</div>
      <div class="job-card-footer"><a href="/app?offre=${encoded}" class="btn btn-primary">✨ Générer CV</a>${(job.url||job.job_apply_link)&&/^https?:\/\//i.test(job.url||job.job_apply_link)?`<a href="${esc(job.url||job.job_apply_link)}" target="_blank" rel="noopener" class="btn btn-ghost">Voir →</a>`:''}</div>`;
    return card;
  }
  function refineSearch() { const q = document.getElementById('queryInput').value.trim() || DEFAULT_QUERY; window.location.href = '/recherche?' + new URLSearchParams({ q, location: DEFAULT_LOCATION }).toString(); }
  async function loadJobs() {
    const grid = document.getElementById('jobGrid');
    try {
      const r = await fetch('/api/jobs?' + new URLSearchParams({ q: DEFAULT_QUERY, location: DEFAULT_LOCATION, limit: 18 }));
      const data = await r.json(); const jobs = data.jobs || data.results || [];
      grid.innerHTML = '';
      if (!jobs.length) { grid.innerHTML = '<div style="text-align:center;padding:60px;color:var(--t3);grid-column:1/-1">Aucune offre trouvée — <a href="/jobs" style="color:var(--blb)">voir toutes les offres</a></div>'; document.getElementById('jobCount').textContent = 'Aucune offre trouvée'; return; }
      jobs.forEach(j => grid.appendChild(renderJob(j)));
      document.getElementById('jobCount').textContent = data.filtre === 'abandonne' ? `Aucune offre ne correspond · ${(data.total||jobs.length).toLocaleString('fr-FR')} dernières offres publiées` : `${(data.total||jobs.length).toLocaleString('fr-FR')} offres trouvées`;
      document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
    } catch { grid.innerHTML = '<div style="text-align:center;padding:60px;color:var(--t3);grid-column:1/-1"><a href="/jobs" style="color:var(--blb)">Voir toutes les offres</a></div>'; document.getElementById('jobCount').textContent=''; }
  }
  loadJobs();
