  const DEFAULT_QUERY="infirmier santé médical";
  function esc(s){return(s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function renderJob(j){
    const card=document.createElement('div');card.className='job-card reveal';
    const t={full_time:'CDI',part_time:'Temps partiel',contract:'CDD',internship:'Stage',apprenticeship:'Alternance',temporary:'Intérim',freelance:'Freelance'};
    const type=t[j.job_type]||j.type||'';
    const enc=encodeURIComponent((j.title||'')+(j.company_name||j.company?' chez '+(j.company_name||j.company):''));
    const logo=j.company_logo?`<img src="${esc(j.company_logo)}" alt="" loading="lazy" data-on-error="this_parentElement_textContent_56d8">`:'🏢';
    card.innerHTML=`<div class="job-card-top"><div class="job-logo">${logo}</div><div><div class="job-title">${esc(j.title||'Poste')}</div><div class="job-company">${esc(j.company_name||j.company||'')}</div></div></div>
    <div class="job-tags">${type?`<span class="job-tag type">${esc(type)}</span>`:''}${j.remote?'<span class="job-tag">🌐 Remote</span>':''}</div>
    <div class="job-card-footer"><a href="/app?offre=${enc}" class="btn btn-primary">✨ Générer CV</a>${j.url&&/^https?:\/\//i.test(j.url)?`<a href="${esc(j.url)}" target="_blank" rel="noopener" class="btn btn-ghost">Voir →</a>`:''}</div>`;
    return card;
  }
  function refineSearch(){window.location.href='/recherche?q='+encodeURIComponent(document.getElementById('queryInput').value.trim()||DEFAULT_QUERY);}
  async function loadJobs(){
    const g=document.getElementById('jobGrid');
    try{
      const r=await fetch('/api/jobs?q='+encodeURIComponent(DEFAULT_QUERY)+'&limit=18');
      const d=await r.json();const jobs=d.jobs||d.results||[];
      g.innerHTML='';
      if(!jobs.length){g.innerHTML='<div class="loading-state">Aucune offre — <a href="/jobs" style="color:var(--blb);margin-left:6px">voir toutes les offres</a></div>';document.getElementById('jobCount').textContent='Aucune offre';return;}
      jobs.forEach(j=>g.appendChild(renderJob(j)));
      document.getElementById('jobCount').textContent=d.filtre==='abandonne'?'Aucune offre ne correspond · '+(d.total||jobs.length).toLocaleString('fr-FR')+' dernières offres publiées':(d.total||jobs.length).toLocaleString('fr-FR')+' offres trouvées';
      document.querySelectorAll('.reveal').forEach(el=>el.classList.add('visible'));
    }catch{g.innerHTML='<div class="loading-state"><a href="/jobs" style="color:var(--blb)">Voir toutes les offres</a></div>';}
  }
  loadJobs();
