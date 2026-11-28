  const QUEUE_KEY = 'emploia_apply_queue';
  let queue = [];
  let isPreparing = false;

  function loadQueue() {
    try { queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { queue = []; }
    renderQueue();
  }

  function saveQueue() {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }

  function renderQueue() {
    const total = queue.length;
    const ready = queue.filter(j => j.status === 'ready').length;
    const applied = queue.filter(j => j.status === 'applied').length;
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statReady').textContent = ready;
    document.getElementById('statApplied').textContent = applied;

    const empty = document.getElementById('emptyState');
    const list = document.getElementById('queueList');

    if (!total) {
      empty.style.display = '';
      list.innerHTML = '';
      return;
    }
    empty.style.display = 'none';
    list.innerHTML = queue.map(renderQCard).join('');
  }

  function renderQCard(job) {
    const statusLabels = { queued: 'En attente', generating: 'Génération…', ready: 'Prêt', applied: 'Envoyé', error: 'Erreur' };
    const sid = esc(job.id);
    const letterPreview = job.letter
      ? `<div class="qcard-letter" id="letter-${sid}" data-on-click="toggleLetter_this_getAttribute_a2b8" data-arg-3cc0-0="${esc(sid)}">${esc(job.letter.slice(0, 600))}</div>`
      : '';
    const skillPills = (job.skills || []).slice(0, 5).map(s => `<span class="qcard-pill">${esc(s)}</span>`).join('');
    const atsPills = (job.atsKeywords || []).slice(0, 6).map(k => `<span class="qcard-keyword">${esc(k)}</span>`).join('');
    const emailSubjectLine = job.emailSubject
      ? `<div style="margin-bottom:12px"><p class="qcard-section-label">Objet email suggéré</p><div style="background:var(--s3);border:1px solid var(--brd);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--t1);font-weight:600">${esc(job.emailSubject)}</div></div>`
      : '';
    const questionsSection = (job.questions || []).length
      ? `<div class="qcard-questions"><p class="qcard-section-label">Questions d'entretien probables</p>${(job.questions).slice(0, 3).map(q => `<div class="qcard-q"><div class="qcard-q-text">❓ ${esc(q.q)}</div><div class="qcard-q-answer">${esc(q.a)}</div></div>`).join('')}</div>`
      : '';

    const canGenerate = job.status === 'queued' || job.status === 'error';
    const canApply = job.status === 'ready';
    const isApplied = job.status === 'applied';

    return `<div class="qcard status-${job.status}" id="qcard-${sid}">
      <div class="qcard-top">
        <div class="qcard-logo">🏢</div>
        <div class="qcard-info">
          <div class="qcard-title">${esc(job.title)}</div>
          <div class="qcard-company">${esc(job.company)}${job.location ? ' · ' + esc(job.location) : ''}</div>
        </div>
        <span class="status-badge ${job.status}">${statusLabels[job.status] || job.status}</span>
      </div>
      ${letterPreview}
      ${skillPills ? `<div class="qcard-pills">${skillPills}</div>` : ''}
      ${atsPills ? `<div style="margin-bottom:12px"><p class="qcard-section-label">Mots-clés ATS</p><div class="qcard-keywords">${atsPills}</div></div>` : ''}
      ${emailSubjectLine}
      ${questionsSection}
      <div class="qcard-actions">
        ${canApply ? `<button class="btn-qapply" data-on-click="applyJob_this_getAttribute_dat_f04b" data-arg-2b62-0="${esc(sid)}">🚀 Postuler maintenant</button>` : ''}
        ${canApply ? `<button class="btn-qcopy" data-on-click="copyLetter_this_getAttribute_d_295c" data-arg-3fbf-0="${esc(sid)}">📋 Copier la lettre</button>` : ''}
        ${canApply && job.emailSubject ? `<button class="btn-qcopy" data-on-click="copyEmailSubject_this_getAttri_89ba" data-arg-1de3-0="${esc(sid)}">✉️ Copier l'objet</button>` : ''}
        ${canGenerate ? `<button class="btn-qcopy" data-on-click="prepareSingle_this_getAttribut_52f7" data-arg-e484-0="${esc(sid)}">✨ Préparer</button>` : ''}
        ${isApplied ? `<span style="font-size:13px;color:#22c55e;font-weight:600;">✅ Candidature envoyée</span>` : ''}
        ${!isApplied ? `<button class="btn-qmark" data-on-click="markApplied_this_getAttribute_4b59" data-arg-4357-0="${esc(sid)}">✓ Marquer envoyé</button>` : ''}
        <button class="btn-qremove" data-on-click="removeJob_this_getAttribute_da_e929" data-arg-321a-0="${esc(sid)}">✕</button>
      </div>
    </div>`;
  }

  function toggleLetter(id) {
    const el = document.getElementById('letter-' + id);
    if (el) el.classList.toggle('expanded');
  }

  async function prepareSingle(id) {
    const job = queue.find(j => j.id === id);
    if (!job) return;
    const profile = localStorage.getItem('emploia_profile_text') || '';
    job.status = 'generating';
    saveQueue(); renderQueue();

    try {
      const res = await fetch('/api/smart-apply', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: job.title,
          company: job.company,
          jobDescription: job.description || '',
          userProfile: profile,
        }),
      });
      if (res.status === 401) { empShowAuth('login'); return; }
      if (!res.ok) { const e = new Error('API error'); e.status = res.status; throw e; }
      const data = await res.json();
      job.letter = data.coverLetter || '';
      job.cvBullets = data.cvBullets || [];
      job.skills = data.skills || [];
      job.pitch = data.pitch || '';
      job.questions = data.questions || [];
      job.atsKeywords = data.atsKeywords || [];
      job.emailSubject = data.emailSubject || '';
      job.status = 'ready';
      job.preparedAt = Date.now();
    } catch (err) {
      job.status = 'error';
      const msg = err?.status === 429
        ? `Limite atteinte pour "${job.title}" — réessayez dans 1h`
        : `Erreur pour "${job.title}" — réessayez`;
      empToast(msg, 'error');
    }
    saveQueue(); renderQueue();
  }

  async function prepareAll() {
    if (isPreparing) return;
    const pending = queue.filter(j => j.status === 'queued' || j.status === 'error');
    if (!pending.length) { empToast('Tous les jobs sont déjà prêts !', 'info'); return; }

    isPreparing = true;
    const btn = document.getElementById('prepareAllBtn');
    btn.disabled = true; btn.textContent = '⏳ Préparation…';

    const progressWrap = document.getElementById('progressWrap');
    const progressFill = document.getElementById('progressFill');
    const progressLabel = document.getElementById('progressLabel');
    progressWrap.classList.add('active');

    const profile = localStorage.getItem('emploia_profile_text') || '';
    let done = 0;

    for (const job of pending) {
      progressLabel.textContent = `Préparation "${job.title}" (${done + 1}/${pending.length})…`;
      progressFill.style.width = `${(done / pending.length) * 100}%`;
      await prepareSingle(job.id);
      done++;
      await new Promise(r => setTimeout(r, 600));
    }

    progressFill.style.width = '100%';
    progressLabel.textContent = `✅ ${done} candidature${done > 1 ? 's' : ''} préparée${done > 1 ? 's' : ''} !`;
    setTimeout(() => progressWrap.classList.remove('active'), 3000);
    empToast(`${done} pack${done > 1 ? 's' : ''} candidature généré${done > 1 ? 's' : ''} !`, 'success');

    isPreparing = false;
    btn.disabled = false; btn.textContent = '✨ Préparer tout';
  }

  function copyLetter(id) {
    const job = queue.find(j => j.id === id);
    if (!job?.letter) { empToast('Aucune lettre à copier', 'error'); return; }
    navigator.clipboard.writeText(job.letter).then(() => empToast('Lettre copiée !', 'success')).catch(() => empToast('Copie impossible', 'error'));
  }

  function copyEmailSubject(id) {
    const job = queue.find(j => j.id === id);
    if (!job?.emailSubject) { empToast('Aucun objet disponible', 'error'); return; }
    navigator.clipboard.writeText(job.emailSubject).then(() => empToast('Objet email copié !', 'success')).catch(() => empToast('Copie impossible', 'error'));
  }

  function applyJob(id) {
    const job = queue.find(j => j.id === id);
    if (!job) return;
    if (job.letter) {
      navigator.clipboard.writeText(job.letter).catch(() => {});
      empToast('Lettre copiée ! Collez-la dans le formulaire.', 'success');
    }
    if (job.url && /^https?:\/\//i.test(job.url)) {
      setTimeout(() => window.open(job.url, '_blank'), 400);
    } else {
      empToast('Pas d\'URL pour cette offre', 'error');
    }
    setTimeout(() => markApplied(id), 1200);
  }

  async function markApplied(id) {
    const job = queue.find(j => j.id === id);
    if (!job) return;
    job.status = 'applied';
    job.appliedAt = Date.now();
    saveQueue(); renderQueue();
    empToast('Candidature marquée comme envoyée ✓', 'success');

    // Sync to server-side applications tracker (dashboard reads from API)
    try {
      await fetch('/api/applications', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: job.title,
          company: job.company,
          location: job.location || '',
          url: job.url || '',
          status: 'applied',
          notes: job.pitch ? `Pitch : ${job.pitch}` : '',
        }),
      });
    } catch { /* silently ignore — localStorage already updated */ }
  }

  function removeJob(id) {
    queue = queue.filter(j => j.id !== id);
    saveQueue(); renderQueue();
    empToast('Retiré de la file', 'info');
  }

  function clearApplied() {
    const before = queue.length;
    queue = queue.filter(j => j.status !== 'applied');
    saveQueue(); renderQueue();
    const removed = before - queue.length;
    empToast(removed ? `${removed} entrée${removed > 1 ? 's' : ''} supprimée${removed > 1 ? 's' : ''}` : 'Rien à nettoyer', 'info');
  }

  // Auth check — smart-apply requires a logged-in account
  async function initPage() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) { window.location.href = '/app'; return; }
      const data = await res.json();
      const user = data.user || data;
      if (user.plan === 'free') {
        document.getElementById('queueContainer').innerHTML = `
          <div class="queue-empty">
            <div class="empty-icon">⭐</div>
            <h3>Fonctionnalité Pro</h3>
            <p>La file de candidatures automatisée est réservée aux abonnés Pro et Intensif.</p>
            <a href="/#pricing" class="btn btn-primary">Passer à Pro →</a>
          </div>`;
      }
    } catch { window.location.href = '/app'; }
  }

  loadQueue();
  initPage();

  // Listen for storage changes (jobs page adds to queue)
  window.addEventListener('storage', e => {
    if (e.key === QUEUE_KEY) loadQueue();
  });

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["applyJob_this_getAttribute_dat_f04b"] = function (event) {
  applyJob(this.getAttribute("data-arg-2b62-0"))
};
EMP_H["clearApplied"] = function (event) {
  clearApplied()
};
EMP_H["copyEmailSubject_this_getAttri_89ba"] = function (event) {
  copyEmailSubject(this.getAttribute("data-arg-1de3-0"))
};
EMP_H["copyLetter_this_getAttribute_d_295c"] = function (event) {
  copyLetter(this.getAttribute("data-arg-3fbf-0"))
};
EMP_H["markApplied_this_getAttribute_4b59"] = function (event) {
  markApplied(this.getAttribute("data-arg-4357-0"))
};
EMP_H["prepareAll"] = function (event) {
  prepareAll()
};
EMP_H["prepareSingle_this_getAttribut_52f7"] = function (event) {
  prepareSingle(this.getAttribute("data-arg-e484-0"))
};
EMP_H["removeJob_this_getAttribute_da_e929"] = function (event) {
  removeJob(this.getAttribute("data-arg-321a-0"))
};
EMP_H["toggleLetter_this_getAttribute_a2b8"] = function (event) {
  toggleLetter(this.getAttribute("data-arg-3cc0-0"))
};
