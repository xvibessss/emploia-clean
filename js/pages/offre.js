  const JOB_TYPES = { full_time: 'CDI', part_time: 'Temps partiel', contract: 'CDD', internship: 'Stage', apprenticeship: 'Alternance', temporary: 'Intérim', freelance: 'Freelance' };

  function formatDate(d) {
    if (!d) return '—';
    const date = new Date(d);
    if (isNaN(date)) return '—';
    const diff = Math.floor((Date.now() - date) / 86400000);
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return "Hier";
    if (diff < 7) return `Il y a ${diff} jours`;
    if (diff < 30) return `Il y a ${Math.floor(diff/7)} sem.`;
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  }

  function formatSalary(min, max, currency) {
    if (!min && !max) return 'Non précisé';
    const fmt = (v) => new Intl.NumberFormat('fr-FR').format(Math.round(v));
    const cur = currency === 'EUR' ? '€' : (currency || '€');
    if (min && max) return `${fmt(min)}–${fmt(max)} ${cur}/an`;
    if (min) return `À partir de ${fmt(min)} ${cur}/an`;
    return `Jusqu'à ${fmt(max)} ${cur}/an`;
  }

  function renderOffer(job) {
    currentJob = job;
    document.title = `${job.title || 'Offre'} — ${job.company_name || job.company || ''} — Emploia`;

    document.getElementById('offreLogo').textContent = (job.company_logo || job.logo) ? '' : '🏢';
    if (job.company_logo || job.logo) {
      const img = document.createElement('img');
      img.src = job.company_logo || job.logo;
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:8px';
      img.onerror = () => { img.parentElement.textContent = '🏢'; };
      document.getElementById('offreLogo').appendChild(img);
    }

    document.getElementById('offreCompany').textContent = job.company_name || job.company || 'Entreprise';
    document.getElementById('offreLocation').textContent = job.location || '';
    document.getElementById('offreTitle').textContent = job.title || 'Offre d\'emploi';

    const tags = document.getElementById('offreTags');
    const addTag = (text, cls = '') => {
      const t = document.createElement('span');
      t.className = `offre-tag ${cls}`;
      t.textContent = text;
      tags.appendChild(t);
    };
    const jobType = job.job_type || job.type;
    if (jobType) addTag(JOB_TYPES[jobType] || jobType, 'type');
    if (job.location) addTag('📍 ' + job.location);
    if (job.remote) addTag('🌐 Remote');
    if (job.salary_min || job.salary_max) addTag('💰 ' + formatSalary(job.salary_min, job.salary_max, job.salary_currency));
    if (job.experience_level) addTag('🎓 ' + job.experience_level);

    const desc = job.description || 'Aucune description disponible pour cette offre.';
    const descEl = document.getElementById('offreDesc');
    // Simple text → HTML: preserve line breaks and basic structure
    descEl.innerHTML = desc
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\n\n+/g, '</p><p style="font-size:14px;color:var(--t2);line-height:1.8;margin-bottom:8px">')
      .replace(/\n/g, '<br/>');
    descEl.innerHTML = '<p style="font-size:14px;color:var(--t2);line-height:1.8;margin-bottom:8px">' + descEl.innerHTML + '</p>';

    document.getElementById('metaCompany').textContent = job.company_name || job.company || '—';
    document.getElementById('metaLocation').textContent = job.location || '—';
    document.getElementById('metaType').textContent = JOB_TYPES[job.job_type] || JOB_TYPES[job.type] || job.job_type || job.type || '—';
    document.getElementById('metaSalary').textContent = formatSalary(job.salary_min, job.salary_max, job.salary_currency);
    document.getElementById('metaDate').textContent = formatDate(job.created_at || job.date_posted || job.date);

    if (job.url && /^https?:\/\//i.test(job.url)) {
      document.getElementById('offreApplyBtn').href = job.url;
    } else {
      document.getElementById('offreApplyBtn').style.opacity = '.4';
      document.getElementById('offreApplyBtn').removeAttribute('href');
    }

    // Interview prep + negotiation links pre-fill
    const jobTitle = job.title || '';
    const jobCompany = job.company_name || job.company || '';
    const toolParams = new URLSearchParams();
    if (jobTitle) toolParams.set('job', jobTitle);
    if (jobCompany) toolParams.set('company', jobCompany);
    const toolQuery = toolParams.toString();
    document.getElementById('interviewPrepLink').href = `/tools?tab=questions${toolQuery ? '&' + toolQuery : ''}`;
    document.getElementById('negocLink').href = `/tools?tab=negociation${toolQuery ? '&' + toolQuery : ''}`;

    // ATS score after render
    setTimeout(computeATSScore, 400);
    // Load company insights (lazy)
    setTimeout(loadCompanyInsights, 800);
    // Init LinkedIn networking card
    initLinkedIn(job);

    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('offreLayout').style.display = 'grid';
  }

  async function loadOffer() {
    // Extract job ID from URL path: /offre/:id
    const pathParts = window.location.pathname.split('/');
    const jobId = pathParts[pathParts.length - 1];

    if (!jobId) {
      document.getElementById('loadingState').style.display = 'none';
      document.getElementById('errorState').style.display = 'block';
      return;
    }

    // Check sessionStorage cache (jobs page may have stored the job data)
    const cached = sessionStorage.getItem(`job_${jobId}`);
    if (cached) {
      try {
        renderOffer(JSON.parse(cached));
        return;
      } catch {}
    }

    try {
      const r = await fetch(`/api/jobs?id=${encodeURIComponent(jobId)}`);
      if (!r.ok) throw new Error('not found');
      const data = await r.json();
      const job = data.job || (Array.isArray(data.jobs) ? data.jobs.find(j => String(j.id) === String(jobId)) : null);
      if (!job) throw new Error('not found');
      renderOffer(job);
    } catch {
      document.getElementById('loadingState').style.display = 'none';
      document.getElementById('errorState').style.display = 'block';
    }
  }

  let currentJob = null;
  let saData = null;
  let saTab = 'letter';
  let insightsLoaded = false;

  // ── Smart Apply ───────────────────────────────────────────────────────────
  async function generateSA() {
    if (!currentJob) return;
    const btn = document.getElementById('saGenBtn');
    btn.disabled = true; btn.textContent = '⏳ Génération…';
    const profile = localStorage.getItem('emploia_profile_text') || '';
    try {
      const res = await fetch('/api/smart-apply', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: currentJob.title || '',
          company: currentJob.company_name || currentJob.company || '',
          jobDescription: (currentJob.description || '').slice(0, 2000),
          userProfile: profile,
        }),
      });
      if (!res.ok) {
        if (res.status === 401) { empShowAuth('login'); btn.disabled = false; btn.textContent = '✨ Regénérer'; return; }
        if (res.status === 403) { empToast('Fonctionnalité réservée aux abonnés Pro', 'error'); btn.disabled = false; btn.textContent = '✨ Regénérer'; return; }
        throw new Error();
      }
      saData = await res.json();
      renderSAResult();
      empToast('Pack candidature généré !', 'success');
    } catch {
      empToast('Erreur — réessayez', 'error');
    }
    btn.disabled = false; btn.textContent = '✨ Regénérer';
  }

  function renderSAResult() {
    if (!saData) return;
    document.getElementById('saResult').style.display = 'block';
    const emailEl = document.getElementById('saEmailSubject');
    const emailTxt = document.getElementById('saEmailSubjectText');
    if (saData.emailSubject) {
      emailTxt.textContent = saData.emailSubject;
      emailEl.style.display = 'block';
    }
    setSaTab('letter', document.querySelector('.sa-tab'));
    computeATSScore();
  }

  function setSaTab(tab, btn) {
    saTab = tab;
    document.querySelectorAll('.sa-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const content = document.getElementById('saContent');
    if (!saData) return;
    if (tab === 'letter') content.textContent = saData.coverLetter || '—';
    else if (tab === 'cv') content.textContent = (saData.cvBullets || []).map((b, i) => `${i+1}. ${b}`).join('\n');
    else if (tab === 'qa') content.textContent = (saData.questions || []).map(q => `Q: ${q.q}\nR: ${q.a}`).join('\n\n');
  }

  function copySA() {
    const txt = document.getElementById('saContent').textContent;
    navigator.clipboard.writeText(txt).then(() => empToast('Copié !', 'success'));
  }

  async function saveSAToVault() {
    if (!window.empUser) { empShowAuth('login'); return; }
    if (!saData) return;
    const job = currentJob;
    const jobLabel = job ? `${job.title || ''}${job.company ? ' — ' + job.company : ''}` : '';
    const name = `Smart Apply${jobLabel ? ' · ' + jobLabel.slice(0, 50) : ''} · ${new Date().toLocaleDateString('fr-FR')}`;
    const parts = [];
    if (saData.coverLetter) parts.push(`=== LETTRE DE MOTIVATION ===\n\n${saData.coverLetter}`);
    if (saData.cvBullets?.length) parts.push(`=== PUCES CV ===\n\n${saData.cvBullets.map(b => '▸ ' + b).join('\n')}`);
    if (saData.questions?.length) parts.push(`=== PRÉPARATION ENTRETIEN ===\n\n${saData.questions.map(q => `Q: ${q.q}\nR: ${q.a}`).join('\n\n')}`);
    const content = parts.join('\n\n');
    if (!content.trim()) return;
    const btn = document.getElementById('saVaultBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sauvegarde…'; }
    try {
      const res = await fetch('/api/cv-versions', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content, type: 'letter' }),
      });
      const d = await res.json();
      if (!res.ok) return empToast(d.error || 'Erreur', 'error');
      empToast('Sauvegardé dans vos documents !', 'success');
      if (btn) btn.textContent = '✅ Sauvegardé';
    } catch { empToast('Erreur réseau', 'error'); }
    finally { if (btn) btn.disabled = false; }
  }

  function applyWithSA() {
    if (saData?.coverLetter) navigator.clipboard.writeText(saData.coverLetter).catch(() => {});
    const applyUrl = currentJob?.url;
    if (applyUrl && /^https?:\/\//i.test(applyUrl)) { setTimeout(() => window.open(applyUrl, '_blank'), 300); }
    empToast('Lettre copiée — postulez !', 'success');
  }

  // ── ATS score (client-side keyword matching) ──────────────────────────────
  function computeATSScore() {
    const profile = (localStorage.getItem('emploia_profile_text') || '').toLowerCase();
    const desc = ((currentJob?.description || '') + ' ' + (currentJob?.title || '')).toLowerCase();
    if (!profile || !desc) return;

    const words = desc.match(/\b[a-záàéèêëîïôùûüç]{4,}\b/gi) || [];
    const freq = {};
    words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 20).map(e => e[0]);

    const matched = top.filter(k => profile.includes(k));
    const score = Math.round((matched.length / Math.max(top.length, 1)) * 100);

    const card = document.getElementById('atsScoreCard');
    card.style.display = 'block';
    const color = score >= 70 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#ef4444';
    document.getElementById('atsScoreVal').textContent = score + '%';
    document.getElementById('atsScoreVal').style.color = color;
    document.getElementById('atsScoreFill').style.width = score + '%';
    document.getElementById('atsScoreFill').style.background = color;

    const kw = document.getElementById('atsKeywords');
    kw.innerHTML = top.slice(0, 12).map(k =>
      `<span class="ats-kw-tag ${matched.includes(k) ? 'match' : 'miss'}">${matched.includes(k) ? '✓ ' : ''}${esc(k)}</span>`
    ).join('');

    // Save score snapshot for progression chart
    if (window.saveScoreSnapshot && currentJob) {
      const label = `${currentJob.title || ''} — ${currentJob.company_name || currentJob.company || ''}`;
      window.saveScoreSnapshot('ats', score, label);
    }
  }

  // ── LinkedIn Networking ───────────────────────────────────────────────────
  let liData = null;
  let liTab = 'direct';

  function initLinkedIn(job) {
    const company = job.company_name || job.company || '';
    const title = job.title || '';
    if (!company) return;
    const card = document.getElementById('linkedinCard');
    document.getElementById('liCompanyName').textContent = company;
    const query = `"${company}" (RH OR recruteur OR "talent acquisition" OR "${title.split(' ')[0]}")`;
    const liUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}&origin=GLOBAL_SEARCH_HEADER`;
    document.getElementById('liSearchLink').href = liUrl;
    card.style.display = 'block';
  }

  async function generateLinkedInMsg() {
    if (!currentJob) return;
    const btn = document.getElementById('liMsgBtn');
    btn.disabled = true; btn.textContent = '⏳ Génération…';
    const profile = (localStorage.getItem('emploia_profile_text') || '').slice(0, 400);
    try {
      const res = await fetch('/api/generate/linkedin-outreach', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: currentJob.company_name || currentJob.company || '',
          jobTitle: currentJob.title || '',
          senderName: window.empUser?.name || '',
          profile,
        }),
      });
      if (!res.ok) {
        if (res.status === 401) { empShowAuth('login'); btn.disabled = false; btn.textContent = '✉️ Regénérer'; return; }
        if (res.status === 402) { empShowUpgrade?.() || empToast('Limite gratuite atteinte — passez Pro', 'error'); btn.disabled = false; btn.textContent = '✉️ Regénérer'; return; }
        throw new Error();
      }
      liData = await res.json();
      document.getElementById('liResult').style.display = 'block';
      setLiTab('direct', document.querySelector('#liResult .sa-tab'));
      if (liData.tip) document.getElementById('liTip').textContent = '💡 ' + liData.tip;
    } catch {
      empToast('Erreur — réessayez', 'error');
    }
    btn.disabled = false; btn.textContent = '✉️ Regénérer';
  }

  function setLiTab(tab, btn) {
    liTab = tab;
    document.querySelectorAll('#liResult .sa-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (!liData) return;
    document.getElementById('liContent').textContent = liData[tab] || '—';
  }

  function copyLiMsg() {
    const txt = document.getElementById('liContent').textContent;
    navigator.clipboard.writeText(txt).then(() => empToast('Message copié !', 'success')).catch(() => empToast('Copie impossible', 'error'));
  }

  // ── Queue & Save ──────────────────────────────────────────────────────────
  function addToQueueOffre() {
    if (!currentJob) return;
    const queueKey = 'emploia_apply_queue';
    let queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
    const id = String(currentJob.id || currentJob.title);
    if (queue.some(q => q.id === id)) { window.location.href = '/apply-queue'; return; }
    queue.unshift({ id, title: currentJob.title, company: currentJob.company_name || currentJob.company || '', location: currentJob.location || '', url: currentJob.url || '', description: (currentJob.description || '').slice(0, 800), status: 'queued', addedAt: Date.now() });
    localStorage.setItem(queueKey, JSON.stringify(queue.slice(0, 50)));
    document.getElementById('saQueueBtn').textContent = '📬';
    document.getElementById('saQueueBtn').classList.add('queued');
    empToast('Ajouté à la file !', 'success');
  }

  function toggleSaveOffre() {
    if (!currentJob) return;
    const btn = document.getElementById('saSaveBtn');
    const saved = JSON.parse(localStorage.getItem('emploia_saved_jobs') || '[]');
    const id = String(currentJob.id);
    const idx = saved.indexOf(id);
    if (idx > -1) { saved.splice(idx, 1); btn.textContent = '☆'; btn.classList.remove('saved'); }
    else { saved.push(id); btn.textContent = '⭐'; btn.classList.add('saved'); }
    localStorage.setItem('emploia_saved_jobs', JSON.stringify(saved));
    empToast(idx > -1 ? 'Retiré des favoris' : 'Sauvegardé !', 'success');
  }

  // ── Company Insights ──────────────────────────────────────────────────────
  async function loadCompanyInsights() {
    if (insightsLoaded || !currentJob) return;
    const section = document.getElementById('insightsSection');
    section.style.display = 'block';
    section.querySelector('#insightsGrid').innerHTML = `<div class="ins-loading" style="grid-column:1/-1"><div class="spin"></div>Analyse de l'entreprise en cours…</div>`;

    try {
      const res = await fetch('/api/company-insights', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: currentJob.company_name || currentJob.company || '',
          jobTitle: currentJob.title || '',
          jobDescription: (currentJob.description || '').slice(0, 2000),
        }),
      });
      if (!res.ok) {
        if (res.status === 401) { empShowAuth?.('login'); document.getElementById('insightsSection').style.display = 'none'; return; }
        throw new Error();
      }
      const d = await res.json();
      insightsLoaded = true;

      // Culture badge
      const badge = document.getElementById('insightsCultureBadge');
      badge.textContent = d.cultureType || '';

      // Grid blocks
      document.getElementById('insightsGrid').innerHTML = `
        <div class="ins-block">
          <div class="ins-block-label">🎤 Process entretien</div>
          <div class="ins-block-val" style="font-size:12px;font-weight:400;color:var(--t2)">${esc(d.interviewProcess || '—')}</div>
        </div>
        <div class="ins-block">
          <div class="ins-block-label">💰 Fourchette salariale</div>
          <div class="ins-block-val">${esc(d.salaryContext || 'Non estimable')}</div>
        </div>`;

      const list = (el, items) => {
        if (!items?.length) return;
        document.getElementById(el).innerHTML = (items || []).map(i => `<li>${esc(i)}</li>`).join('');
      };
      list('insResearch', d.toResearch);
      list('insQuestions', d.questionsToAsk);
      list('insTalking', d.talkingPoints);

      if (d.redFlags?.length) {
        list('insRedFlags', d.redFlags);
        document.getElementById('insRedFlagsWrap').style.display = 'block';
      }
    } catch {
      document.getElementById('insightsSection').style.display = 'none';
    }
  }

  loadOffer();

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["addToQueueOffre"] = function (event) {
  addToQueueOffre()
};
EMP_H["applyWithSA"] = function (event) {
  applyWithSA()
};
EMP_H["copyLiMsg"] = function (event) {
  copyLiMsg()
};
EMP_H["copySA"] = function (event) {
  copySA()
};
EMP_H["generateLinkedInMsg"] = function (event) {
  generateLinkedInMsg()
};
EMP_H["generateSA"] = function (event) {
  generateSA()
};
EMP_H["saveSAToVault"] = function (event) {
  saveSAToVault()
};
EMP_H["setLiTab_direct_this_2772"] = function (event) {
  setLiTab('direct',this)
};
EMP_H["setLiTab_indirect_this_c59b"] = function (event) {
  setLiTab('indirect',this)
};
EMP_H["setSaTab_cv_this_763e"] = function (event) {
  setSaTab('cv',this)
};
EMP_H["setSaTab_letter_this_99fd"] = function (event) {
  setSaTab('letter',this)
};
EMP_H["setSaTab_qa_this_f246"] = function (event) {
  setSaTab('qa',this)
};
EMP_H["toggleSaveOffre"] = function (event) {
  toggleSaveOffre()
};
