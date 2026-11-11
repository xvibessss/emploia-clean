  let currentType = 'tous', currentPage = 0;
  const saved = new Set((() => { try { return JSON.parse(localStorage.getItem('emploia_saved_jobs') || '[]'); } catch { return []; } })());
  let allJobs = [];
  const tracked = new Set((() => { try { return JSON.parse(localStorage.getItem('emploia_tracked_jobs') || '[]'); } catch { return []; } })());
  let applyQueueIds = new Set((() => { try { return (JSON.parse(localStorage.getItem('emploia_apply_queue') || '[]')).map(q => String(q.id)); } catch { return []; } })());

  // ── RECENT SEARCHES ──
  const RECENT_KEY = 'emploia_recent_searches';
  function getRecentSearches() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } }
  function saveRecentSearch(q) {
    if (!q || q.length < 2) return;
    let recents = getRecentSearches().filter(r => r.toLowerCase() !== q.toLowerCase());
    recents.unshift(q);
    recents = recents.slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recents));
    renderRecentSearches();
  }
  function renderRecentSearches() {
    const wrap = document.getElementById('recentSearches');
    const recents = getRecentSearches();
    if (!wrap || !recents.length) { if (wrap) wrap.classList.remove('visible'); return; }
    const label = wrap.querySelector('.jb-recent-label');
    const chips = recents.map(r => `<button class="jb-recent-chip" data-on-click="applyRecentSearch_JSON_parse_t_3657" data-arg-95ff-0="${esc(JSON.stringify(r))}">${r}</button>`).join('');
    wrap.innerHTML = (label?.outerHTML || '<span class="jb-recent-label">Récent :</span>') + chips;
    wrap.classList.add('visible');
  }
  function applyRecentSearch(q) {
    const inp = document.getElementById('searchInput');
    if (inp) { inp.value = q; doSearch(); }
  }

  function setType(btn) { document.querySelectorAll('.jb-type-chip').forEach(b => b.classList.remove('active')); btn.classList.add('active'); currentType = btn.dataset.type; currentPage = 0; doSearch(); }
  function doSearch() { currentPage = 0; const q = (document.getElementById('searchInput')?.value || '').trim(); if (q) saveRecentSearch(q); loadJobs(); }
  function toggleRemote(btn) { const on = btn.dataset.remote === '0'; btn.dataset.remote = on ? '1' : '0'; btn.style.background = on ? 'var(--tint-mint)' : ''; btn.style.borderColor = on ? 'var(--brand-green)' : ''; btn.style.color = on ? 'var(--brand-green)' : ''; const cb = document.getElementById('rem1'); if (cb) cb.checked = on; doSearch(); }

  const SCORE_CACHE_KEY = 'emploia_scores_v1', SCORE_TTL = 86400000;
  function loadScoreCache() { try { const raw = JSON.parse(localStorage.getItem(SCORE_CACHE_KEY) || '{}'); const now = Date.now(); const fresh = {}; for (const [k,v] of Object.entries(raw)) { if (v.ts && now - v.ts < SCORE_TTL) fresh[k] = v; } return fresh; } catch { return {}; } }
  const scoreCache = loadScoreCache();
  function persistScore(jobId, data) { scoreCache[jobId] = { ...data, ts: Date.now() }; try { localStorage.setItem(SCORE_CACHE_KEY, JSON.stringify(scoreCache)); } catch {} }

  async function analyzeScore(jobId, pillEl) {
    if (scoreCache[jobId]) { showScore(pillEl, scoreCache[jobId]); return; }
    const _j = allJobs.find(j => String(j.id) === String(jobId));
    const jobTitle = _j?.title || '', jobDescription = (_j?.description || '').slice(0, 800);
    const originalText = pillEl.textContent;
    pillEl.textContent = '⏳ Analyse…'; pillEl.style.pointerEvents = 'none'; pillEl.style.opacity = '.7';
    try {
      const userProfile = localStorage.getItem('emploia_profile_text') || '';
      const res = await fetch('/api/match-score', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobTitle, jobDescription, userProfile }) });
      if (!res.ok) throw new Error();
      const data = await res.json();
      persistScore(jobId, data); showScore(pillEl, data);
      pillEl.style.opacity = '';
      try { const KEY = 'emploia_scores_history'; const hist = JSON.parse(localStorage.getItem(KEY) || '[]'); hist.push({ type: 'match', ts: Date.now(), score: data.score }); localStorage.setItem(KEY, JSON.stringify(hist.slice(-50))); } catch {}
    } catch { pillEl.textContent = originalText; pillEl.style.pointerEvents = ''; pillEl.style.opacity = ''; }
  }

  function showScore(pillEl, data) {
    if (!pillEl) return;
    const s = data.score;
    const [bg, color] = s >= 75 ? ['var(--tint-mint)', 'var(--brand-green)'] : s >= 50 ? ['var(--tint-yellow)', 'var(--brand-orange-deep)'] : ['var(--tint-rose)', 'var(--brand-pink-deep)'];
    pillEl.textContent = `✨ ${s}%`; pillEl.style.pointerEvents = ''; pillEl.style.background = bg; pillEl.style.color = color; pillEl.style.borderColor = color + '60';
    pillEl.title = [data.verdict, data.pros?.length ? '✅ ' + data.pros.join(' · ') : '', data.cons?.length ? '⚠️ ' + data.cons.join(' · ') : '', data.tip ? '💡 ' + data.tip : ''].filter(Boolean).join('\n');
  }

  function autoScoreAllJobs(jobs) {
    const profile = (localStorage.getItem('emploia_profile_text') || '').toLowerCase();
    if (!profile || profile.length < 20) return;
    jobs.forEach(job => {
      const pillEl = document.getElementById(`pill-${job.id}`);
      if (!pillEl) return;
      if (scoreCache[job.id]) { showScore(pillEl, scoreCache[job.id]); return; }
      const jobText = ((job.title || '') + ' ' + (job.description || '')).toLowerCase();
      const words = jobText.match(/\b[a-záàéèêëîïôùûüç]{4,}\b/gi) || [];
      const freq = {}; words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
      const top = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,25).map(e => e[0]);
      const matched = top.filter(k => profile.includes(k));
      const score = Math.round(30 + (matched.length / Math.max(top.length, 1)) * 65);
      const verdict = score >= 75 ? 'Bon match' : score >= 50 ? 'Match partiel' : 'Compétences à développer';
      const data = { score, verdict, pros: matched.slice(0, 3), cons: [], tip: '' };
      persistScore(job.id, data); showScore(pillEl, data);
    });
  }

  // Le repli était `jb-type-blue`, c'est-à-dire la couleur du CDI : un type
  // hors des cinq s'affichait donc EN CDI. Le défaut A avait une seconde
  // incarnation, visuelle, dans la feuille de style. Le repli est neutre.
  function typeBadgeClass(type) { return {'CDI':'jb-type-blue','CDD':'jb-type-purple','Stage':'jb-type-green','Alternance':'jb-type-yellow','Freelance':'jb-type-teal'}[type]||'jb-badge-gray'; }

  function renderJob(job) {
    const daysSince = Math.floor((Date.now() - new Date(job.date)) / 86400000);
    const dateStr = daysSince === 0 ? "Aujourd'hui" : daysSince === 1 ? "Hier" : `Il y a ${daysSince}j`;
    const isNew = daysSince < 3;
    const isSaved = saved.has(job.id);
    const isTracked = tracked.has(job.id);
    return `
      <div class="jb-card" id="jc-${esc(String(job.id))}">
        <div class="jb-card-head">
          <div class="jb-card-left">
            <div class="jb-logo">${job.logo ? `<img src="${esc(job.logo)}" alt="" style="width:100%;height:100%;border-radius:var(--r-sm);object-fit:contain" data-on-error="this_parentNode_textContent_215d"/>` : '🏢'}</div>
            <div class="jb-card-info">
              <div class="jb-card-title">${esc(job.title)}</div>
              <div class="jb-card-company">${esc(job.company)}</div>
            </div>
          </div>
          <span class="jb-match-pill" id="pill-${esc(String(job.id))}" title="Cliquer pour analyser la compatibilité IA" data-job-id="${esc(String(job.id))}" data-on-click="analyzeScore_this_dataset_jobI_371f">✨ Score IA</span>
        </div>
        <div class="jb-badges">
          ${job.type ? `<span class="jb-badge ${typeBadgeClass(job.type)}">${esc(job.type)}</span>` : ''}
          <span class="jb-badge jb-badge-gray">${esc(job.location)}</span>
          ${job.remote ? '<span class="jb-badge jb-type-green">Remote</span>' : ''}
          ${job.salary ? (job.salaryEstimated
            ? `<span class="jb-badge jb-badge-estime" title="Fourchette estimée par Adzuna depuis des annonces similaires. L'employeur n'a pas publié de salaire pour cette offre.">${esc(job.salary)} · estimation Adzuna</span>`
            : `<span class="jb-badge jb-badge-gray">${esc(job.salary)}</span>`) : ''}
          ${isNew ? '<span class="jb-badge jb-badge-red">Nouveau</span>' : ''}
        </div>
        ${job.description ? `<div class="jb-card-desc">${esc(job.description)}</div>` : ''}
        <div class="jb-card-footer">
          <div class="jb-card-meta">
            <span class="jb-card-date">${dateStr}</span>
            ${job.source ? `<span class="jb-card-src">${esc(job.source)}</span>` : ''}
          </div>
          <div class="jb-card-actions">
            <button class="jb-btn-cv" data-on-click="genCV_this_getAttribute_data_a_e77a" data-arg-3533-0="${esc(String(job.id))}">CV en 30s</button>
            <button class="jb-btn-track${isTracked?' tracked':''}" id="track-${esc(String(job.id))}" data-on-click="trackJob_this_getAttribute_dat_5d96" data-arg-6b07-0="${esc(String(job.id))}">${isTracked?'✅ Suivi':'Suivre'}</button>
            <button class="jb-btn-apply" data-on-click="openApplyDrawer_this_getAttrib_d0be" data-arg-b3d1-0="${esc(String(job.id))}">Postuler →</button>
            <button class="jb-btn-save${isSaved?' saved':''}" id="save-${esc(String(job.id))}" data-on-click="toggleSave_this_getAttribute_d_87b7" data-arg-0541-0="${esc(String(job.id))}">${isSaved?'⭐':'☆'}</button>
          </div>
        </div>
      </div>`;
  }

  // Couverture du contrat, rendue depuis `couvertureContrat` de la réponse.
  //
  // Le chiffre vient du serveur et n'est jamais recalculé ici : la liste reçue
  // peut être tronquée par `limit`, et un recomptage client annoncerait
  // « 18 sur 18 » là où le serveur a lu 18 contrats sur 31 offres.
  //
  // Absente — entrée de cache d'un déploiement antérieur — on n'affiche rien.
  // Un « 0 sur 0 » inventé serait précisément le genre d'affirmation sans
  // lecture que cette mission retire.
  function couvertureContrat(c) {
    if (!c || typeof c.total !== 'number' || !c.total) return '';
    // Sous filtre de contrat : la liste a été réduite, et il faut dire de
    // combien. C'est le cas que Hugo demande — « n offres au contrat confirmé
    // sur m » — et il n'a de sens que quand le filtre a effectivement agi.
    if (c.filtre && c.ecartees > 0) {
      const inconnues = c.sansContrat > 0
        ? ` · ${c.sansContrat} offre${c.sansContrat > 1 ? 's' : ''} au contrat non précisé, écartée${c.sansContrat > 1 ? 's' : ''}`
        : '';
      return `<div class="jb-couverture"><strong>${c.confirmees}</strong> offre${c.confirmees > 1 ? 's' : ''} au contrat confirmé sur ${c.total}${inconnues}</div>`;
    }
    // Hors filtre, on ne signale que ce qui manque, et seulement s'il en
    // manque : annoncer « 31 sur 31 » à chaque recherche serait du bruit.
    if (c.sansContrat > 0) {
      return `<div class="jb-couverture">${c.sansContrat} offre${c.sansContrat > 1 ? 's' : ''} sur ${c.total} sans type de contrat précisé par la source</div>`;
    }
    return '';
  }

  // ── LE REPLI DU FILTRE DE PERTINENCE, DIT À L'UTILISATEUR ─────────────────
  // `filtre: 'abandonne'` signifie qu'AUCUNE offre de l'agrégat ne correspondait
  // à la requête, et que le serveur a servi la liste entière plutôt qu'une page
  // blanche. C'est une décision assumée côté serveur — mieux vaut du bruit
  // qu'un trou — et elle tient à UNE condition : que le bruit soit VISIBLE.
  //
  // Il ne l'était pas. La seule trace était un `console.error` dans les
  // journaux Vercel, dont la rétention est d'une heure sur le plan Hobby, et un
  // champ `filtre` que cette page ne lisait pas. Pendant ce temps elle
  // annonçait « 14 offres pour "secrétaire" » — une affirmation que la donnée
  // ne soutient pas, exactement ce que `couvertureContrat` est venu retirer
  // juste au-dessus pour le type de contrat.
  //
  // Mesuré le 2026-10-22 sur les 20 métiers que le site publie en SEO : le
  // repli se déclenche sur UN d'entre eux (« secrétaire », 14 offres servies,
  // zéro pertinente). Rare, donc, mais parfaitement muet quand il se produit.
  // `cible` est la requête OU le lieu : `motsDeRecherche` tire ses mots des
  // deux, donc une page de ville sans offre déclenche le repli sans qu'aucun
  // `q` n'ait été saisi. Les deux vides ne peuvent pas abandonner — sans mot,
  // le filtre est `inactif`.
  function avisPertinence(data, q, loc) {
    if (data?.filtre !== 'abandonne') return '';
    const n = data.total || 0;
    const cible = q || loc || '';
    const pour = cible ? ` à « ${cible} »` : '';
    return `<div class="jb-avis">Aucune offre ne correspond${pour}. Voici les ${n.toLocaleString('fr-FR')} dernière${n > 1 ? 's' : ''} offre${n > 1 ? 's' : ''} publiée${n > 1 ? 's' : ''}, tous métiers confondus.</div>`;
  }

  async function loadJobs() {
    const q = document.getElementById('searchInput').value.trim();
    const loc = document.getElementById('locationInput').value.trim();
    document.getElementById('jobsList').innerHTML = `<div style="display:flex;flex-direction:column;gap:10px">${[1,2,3,4,5].map(() => `<div class="jb-skel"><div class="sk-row"><div class="skeleton sk-logo"></div><div style="flex:1;display:flex;flex-direction:column;gap:8px"><div class="skeleton sk-title" style="width:65%"></div><div class="skeleton sk-sub" style="width:42%"></div></div></div><div class="sk-badges"><div class="skeleton sk-badge"></div><div class="skeleton sk-badge"></div></div><div class="skeleton sk-desc" style="width:100%"></div></div>`).join('')}</div>`;
    document.getElementById('searchStats').textContent = 'Recherche en cours...';
    try {
      const params = new URLSearchParams({ q, page: currentPage });
      if (currentType !== 'tous') params.set('type', currentType);
      if (loc) params.set('location', loc);
      const remoteEl = document.getElementById('rem1');
      if (remoteEl?.checked || document.getElementById('remoteToggle')?.dataset.remote === '1') params.set('remote', 'true');
      const res = await fetch(`/api/jobs?${params}`, { credentials: 'include' });
      const data = await res.json();
      const isDemo = data.demo !== false;
      document.getElementById('demoNotice').style.display = isDemo ? 'flex' : 'none';
      document.getElementById('liveBadge').style.display = isDemo ? 'none' : 'inline-flex';
      document.getElementById('demoBadge').style.display = isDemo ? 'inline-flex' : 'none';
      const total = data.total || 0;
      const abandonne = data.filtre === 'abandonne';
      // Sous repli, « ${total} offres pour "${q}" » serait faux : aucune de ces
      // offres ne correspond à `q`. On annonce ce que la liste est vraiment.
      const label = abandonne ? 'publiées, tous métiers confondus'
        : q ? `pour "${q}"` : currentType !== 'tous' ? `en ${currentType}` : 'disponibles';
      // q et loc viennent de l'URL (?q=) : sans esc(), /jobs?q=<img onerror=…>
      // exécutait du script dans la page.
      document.getElementById('searchStats').innerHTML = abandonne
        ? `<strong>0</strong> offre pour "${esc(q || loc)}" · ${total.toLocaleString('fr-FR')} offres ${esc(label)}`
        : `<strong>${total.toLocaleString('fr-FR')}</strong> offres ${esc(label)}`;
      document.getElementById('resultCount').innerHTML = `<strong style="color:var(--ink)">${total.toLocaleString('fr-FR')}</strong> offres${couvertureContrat(data.couvertureContrat)}`;
      if (!data.jobs?.length) {
        document.getElementById('jobsList').innerHTML = `<div class="jb-empty"><div style="font-size:44px;margin-bottom:14px">🔍</div><h3>Aucune offre trouvée</h3><p>Essayez d'autres mots-clés ou un autre type de contrat.</p><button data-on-click="resetFilters" class="emp-btn emp-btn-primary" style="font-size:12px;padding:8px 18px">Voir toutes les offres</button></div>`;
        document.getElementById('pagination').innerHTML = ''; return;
      }
      const salaryFilter = document.getElementById('filterSalaire')?.value || '';
      let filteredJobs = data.jobs;
      if (salaryFilter) { const [minS, maxS] = salaryFilter.split('-'); const minK = minS ? parseInt(minS)*1000 : 0; const maxK = maxS ? parseInt(maxS)*1000 : Infinity; filteredJobs = data.jobs.filter(j => { const s = j.salary_min || j.salary_max; if (!s) return true; return s >= minK && s <= maxK; }); }
      allJobs = filteredJobs;
      document.getElementById('jobsList').innerHTML = avisPertinence(data, q, loc) + filteredJobs.map(renderJob).join('');
      renderPagination(filteredJobs.length, salaryFilter ? filteredJobs.length : total);
      requestAnimationFrame(() => autoScoreAllJobs(filteredJobs));
    } catch(e) {
      document.getElementById('jobsList').innerHTML = `<div class="jb-empty"><div style="font-size:44px;margin-bottom:14px">⚠️</div><h3>Erreur de chargement</h3><p>Impossible de charger les offres. Vérifiez votre connexion.</p><button data-on-click="loadJobs" class="emp-btn emp-btn-primary" style="font-size:12px;padding:8px 18px">Réessayer</button></div>`;
    }
  }

  function renderPagination(count, total) {
    const totalPages = Math.ceil(total / 10);
    if (totalPages <= 1) { document.getElementById('pagination').innerHTML = ''; return; }
    const pages = [];
    for (let i = Math.max(0, currentPage-2); i <= Math.min(totalPages-1, currentPage+2); i++) pages.push(i);
    document.getElementById('pagination').innerHTML = `<button class="jb-page-btn" data-on-click="goPage_JSON_parse_this_getAttr_05cd" data-arg-fbaa-0="${esc(JSON.stringify(currentPage-1))}" ${currentPage===0?'disabled':''}>←</button>${pages.map(p => `<button class="jb-page-btn ${p===currentPage?'active':''}" data-on-click="goPage_JSON_parse_this_getAttr_87e9" data-arg-8754-0="${esc(JSON.stringify(p))}">${p+1}</button>`).join('')}<button class="jb-page-btn" data-on-click="goPage_JSON_parse_this_getAttr_3815" data-arg-f69c-0="${esc(JSON.stringify(currentPage+1))}" ${currentPage>=totalPages-1?'disabled':''}>→</button>`;
  }
  function goPage(p) { currentPage = p; loadJobs(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function genCV(jobId) { const _j = allJobs.find(j => String(j.id) === String(jobId)); sessionStorage.setItem('emp_prefill', JSON.stringify({ title: _j?.title || '', company: _j?.company || '', desc: (_j?.description || '').slice(0, 200) })); empToast('Redirection vers le générateur...', 'success'); setTimeout(() => window.location.href = '/app', 800); }

  async function toggleSave(id, btn) {
    if (saved.has(id)) { saved.delete(id); btn.textContent = '☆'; btn.classList.remove('saved'); localStorage.setItem('emploia_saved_jobs', JSON.stringify([...saved])); empToast('Offre retirée des favoris', 'info'); fetch('/api/saved-jobs?id=' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' }).catch(() => {}); }
    else { saved.add(id); btn.textContent = '⭐'; btn.classList.add('saved'); localStorage.setItem('emploia_saved_jobs', JSON.stringify([...saved])); empToast('Offre sauvegardée !', 'success'); const job = allJobs?.find(j => String(j.id) === String(id)) || { id }; fetch('/api/saved-jobs', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: String(id), title: job.title || id, company: job.company || '', location: job.location || '', type: job.type || '', salary: job.salary || null, url: job.url || null, source: job.source || '' }) }).catch(() => {}); }
  }

  async function trackJob(id, btn) {
    if (tracked.has(id)) { empToast('Déjà dans votre dashboard', 'info'); return; }
    const _j = allJobs.find(j => String(j.id) === String(id));
    const jobTitle = _j?.title || '', company = _j?.company || '', url = _j?.url || '', location = _j?.location || '';
    btn.disabled = true;
    try {
      const res = await fetch('/api/applications', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobTitle, company, url, location, status: 'wishlist' }) });
      if (res.ok) { tracked.add(id); localStorage.setItem('emploia_tracked_jobs', JSON.stringify([...tracked])); btn.textContent = '✅ Suivi'; btn.classList.add('tracked'); empToast('Ajouté au dashboard !', 'success'); }
      else if (res.status === 401) { btn.disabled = false; empShowAuth('login'); }
      else { empToast('Erreur', 'error'); btn.disabled = false; }
    } catch { empToast('Erreur réseau', 'error'); btn.disabled = false; }
  }

  function resetFilters() {
    document.querySelectorAll('.jb-sidebar input[type="checkbox"]').forEach(i => i.checked = false);
    document.getElementById('filterSalaire').value = ''; document.getElementById('filterSecteur').value = '';
    document.getElementById('searchInput').value = ''; document.getElementById('locationInput').value = '';
    currentType = 'tous'; document.querySelectorAll('.jb-type-chip').forEach(b => b.classList.remove('active'));
    document.querySelector('.jb-type-chip[data-type="tous"]').classList.add('active'); loadJobs();
  }
  function toggleMobileFilters() { document.getElementById('filtersSidebar').classList.toggle('open'); }

  document.addEventListener('DOMContentLoaded', () => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('q')) document.getElementById('searchInput').value = p.get('q');
    if (p.get('location')) document.getElementById('locationInput').value = p.get('location');
    const typeParam = (p.get('type') || '').replace(/[^a-z0-9-]/gi, '');
    if (typeParam && typeParam !== 'tous') { const btn = document.querySelector(`.jb-type-chip[data-type="${typeParam}"]`); if (btn) setType(btn); }
    document.getElementById('searchInput').addEventListener('keydown', e => { if(e.key==='Enter') doSearch(); });
    document.getElementById('locationInput').addEventListener('keydown', e => { if(e.key==='Enter') doSearch(); });
    renderRecentSearches();
    loadJobs();
    // Show alert panel when user is logged in
    window.addEventListener('empUserLoaded', () => {
      if (window.empUser) document.getElementById('alertPanel').style.display = 'block';
    });
    if (window.empUser) document.getElementById('alertPanel').style.display = 'block';
  });

  async function createJobAlert(frequency, btn) {
    if (!window.empUser) { empShowAuth('login'); return; }
    const q = document.getElementById('searchInput').value.trim();
    const location = document.getElementById('locationInput').value.trim();
    const type = currentType !== 'tous' ? currentType : '';
    if (!q && !location && !type) { empToast('Précisez un poste ou une ville pour créer une alerte', 'info'); return; }
    btn.disabled = true; btn.textContent = '⏳';
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: q, location, type, frequency }),
      });
      if (res.ok) {
        empToast(`Alerte ${frequency === 'daily' ? 'quotidienne' : 'hebdomadaire'} créée !`, 'success');
        btn.textContent = '✅ Créée';
      } else if (res.status === 401) {
        empShowAuth('login');
        btn.disabled = false; btn.textContent = frequency === 'daily' ? 'Quotidien' : 'Hebdo';
      } else {
        const d = await res.json().catch(() => ({}));
        empToast(d.error || 'Erreur', 'error');
        btn.disabled = false; btn.textContent = frequency === 'daily' ? 'Quotidien' : 'Hebdo';
      }
    } catch {
      empToast('Erreur réseau', 'error');
      btn.disabled = false; btn.textContent = frequency === 'daily' ? 'Quotidien' : 'Hebdo';
    }
  }

  document.addEventListener('keydown', e => { if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) { e.preventDefault(); document.getElementById('searchInput')?.focus(); } if (e.key === 'Escape') closeApplyDrawer(); });

  // ── SMART APPLY DRAWER ─────────────────────────────────────────────────
  let currentDrawerJob = null, applyData = null, copilotContextAdded = false;
  function openApplyDrawer(jobId) {
    const job = allJobs.find(j => String(j.id) === String(jobId)); if (!job) return;
    currentDrawerJob = job; applyData = null; copilotContextAdded = false;
    document.getElementById('drawerTitle').textContent = job.title;
    document.getElementById('drawerCompany').textContent = [job.company, job.location].filter(Boolean).join(' · ');
    const link = document.getElementById('drawerJobLink'); const safeUrl = (job.url && /^https?:\/\//i.test(job.url)) ? job.url : '#'; link.href = safeUrl; link.style.opacity = job.url ? '' : '.4';
    document.getElementById('drawerApplyLink').href = safeUrl;
    const trackBtn = document.getElementById('drawerTrackBtn'); const isTracked = tracked.has(String(jobId)); trackBtn.textContent = isTracked ? '✅ Suivi' : 'Dashboard'; if (isTracked) trackBtn.classList.add('tracked'); else trackBtn.classList.remove('tracked');
    document.getElementById('drawerGenSection').style.display = 'block'; document.getElementById('drawerResults').style.display = 'none';
    const btn = document.getElementById('drawerGenBtn'); btn.disabled = false; btn.textContent = 'Générer mon pack candidature';
    const pillEl = document.getElementById('drawerScorePill'); const verdictEl = document.getElementById('drawerScoreVerdict'); const cached = scoreCache[String(job.id)];
    if (cached) { pillEl.textContent = `✨ ${cached.score}%`; verdictEl.textContent = cached.verdict || ''; } else { pillEl.textContent = '⏳'; verdictEl.textContent = ''; analyzeScore(String(job.id), pillEl).then(() => { const c = scoreCache[String(job.id)]; if (c) verdictEl.textContent = c.verdict || ''; }); }
    document.getElementById('applyDrawer').classList.add('open'); document.getElementById('applyOverlay').classList.add('open'); document.body.style.overflow = 'hidden';
  }
  function closeApplyDrawer() { document.getElementById('applyDrawer').classList.remove('open'); document.getElementById('applyOverlay').classList.remove('open'); document.body.style.overflow = ''; }
  async function generateSmartApply() {
    if (!currentDrawerJob) return; const btn = document.getElementById('drawerGenBtn'); btn.disabled = true; btn.textContent = 'Génération en cours...';
    const userProfile = localStorage.getItem('emploia_profile_text') || '';
    try {
      const res = await fetch('/api/smart-apply', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobTitle: currentDrawerJob.title, company: currentDrawerJob.company || '', jobDescription: (currentDrawerJob.description || '').slice(0, 4000), userProfile }) });
      if (res.status === 401) { empShowAuth('login'); btn.disabled = false; btn.textContent = 'Générer mon pack candidature'; return; }
      if (res.status === 403) { empToast('Fonctionnalité réservée aux abonnés Pro', 'error'); btn.disabled = false; btn.textContent = 'Générer mon pack candidature'; return; }
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Erreur'); }
      applyData = await res.json(); renderApplyResults(applyData);
      document.getElementById('drawerGenSection').style.display = 'none'; document.getElementById('drawerResults').style.display = 'block';
      empToast('Pack candidature généré !', 'success');
    } catch (e) { empToast(e.message || 'Erreur de génération. Réessayez.', 'error'); btn.disabled = false; btn.textContent = 'Générer mon pack candidature'; }
  }
  function renderApplyResults(data) {
    document.getElementById('drawerLetter').textContent = data.coverLetter || ''; document.getElementById('drawerPitch').textContent = data.pitch || '';
    document.getElementById('drawerBullets').innerHTML = (data.cvBullets || []).map(b => `<div style="display:flex;align-items:flex-start;gap:8px;background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--r-lg);padding:10px 12px"><span style="color:var(--primary);font-size:14px;flex-shrink:0;line-height:1.4">▸</span><div style="font-size:12.5px;color:var(--slate);line-height:1.6">${esc(b)}</div></div>`).join('');
    document.getElementById('drawerSkills').innerHTML = (data.skills || []).map(s => `<span style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:var(--r-full);background:var(--tint-lavender);color:var(--primary);border:1px solid var(--brand-purple-300)">${esc(s)}</span>`).join('');
    document.getElementById('drawerQuestions').innerHTML = (data.questions || []).map((q, i) => `<div style="background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--r-lg);padding:13px"><div style="font-size:12px;font-weight:600;color:var(--ink);margin-bottom:8px;line-height:1.4">${i+1}. ${esc(q.q)}</div><div style="font-size:12px;color:var(--slate);line-height:1.65">${esc(q.a)}</div></div>`).join('');
    setApplyTab('letter', document.querySelector('.jb-apply-tab[data-tab="letter"]'));
  }
  function setApplyTab(tab, btn) { document.querySelectorAll('.jb-apply-tab').forEach(b => b.classList.remove('active')); btn.classList.add('active'); document.getElementById('applyTabLetter').style.display = tab==='letter'?'block':'none'; document.getElementById('applyTabCv').style.display = tab==='cv'?'block':'none'; document.getElementById('applyTabInterview').style.display = tab==='interview'?'block':'none'; }
  function copyApplyText(type) { if (!applyData) return; const texts = { coverLetter: applyData.coverLetter||'', cvBullets: (applyData.cvBullets||[]).map(b=>'▸ '+b).join('\n'), questions: (applyData.questions||[]).map(q=>`Q: ${q.q}\nR: ${q.a}`).join('\n\n') }; const text = texts[type]||''; if (!text) return; navigator.clipboard.writeText(text).then(()=>empToast('Copié !','success')).catch(()=>empToast('Erreur de copie','error')); }
  async function addToTrackerDrawer() { if (!currentDrawerJob) return; await trackJob(String(currentDrawerJob.id), document.getElementById('drawerTrackBtn')); }

  // ── CO-PILOT ───────────────────────────────────────────────────────────
  let copilotHistory = [], copilotOpen = false;
  function toggleCopilot() { copilotOpen = !copilotOpen; document.getElementById('copilotPanel').classList.toggle('open', copilotOpen); if (copilotOpen) document.getElementById('copilotInput').focus(); }
  function appendCopilotMsg(role, text) { const msgs = document.getElementById('copilotMessages'); const el = document.createElement('div'); el.className = `cop-msg ${role}`; el.textContent = text; msgs.appendChild(el); msgs.scrollTop = msgs.scrollHeight; return el; }
  async function sendCopilotMessage() {
    const input = document.getElementById('copilotInput'); const msg = input.value.trim(); if (!msg) return;
    input.value = ''; input.disabled = true;
    let userMsg = msg;
    if (!copilotContextAdded && currentDrawerJob) { userMsg = `[Offre: "${currentDrawerJob.title}" chez ${currentDrawerJob.company||'entreprise'}]\n\n${msg}`; copilotContextAdded = true; }
    copilotHistory.push({ role: 'user', content: userMsg }); appendCopilotMsg('user', msg); const assistantEl = appendCopilotMsg('assistant', '...');
    try {
      const res = await fetch('/api/chat', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: copilotHistory }) });
      if (!res.ok) throw new Error();
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = '', fullText = ''; assistantEl.textContent = '';
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop()||''; for (const line of lines) { if (!line.startsWith('data: ')) continue; try { const d = JSON.parse(line.slice(6)); if (d.chunk) { fullText += d.chunk; assistantEl.textContent = fullText; } } catch {} } document.getElementById('copilotMessages').scrollTop = document.getElementById('copilotMessages').scrollHeight; }
      copilotHistory.push({ role: 'assistant', content: fullText });
    } catch { assistantEl.textContent = '⚠️ Erreur. Réessaie.'; }
    input.disabled = false; input.focus();
  }

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["addToTrackerDrawer"] = function (event) {
  addToTrackerDrawer()
};
EMP_H["analyzeScore_this_dataset_jobI_371f"] = function (event) {
  analyzeScore(this.dataset.jobId,this)
};
EMP_H["applyRecentSearch_JSON_parse_t_3657"] = function (event) {
  applyRecentSearch(JSON.parse(this.getAttribute("data-arg-95ff-0")))
};
EMP_H["closeApplyDrawer"] = function (event) {
  closeApplyDrawer()
};
EMP_H["copyApplyText_coverLetter_f08c"] = function (event) {
  copyApplyText('coverLetter')
};
EMP_H["copyApplyText_cvBullets_669d"] = function (event) {
  copyApplyText('cvBullets')
};
EMP_H["createJobAlert_daily_this_0712"] = function (event) {
  createJobAlert('daily',this)
};
EMP_H["createJobAlert_weekly_this_f27b"] = function (event) {
  createJobAlert('weekly',this)
};
EMP_H["doSearch"] = function (event) {
  doSearch()
};
EMP_H["genCV_this_getAttribute_data_a_e77a"] = function (event) {
  genCV(this.getAttribute("data-arg-3533-0"))
};
EMP_H["generateSmartApply"] = function (event) {
  generateSmartApply()
};
EMP_H["goPage_JSON_parse_this_getAttr_05cd"] = function (event) {
  goPage(JSON.parse(this.getAttribute("data-arg-fbaa-0")))
};
EMP_H["goPage_JSON_parse_this_getAttr_3815"] = function (event) {
  goPage(JSON.parse(this.getAttribute("data-arg-f69c-0")))
};
EMP_H["goPage_JSON_parse_this_getAttr_87e9"] = function (event) {
  goPage(JSON.parse(this.getAttribute("data-arg-8754-0")))
};
EMP_H["if_event_key_Enter_sendCopilot_30fd"] = function (event) {
  if(event.key==='Enter')sendCopilotMessage()
};
EMP_H["loadJobs"] = function (event) {
  loadJobs()
};
EMP_H["openApplyDrawer_this_getAttrib_d0be"] = function (event) {
  openApplyDrawer(this.getAttribute("data-arg-b3d1-0"))
};
EMP_H["resetFilters"] = function (event) {
  resetFilters()
};
EMP_H["sendCopilotMessage"] = function (event) {
  sendCopilotMessage()
};
EMP_H["setApplyTab_cv_this_a8f8"] = function (event) {
  setApplyTab('cv',this)
};
EMP_H["setApplyTab_interview_this_9170"] = function (event) {
  setApplyTab('interview',this)
};
EMP_H["setApplyTab_letter_this_2237"] = function (event) {
  setApplyTab('letter',this)
};
EMP_H["setType_this_cd6e"] = function (event) {
  setType(this)
};
EMP_H["this_parentNode_textContent_215d"] = function (event) {
  this.parentNode.textContent='🏢'
};
EMP_H["toggleCopilot"] = function (event) {
  toggleCopilot()
};
EMP_H["toggleMobileFilters"] = function (event) {
  toggleMobileFilters()
};
EMP_H["toggleRemote_this_c7d1"] = function (event) {
  toggleRemote(this)
};
EMP_H["toggleSave_this_getAttribute_d_87b7"] = function (event) {
  toggleSave(this.getAttribute("data-arg-0541-0"),this)
};
EMP_H["trackJob_this_getAttribute_dat_5d96"] = function (event) {
  trackJob(this.getAttribute("data-arg-6b07-0"),this)
};
