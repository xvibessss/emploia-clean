  // Greeting
  const hr = new Date().getHours();
  document.getElementById('greetingText').textContent = hr < 12 ? 'Bonjour' : hr < 18 ? 'Bon après-midi' : 'Bonsoir';
  document.getElementById('greetingEmoji').textContent = hr < 12 ? '☀️' : hr < 18 ? '👋' : '🌙';

  // ── STATE ──────────────────────────────────────────────────────────────────
  let allApps = [];
  let activeTab = 'all';
  let editingId = null;
  let draggedId = null;

  const COLS = [
    { status: 'wishlist',  label: 'À postuler',  dotClass: 'dot-wishlist'  },
    { status: 'applied',   label: 'Envoyée',      dotClass: 'dot-applied'   },
    { status: 'interview', label: 'Entretien',    dotClass: 'dot-interview' },
    { status: 'offer',     label: 'Offre reçue',  dotClass: 'dot-offer'     },
    { status: 'rejected',  label: 'Refus',        dotClass: 'dot-rejected'  },
  ];
  const STATUS_LABEL  = Object.fromEntries(COLS.map(c => [c.status, c.label]));
  const STATUS_BADGE  = { wishlist:'badge-purple', applied:'badge-blue', interview:'badge-yellow', offer:'badge-green', rejected:'badge-gray' };

  // ── DATA LOADING ───────────────────────────────────────────────────────────
  async function loadApplications() {
    try {
      const res = await fetch('/api/applications', { credentials: 'include' });
      if (res.status === 401) {
        allApps = [];
        showAuthBanner();
      } else if (res.ok) {
        allApps = (await res.json()).applications || [];
        hideAuthBanner();
      } else { throw new Error(); }
    } catch { empToast('Erreur de chargement des candidatures', 'error'); allApps = []; }
    refresh();
  }

  function showAuthBanner() {
    let b = document.getElementById('dashAuthBanner');
    if (b) return;
    b = document.createElement('div');
    b.id = 'dashAuthBanner';
    b.style.cssText = 'background:linear-gradient(135deg,rgba(99,102,241,.1),rgba(59,130,246,.06));border:1px solid rgba(99,102,241,.25);border-radius:14px;padding:24px 28px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap';
    b.innerHTML = `
      <div>
        <div style="font-size:16px;font-weight:800;color:var(--t1);margin-bottom:4px">📊 Connectez-vous pour suivre vos candidatures</div>
        <div style="font-size:13px;color:var(--t2)">Sauvegardez votre Kanban, suivez vos offres et exportez en CSV — gratuitement.</div>
      </div>
      <div style="display:flex;gap:10px;flex-shrink:0">
        <button data-on-click="empShowAuth_register_cac5" style="padding:10px 20px;border-radius:10px;font-size:13px;font-weight:800;color:#fff;background:var(--grad-primary);border:none;cursor:pointer;font-family:'Sora',sans-serif;box-shadow:0 4px 14px rgba(99,102,241,.35)">S'inscrire gratuitement</button>
        <button data-on-click="empShowAuth_login_c158" style="padding:10px 20px;border-radius:10px;font-size:13px;font-weight:700;color:var(--t1);background:var(--s2);border:1.5px solid var(--brd);cursor:pointer;font-family:'Sora',sans-serif">Se connecter</button>
      </div>`;
    const kanbanEl = document.querySelector('.kb-board') || document.querySelector('.dash-main');
    if (kanbanEl) kanbanEl.parentNode.insertBefore(b, kanbanEl);
    else document.querySelector('.app-container')?.prepend(b);
    window.addEventListener('empAuthChange', e => {
      if (e.detail.user) { hideAuthBanner(); loadApplications(); }
    }, { once: true });
  }

  function hideAuthBanner() {
    document.getElementById('dashAuthBanner')?.remove();
  }

  function filteredApps() {
    return activeTab === 'all' ? allApps : allApps.filter(a => a.status === activeTab);
  }

  function refresh() {
    renderKanban(filteredApps());
    renderList(filteredApps());
    updateTabCounts(allApps);
    updateStatsUI(allApps);
    updateRecentActivity(allApps);
    updateOnboardingCard(allApps, window.empDashUser || null);
  }

  // ── KANBAN ─────────────────────────────────────────────────────────────────
  function renderKanban(apps) {
    COLS.forEach(col => {
      const body  = document.getElementById('kb-' + col.status);
      const count = document.getElementById('kc-' + col.status);
      const colApps = apps.filter(a => a.status === col.status);
      if (count) count.textContent = colApps.length;
      if (!body) return;
      body.innerHTML = colApps.map(renderCard).join('');
      const addBtn = document.createElement('button');
      addBtn.className = 'kc-add';
      addBtn.textContent = '+ Ajouter';
      addBtn.onclick = () => openAddModal(col.status);
      body.appendChild(addBtn);
    });
  }

  function renderCard(app) {
    const daysAgo = Math.floor((Date.now() - (app.updatedAt || app.createdAt)) / 86400000);
    const dateStr = daysAgo === 0 ? "Aujourd'hui" : daysAgo === 1 ? "Hier" : `Il y a ${daysAgo}j`;
    const extra = app.status === 'offer'     ? ' style="border-color:rgba(16,185,129,.25);background:rgba(16,185,129,.04)"'
                : app.status === 'interview'  ? ' style="border-color:rgba(245,158,11,.2)"'
                : app.status === 'rejected'   ? ' style="opacity:.65"' : '';
    const followedRecently = app.status === 'applied' && app.lastFollowUpAt && (Date.now() - app.lastFollowUpAt) < 7 * 86400000;
    const showRelance = app.status === 'applied' && daysAgo >= 7 && !followedRecently;
    const noteSnippet = app.notes ? `<div class="kcard-note">${esc(app.notes.slice(0, 80))}</div>` : '';

    // Interview countdown
    let ivCountdown = '';
    if (app.interviewDate) {
      const ivDays = Math.ceil((new Date(app.interviewDate) - Date.now()) / 86400000);
      if (ivDays === 0) ivCountdown = `<div style="font-size:10px;color:#f59e0b;font-weight:700;margin-bottom:4px">🎤 Entretien aujourd'hui !</div>`;
      else if (ivDays === 1) ivCountdown = `<div style="font-size:10px;color:#f59e0b;font-weight:700;margin-bottom:4px">🎤 Entretien demain</div>`;
      else if (ivDays > 0 && ivDays <= 7) ivCountdown = `<div style="font-size:10px;color:var(--ylb);margin-bottom:4px">🎤 Entretien dans ${ivDays}j</div>`;
    }

    return `<div class="kanban-card"${extra} draggable="true"
      data-on-dragstart="dragCard_event_this_getAttribu_02b4" data-arg-9029-0="${esc(app.id)}"
      data-on-click="openDetailModal_this_getAttrib_fa08" data-arg-b965-0="${esc(app.id)}">
      <div class="kcard-company">${esc(app.company || '—')}</div>
      <div class="kcard-title">${esc(app.jobTitle || 'Candidature')}</div>
      ${app.salary ? `<div style="font-size:10px;color:var(--gnb);margin:2px 0 4px">💰 ${esc(app.salary)}</div>` : ''}
      ${ivCountdown}
      ${noteSnippet}
      <div class="kcard-footer">
        <span class="kcard-date">${dateStr}</span>
        <div class="kcard-actions">
          <button class="kcard-btn" title="Modifier" data-on-click="event_stopPropagation_openDeta_79a6" data-arg-8bb2-0="${esc(app.id)}">✏️</button>
          <button class="kcard-btn" title="Supprimer" data-on-click="event_stopPropagation_deleteAp_b42e" data-arg-1293-0="${esc(app.id)}">🗑</button>
        </div>
      </div>
      ${showRelance ? `<button class="kcard-relance" data-on-click="event_stopPropagation_openRela_4af4" data-arg-4116-0="${esc(app.id)}">📧 Relancer (+${daysAgo}j)</button>` : ''}
      ${followedRecently ? `<div style="font-size:10px;color:var(--gnb);margin-top:6px;font-weight:600">✓ Relancé il y a ${Math.floor((Date.now() - app.lastFollowUpAt) / 86400000)}j</div>` : ''}
    </div>`;
  }

  // ── LIST ───────────────────────────────────────────────────────────────────
  function renderList(apps) {
    const el = document.getElementById('listView');
    if (!apps.length) {
      el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--t3);font-size:14px">
        Aucune candidature.<br><button class="btn btn-primary btn-sm" style="margin-top:12px" data-on-click="openAddModal">+ Ajouter ma première candidature</button></div>`;
      return;
    }
    el.innerHTML = apps.map(app => {
      const daysAgo = Math.floor((Date.now() - (app.updatedAt || app.createdAt)) / 86400000);
      const dateStr = daysAgo === 0 ? "Aujourd'hui" : daysAgo === 1 ? "Hier" : `Il y a ${daysAgo}j`;
      return `<div class="list-item">
        <div class="li-logo">🏢</div>
        <div class="li-info">
          <div class="li-title">${esc(app.jobTitle || 'Candidature')}</div>
          <div class="li-company">${esc(app.company || '—')}</div>
          <div class="li-meta">
            ${app.location ? `<div class="li-meta-item">📍 ${esc(app.location)}</div>` : ''}
            ${app.salary   ? `<div class="li-meta-item">💰 ${esc(app.salary)}</div>`   : ''}
            <div class="li-meta-item">📅 ${dateStr}</div>
          </div>
        </div>
        <span class="badge ${STATUS_BADGE[app.status] || 'badge-gray'}">${STATUS_LABEL[app.status] || app.status}</span>
        <div class="li-actions">
          ${app.url && /^https?:\/\//i.test(app.url) ? `<a href="${esc(app.url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">Voir l'offre →</a>` : ''}
          <button class="btn btn-primary btn-sm" data-on-click="openDetailModal_this_getAttrib_fa08" data-arg-b965-0="${esc(app.id)}">Modifier</button>
        </div>
      </div>`;
    }).join('');
  }

  // ── TABS & COUNTS ──────────────────────────────────────────────────────────
  function updateTabCounts(apps) {
    const counts = { all: apps.length };
    COLS.forEach(c => counts[c.status] = 0);
    apps.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });
    document.querySelectorAll('.dash-tab').forEach(btn => {
      const tab = btn.dataset.tab;
      if (tab !== undefined && counts[tab] !== undefined) {
        const el = btn.querySelector('.tab-count');
        if (el) el.textContent = counts[tab];
      }
    });
  }

  function setDashTab(tab, btn) {
    activeTab = tab;
    document.querySelectorAll('.dash-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    refresh();
  }

  // ── DRAG & DROP ────────────────────────────────────────────────────────────
  function dragCard(e, id) {
    draggedId = id;
    e.dataTransfer.effectAllowed = 'move';
  }
  function dropCard(e, status) {
    e.preventDefault();
    if (!draggedId) return;
    moveApp(draggedId, status);
    draggedId = null;
  }
  async function moveApp(id, newStatus) {
    const app = allApps.find(a => a.id === id);
    if (!app || app.status === newStatus) return;
    app.status = newStatus;
    app.updatedAt = Date.now();
    refresh();
    try {
      await fetch(`/api/applications?id=${encodeURIComponent(id)}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      empToast(`Déplacé vers "${STATUS_LABEL[newStatus]}"`, 'success');
    } catch {
      empToast('Erreur lors du déplacement', 'error');
      loadApplications();
    }
  }

  // ── MODAL ──────────────────────────────────────────────────────────────────
  function openAddModal(defaultStatus = 'wishlist') {
    editingId = null;
    document.getElementById('modalTitle').textContent = 'Nouvelle candidature';
    document.getElementById('appJobTitle').value    = '';
    document.getElementById('appCompany').value     = '';
    document.getElementById('appUrl').value         = '';
    document.getElementById('appLocation').value    = '';
    document.getElementById('appSalary').value      = '';
    document.getElementById('appStatus').value      = defaultStatus;
    document.getElementById('appNotes').value       = '';
    document.getElementById('appInterviewDate').value = '';
    document.getElementById('appContact').value     = '';
    document.getElementById('appModal').classList.add('open');
    document.getElementById('appJobTitle').focus();
  }
  function openDetailModal(id) {
    const app = allApps.find(a => a.id === id);
    if (!app) return;
    editingId = id;
    document.getElementById('modalTitle').textContent   = 'Modifier la candidature';
    document.getElementById('appJobTitle').value         = app.jobTitle || '';
    document.getElementById('appCompany').value          = app.company  || '';
    document.getElementById('appUrl').value              = app.url      || '';
    document.getElementById('appLocation').value         = app.location || '';
    document.getElementById('appSalary').value           = app.salary   || '';
    document.getElementById('appStatus').value           = app.status   || 'wishlist';
    document.getElementById('appNotes').value            = app.notes    || '';
    document.getElementById('appInterviewDate').value    = app.interviewDate || '';
    document.getElementById('appContact').value          = app.contact  || '';
    document.getElementById('appModal').classList.add('open');
  }
  function closeModal() {
    document.getElementById('appModal').classList.remove('open');
    editingId = null;
  }

  async function saveApplication() {
    const data = {
      jobTitle:      document.getElementById('appJobTitle').value.trim(),
      company:       document.getElementById('appCompany').value.trim(),
      url:           document.getElementById('appUrl').value.trim(),
      location:      document.getElementById('appLocation').value.trim(),
      salary:        document.getElementById('appSalary').value.trim(),
      status:        document.getElementById('appStatus').value,
      notes:         document.getElementById('appNotes').value.trim(),
      interviewDate: document.getElementById('appInterviewDate').value || null,
      contact:       document.getElementById('appContact').value.trim(),
    };
    if (!data.jobTitle && !data.company) { empToast('Remplissez le poste ou l\'entreprise', 'error'); return; }
    const btn = document.getElementById('saveAppBtn');
    btn.disabled = true; btn.textContent = 'Enregistrement...';
    try {
      if (editingId) {
        const res = await fetch(`/api/applications?id=${encodeURIComponent(editingId)}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await res.json();
        if (res.ok) {
          const idx = allApps.findIndex(a => a.id === editingId);
          if (idx !== -1) allApps[idx] = result.application;
          empToast('Candidature mise à jour', 'success');
        } else { empToast(result.error || 'Erreur', 'error'); }
      } else {
        const res = await fetch('/api/applications', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await res.json();
        if (res.ok) {
          allApps.unshift(result.application);
          empToast('Candidature ajoutée !', 'success');
        } else if (res.status === 401) {
          empShowAuth('login');
        } else { empToast(result.error || 'Erreur', 'error'); }
      }
      closeModal();
      refresh();
    } catch { empToast('Erreur réseau', 'error'); }
    btn.disabled = false; btn.textContent = 'Enregistrer';
  }

  async function deleteApp(id) {
    if (!confirm('Supprimer cette candidature ?')) return;
    try {
      await fetch(`/api/applications?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
      allApps = allApps.filter(a => a.id !== id);
      refresh();
      empToast('Candidature supprimée', 'info');
    } catch { empToast('Erreur', 'error'); }
  }

  // ── VIEW TOGGLE ────────────────────────────────────────────────────────────
  function setView(v) {
    const kanban = document.getElementById('kanbanView');
    const list   = document.getElementById('listView');
    const kb = document.getElementById('vtKanban');
    const lv = document.getElementById('vtList');
    if (v === 'kanban') {
      kanban.style.display = 'block'; list.classList.remove('active');
      kb.classList.add('active'); lv.classList.remove('active');
    } else {
      kanban.style.display = 'none'; list.classList.add('active');
      kb.classList.remove('active'); lv.classList.add('active');
    }
  }

  // ── GENERATE ───────────────────────────────────────────────────────────────
  let curGenTab = 'cv';
  function setGenTab(btn, tab) {
    document.querySelectorAll('.gen-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    curGenTab = tab;
    document.getElementById('genResult').className = 'gen-result';
    document.getElementById('genResult').innerHTML = '<div style="color:var(--t3);font-size:12px"><div style="font-size:32px;margin-bottom:10px">✨</div>Remplissez les champs et cliquez sur Générer</div>';
  }
  async function handleGen() {
    const offer   = document.getElementById('genOffer').value.trim();
    const profile = document.getElementById('genProfile').value.trim();
    if (!offer || !profile) { empToast('Veuillez remplir tous les champs', 'error'); return; }
    const btn    = document.getElementById('genBtn');
    const result = document.getElementById('genResult');
    btn.disabled = true; btn.textContent = '⏳ Génération en cours...';
    result.className = 'gen-result';
    result.innerHTML = '<div class="spin"></div>';
    try {
      const endpoints = { cv: '/api/generate/cv', lettre: '/api/generate/cover-letter', ats: '/api/generate/ats-score' };
      const body = curGenTab === 'ats' ? { jobOffer: offer, cvText: profile } : { jobOffer: offer, profile };
      const res  = await fetch(endpoints[curGenTab], { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

      if (!res.ok) {
        if (res.status === 401) { empShowAuth('login'); btn.disabled = false; btn.textContent = '✨ Générer avec l\'IA'; return; }
        if (res.status === 402) { window.location.href = '/app'; return; }
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Erreur');
      }

      if (curGenTab === 'ats') {
        // ats-score returns regular JSON
        const d = await res.json();
        const lines = [
          `Score ATS : ${d.score}/100`,
          '',
          ...(d.strengths || []).map(s => '✅ ' + s),
          ...(d.improvements || []).map(i => '⚠️ ' + i),
          ...(d.keywords?.length ? ['', 'Mots-clés manquants : ' + d.keywords.join(', ')] : []),
        ];
        result.className = 'gen-result has-content';
        result.textContent = lines.join('\n').trim();
      } else {
        // cv & cover-letter are SSE streaming
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '', fullText = '';
        result.className = 'gen-result has-content';
        result.textContent = '';
        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.chunk) { fullText += evt.chunk; result.textContent = fullText; }
              if (evt.done) break outer;
              if (evt.error) throw new Error(evt.error);
            } catch {}
          }
        }
        if (!fullText) throw new Error('Réponse vide');
      }

      empToast('Génération réussie !', 'success');
    } catch (e) {
      result.innerHTML = '<div style="color:var(--rnb);font-size:12px">⚠️ ' + (e.message || 'Erreur de génération') + '. Réessayez.</div>';
      empToast(e.message || 'Erreur lors de la génération', 'error');
    }
    btn.disabled = false; btn.textContent = '✨ Générer avec l\'IA';
  }

  // ── CSV EXPORT ─────────────────────────────────────────────────────────────
  function exportCSV() {
    if (!allApps.length) { empToast('Aucune candidature à exporter', 'info'); return; }
    const rows = [['Poste','Entreprise','Statut','Lieu','Salaire','Contact','Date entretien','Notes','URL','Date candidature']];
    allApps.forEach(a => rows.push([
      a.jobTitle||'', a.company||'', STATUS_LABEL[a.status]||a.status,
      a.location||'', a.salary||'', a.contact||'',
      a.interviewDate ? new Date(a.interviewDate).toLocaleDateString('fr-FR') : '',
      (a.notes||'').replace(/\n/g,' '),
      a.url||'',
      new Date(a.createdAt).toLocaleDateString('fr-FR'),
    ]));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'candidatures-emploia.csv'; a.click();
    empToast(`Export CSV — ${allApps.length} candidatures téléchargées`, 'success');
  }

  // ── KEYBOARD (handled in score/report section below) ──────────────────────

  // ── REFERRAL ────────────────────────────────────────────────────────────────
  async function loadReferral() {
    try {
      const r = await fetch('/api/referral', { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      document.getElementById('refLinkInput').value = d.link || '';
      document.getElementById('refSignups').textContent = d.signups || 0;
      document.getElementById('refMonths').textContent = d.monthsEarned || 0;
      document.getElementById('referralCard').style.display = 'block';
    } catch {}
  }
  function copyRefLink() {
    const val = document.getElementById('refLinkInput').value;
    navigator.clipboard.writeText(val).then(() => {
      const btn = document.querySelector('.referral-copy-btn');
      if (btn) { btn.textContent = '✓ Copié !'; setTimeout(() => { btn.textContent = '🔗 Copier'; }, 2000); }
    }).catch(() => empToast('Copie impossible — utilisez Ctrl+C', 'error'));
  }

  // ── SAVED JOBS ─────────────────────────────────────────────────────────────
  async function loadSavedJobs() {
    try {
      const r = await fetch('/api/saved-jobs', { credentials: 'include' });
      if (!r.ok) return;
      const { saved } = await r.json();
      if (!saved || !saved.length) {
        document.getElementById('savedJobsSection').style.display = 'block';
        return;
      }
      document.getElementById('savedJobsSection').style.display = 'block';
      document.getElementById('savedCount').textContent = saved.length;
      document.getElementById('savedJobsList').innerHTML = saved.map(j => `
        <div style="background:var(--s3);border:1px solid var(--brd);border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;color:var(--t1);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(j.title)}</div>
            <div style="font-size:11px;color:var(--t3)">${esc(j.company || '')}${j.location ? ' · ' + esc(j.location) : ''}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            ${j.url && /^https?:\/\//i.test(j.url) ? `<a href="${esc(j.url)}" target="_blank" rel="noopener" class="btn btn-ghost" style="font-size:11px;padding:5px 10px">Voir</a>` : ''}
            <button data-on-click="unsaveJobDash_this_getAttribut_1f50" data-arg-cd2a-0="${esc(j.id)}" class="btn btn-ghost" style="font-size:11px;padding:5px 10px;color:var(--rnb)">✕</button>
          </div>
        </div>`).join('');
    } catch {}
  }

  async function unsaveJobDash(id, el) {
    try {
      await fetch('/api/saved-jobs?id=' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' });
      el.remove();
      const list = document.getElementById('savedJobsList');
      const count = list.children.length;
      document.getElementById('savedCount').textContent = count;
      if (!count) list.innerHTML = '<div style="text-align:center;padding:24px;color:var(--t3);font-size:13px">Aucune offre sauvegardée.<br><a href="/jobs" style="color:var(--inb)">Parcourir les offres</a></div>';
    } catch {}
  }

  // ── DYNAMIC STATS ──────────────────────────────────────────────────────────
  function updateRecentActivity(apps) {
    const el = document.getElementById('activityList');
    if (!el) return;
    const recent = [...apps]
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
      .slice(0, 4);
    if (!recent.length) {
      el.innerHTML = '<div id="activityEmpty" style="text-align:center;padding:24px;color:var(--slate);font-size:14px">Votre activité apparaîtra ici après vos premières actions.</div>';
      return;
    }
    const STATUS_ICON = { wishlist: '📋', applied: '📤', interview: '🎤', offer: '🎉', rejected: '❌' };
    el.innerHTML = recent.map(app => {
      const daysAgo = Math.floor((Date.now() - (app.updatedAt || app.createdAt || Date.now())) / 86400000);
      const timeStr = daysAgo === 0 ? "Aujourd'hui" : daysAgo === 1 ? "Hier" : `Il y a ${daysAgo}j`;
      const icon = STATUS_ICON[app.status] || '📄';
      const label = STATUS_LABEL[app.status] || app.status;
      return `<div class="activity-item">
        <div class="activity-icon">${icon}</div>
        <div class="activity-text">
          <div class="activity-title">${label} — <strong>${esc(app.jobTitle || 'Candidature')}</strong>${app.company ? ' chez <strong>' + esc(app.company) + '</strong>' : ''}</div>
          <div class="activity-time">${timeStr}</div>
        </div>
      </div>`;
    }).join('');
  }

  function updateOnboardingCard(apps, user) {
    const setDone = (n, done) => {
      const step = document.getElementById('ob-' + n);
      const sub  = document.getElementById('ob-' + n + '-sub');
      const chk  = document.getElementById('ob-' + n + '-check');
      if (!step) return;
      step.classList.toggle('done', done);
      if (sub) sub.textContent = done ? 'Complété' : sub.textContent;
      if (chk) chk.style.display = done ? '' : 'none';
    };
    const cvDone  = user && (user.generationsUsed || 0) > 0;
    const profDone = !!user;
    const appDone  = apps.length > 0;
    setDone(1, cvDone);
    setDone(2, profDone);
    setDone(3, appDone);
    const completed = [cvDone, profDone, appDone, false].filter(Boolean).length;
    const pct = Math.round((completed / 4) * 100);
    const badge = document.getElementById('obProgressBadge');
    if (badge) badge.textContent = `${pct}% complété`;
    if (pct === 100) document.getElementById('onboardingCard')?.style?.setProperty('display', 'none');
  }

  function updateStatsUI(apps) {
    const total = apps.length;
    const interviews = apps.filter(a => a.status === 'interview').length;
    const interviewsAndOffers = apps.filter(a => a.status === 'interview' || a.status === 'offer').length;
    const offers = apps.filter(a => a.status === 'offer').length;
    const wishlist = apps.filter(a => a.status === 'wishlist').length;
    const pending = apps.filter(a => a.status === 'applied').length;
    const thisWeek = apps.filter(a => Date.now() - (a.createdAt || 0) < 7 * 86400000).length;
    const interviewRate = total > 0 ? Math.round((interviewsAndOffers / total) * 100) : 0;
    const overdue = apps.filter(a => a.status === 'applied' && Date.now() - (a.updatedAt || a.createdAt || 0) > 14 * 86400000 && !(a.lastFollowUpAt && Date.now() - a.lastFollowUpAt < 14 * 86400000)).length;

    const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = 'sc-delta ' + c; };

    const responseRate = total > 0 ? Math.round((interviewsAndOffers / Math.max(total - wishlist, 1)) * 100) : 0;

    s('statTotal', total || '0');
    s('statInterviews', interviewsAndOffers || '0');
    s('statOffers', offers || '0');
    s('statWishlist', wishlist || '0');
    s('statPending', pending || '0');
    s('statResponseRate', total > 0 ? responseRate + '%' : '—');
    s('wbTotal', total);
    s('wbInterviews', interviewsAndOffers);

    if (thisWeek > 0) { cls('statTotalDelta', 'up'); s('statTotalDelta', `↑ +${thisWeek} cette semaine`); }
    else { cls('statTotalDelta', ''); s('statTotalDelta', 'Aucune cette semaine'); }

    if (interviewRate > 0) { cls('statInterviewsDelta', 'up'); s('statInterviewsDelta', `↑ Taux ${interviewRate}%`); }
    else { cls('statInterviewsDelta', ''); s('statInterviewsDelta', total ? 'Continuez à postuler' : '—'); }

    cls('statOffersDelta', offers > 0 ? 'up' : '');
    s('statOffersDelta', offers > 0 ? '🎉 Félicitations !' : (total ? 'En cours...' : '—'));

    cls('statWishlistDelta', wishlist > 0 ? 'up' : '');
    s('statWishlistDelta', wishlist > 0 ? '→ Générez votre CV' : '—');

    if (overdue > 0) { cls('statPendingDelta', 'down'); s('statPendingDelta', `↓ ${overdue} relance${overdue > 1 ? 's' : ''} à faire`); }
    else if (pending > 0) { cls('statPendingDelta', 'up'); s('statPendingDelta', '✓ À jour'); }
    else { cls('statPendingDelta', ''); s('statPendingDelta', '—'); }

    if (total - wishlist > 0) {
      const rateLabel = responseRate >= 20 ? 'Excellent 🎯' : responseRate >= 10 ? 'Dans la moyenne' : responseRate > 0 ? 'Optimisez votre CV' : 'En attente de retours';
      cls('statResponseRateDelta', responseRate >= 20 ? 'up' : responseRate >= 10 ? '' : 'down');
      s('statResponseRateDelta', rateLabel);
    } else { s('statResponseRateDelta', '—'); }

    updateConseilDuJour(apps);
    renderActivityChart(apps);
    computeSkillsGap(apps);
    updateEmptyState(total);
  }

  function updateEmptyState(total) {
    const el = document.getElementById('dashEmptyState');
    if (el) el.style.display = total === 0 ? 'block' : 'none';
  }

  function renderActivityChart(apps) {
    if (!apps.length) return;
    const chart = document.getElementById('activityChart');
    chart.style.display = 'block';

    // Build 7-day buckets
    const days = [];
    const now = new Date(); now.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      days.push({ date: d, label: i === 0 ? 'Auj.' : d.toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 3), count: 0 });
    }
    apps.forEach(a => {
      const ts = a.createdAt || a.updatedAt;
      if (!ts) return;
      const d = new Date(ts); d.setHours(0, 0, 0, 0);
      const bucket = days.find(b => b.date.getTime() === d.getTime());
      if (bucket) bucket.count++;
    });

    const maxCount = Math.max(...days.map(d => d.count), 1);
    const total7 = days.reduce((s, d) => s + d.count, 0);
    document.getElementById('chartTotal').textContent = total7;
    document.getElementById('chartSubtitle').textContent = `${total7} candidature${total7 !== 1 ? 's' : ''} cette semaine`;

    const barsEl = document.getElementById('chartBars');
    const labelsEl = document.getElementById('chartLabels');
    barsEl.innerHTML = '';
    labelsEl.innerHTML = '';

    days.forEach(day => {
      const pct = Math.max((day.count / maxCount) * 100, day.count > 0 ? 8 : 3);
      const isToday = day.label === 'Auj.';
      const bar = document.createElement('div');
      bar.style.cssText = `flex:1;border-radius:6px 6px 0 0;background:${isToday ? 'var(--grad-primary)' : 'var(--s4)'};height:${pct}%;transition:height .5s ease;position:relative;cursor:default;`;
      bar.title = `${day.label} : ${day.count} candidature${day.count !== 1 ? 's' : ''}`;
      if (day.count > 0) {
        const num = document.createElement('div');
        num.style.cssText = 'position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:700;color:var(--t2);white-space:nowrap;';
        num.textContent = day.count;
        bar.appendChild(num);
      }
      barsEl.appendChild(bar);

      const lbl = document.createElement('div');
      lbl.style.cssText = `flex:1;text-align:center;font-size:10px;color:${isToday ? 'var(--acc)' : 'var(--t3)'};font-weight:${isToday ? '700' : '400'};`;
      lbl.textContent = day.label;
      labelsEl.appendChild(lbl);
    });
  }

  function updateConseilDuJour(apps) {
    const el = document.getElementById('conseilBody');
    if (!el) return;
    const interviewApps = apps.filter(a => a.status === 'interview');
    const overdueApps = apps.filter(a => a.status === 'applied' && Date.now() - (a.updatedAt || a.createdAt || 0) > 14 * 86400000 && !(a.lastFollowUpAt && Date.now() - a.lastFollowUpAt < 14 * 86400000));
    const wishlistApps = apps.filter(a => a.status === 'wishlist');

    if (interviewApps.length > 0) {
      const co = interviewApps[0]?.company ? ` dont <strong style="color:var(--t1)">${esc(interviewApps[0].company)}</strong>` : '';
      el.innerHTML = `<div style="font-size:13px;color:var(--t2);line-height:1.7">Vous avez <strong style="color:var(--ylb)">${interviewApps.length} entretien${interviewApps.length > 1 ? 's' : ''} en cours</strong>${co}. Préparez-vous avec le simulateur IA.</div><a href="/interview" class="btn btn-primary btn-sm" style="margin-top:12px;width:100%">🎤 Simuler l'entretien →</a>`;
    } else if (overdueApps.length > 0) {
      el.innerHTML = `<div style="font-size:13px;color:var(--t2);line-height:1.7"><strong style="color:var(--rnb)">${overdueApps.length} candidature${overdueApps.length > 1 ? 's' : ''} sans réponse depuis +14 jours.</strong> C'est le bon moment pour relancer les recruteurs.</div><a href="/blog/relancer-candidature" class="btn btn-ghost btn-sm" style="margin-top:12px;width:100%">📧 Guide relance →</a>`;
    } else if (wishlistApps.length > 0) {
      el.innerHTML = `<div style="font-size:13px;color:var(--t2);line-height:1.7">Vous avez <strong style="color:var(--blb)">${wishlistApps.length} offre${wishlistApps.length > 1 ? 's' : ''}</strong> en wishlist. Générez votre CV ATS pour postuler rapidement.</div><a href="/app" class="btn btn-primary btn-sm" style="margin-top:12px;width:100%">✨ Générer mon CV →</a>`;
    } else if (!apps.length) {
      el.innerHTML = `<div style="font-size:13px;color:var(--t2);line-height:1.7">Commencez par <strong>trouver des offres</strong> qui vous correspondent, puis générez votre CV ATS-optimisé en 30 secondes.</div><a href="/jobs" class="btn btn-primary btn-sm" style="margin-top:12px;width:100%">📋 Chercher des offres →</a>`;
    } else {
      el.innerHTML = `<div style="font-size:13px;color:var(--t2);line-height:1.7">Continuez sur votre lancée ! Consultez les nouvelles offres et gardez votre pipeline actif.</div><a href="/jobs" class="btn btn-ghost btn-sm" style="margin-top:12px;width:100%">📋 Voir les offres →</a>`;
    }
  }

  async function loadCurrentUser() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const user = data.user || data;
      window.empDashUser = user;
      updateOnboardingCard(allApps, user);
      if (user.name) {
        const firstName = user.name.split(' ')[0];
        document.getElementById('wbName').textContent = firstName || user.name;
      }
      const plan = user.plan || 'free';
      const planLabel = plan === 'free' ? 'Gratuit' : plan === 'pro' ? 'Pro' : plan === 'intensif' ? 'Intensif' : plan;
      document.getElementById('wbPlan').textContent = planLabel;
      const FREE_LIMIT = 5;
      const used = user.generationsUsed || 0;
      const credits = plan === 'free' ? Math.max(0, FREE_LIMIT - used) : '∞';
      document.getElementById('wbCredits').textContent = credits;
      // Update generate panel
      const lbl = document.getElementById('genCreditsLabel');
      const cnt = document.getElementById('genUsageCount');
      const fill = document.getElementById('genUsageFill');
      const footer = document.getElementById('genUsageFooter');
      if (plan === 'free') {
        if (lbl) lbl.textContent = `${credits} crédit${credits !== 1 ? 's' : ''} restant${credits !== 1 ? 's' : ''}`;
        if (cnt) cnt.textContent = `${used} / ${FREE_LIMIT}`;
        if (fill) fill.style.width = `${Math.min(100, Math.round(used / FREE_LIMIT * 100))}%`;
        if (footer) footer.innerHTML = `${credits} génération${credits !== 1 ? 's' : ''} restante${credits !== 1 ? 's' : ''} · <a href="/#pricing" style="color:var(--blb)">Passer Pro →</a>`;
      } else {
        if (lbl) { lbl.textContent = 'Illimité'; lbl.className = 'badge badge-green'; }
        if (cnt) cnt.textContent = `${used} / ∞`;
        if (fill) fill.style.width = '0%';
        if (footer) footer.innerHTML = 'Générations illimitées avec votre abonnement Pro';
      }

      if (user.cancelAtPeriodEnd && user.cancelAt) {
        const cancelDate = new Date(user.cancelAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        document.getElementById('cancelBannerDate').textContent = cancelDate;
        document.getElementById('cancelBanner').style.display = 'flex';
      }
    } catch {}
  }

  // ── JOBS POUR VOUS ─────────────────────────────────────────────────────────
  async function loadJobsForYou() {
    const profileText = localStorage.getItem('emploia_profile_text') || '';
    if (!profileText) return;

    const query = profileText.split(/[\n,;·•]+/).find(l => l.trim().length > 3)?.trim().slice(0, 60) || '';
    if (!query) return;

    document.getElementById('jobsForYouSection').style.display = 'block';

    try {
      const res = await fetch(`/api/jobs?q=${encodeURIComponent(query)}&page=0`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const jobs = (data.jobs || []).slice(0, 4);
      if (!jobs.length) return;

      document.getElementById('jobsForYouList').innerHTML = jobs.map(j => {
        const daysSince = Math.floor((Date.now() - new Date(j.date)) / 86400000);
        const dateStr = daysSince === 0 ? "Aujourd'hui" : daysSince === 1 ? "Hier" : `Il y a ${daysSince}j`;
        return `<div style="background:var(--s3);border:1px solid var(--brd);border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px;transition:border-color .15s" data-on-mouseenter="this_style_borderColor_var_brd_9245" data-on-mouseleave="this_style_borderColor_var_brd_8a51">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;color:var(--t1);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(j.title)}</div>
            <div style="font-size:11px;color:var(--t3)">${esc(j.company)}${j.location ? ' · ' + esc(j.location) : ''} · ${dateStr}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            ${j.url && /^https?:\/\//i.test(j.url) ? `<a href="${esc(j.url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm" style="font-size:11px;padding:5px 10px">Voir →</a>` : ''}
          </div>
        </div>`;
      }).join('');
    } catch {}
  }

  // ── PROCHAINS ENTRETIENS ──────────────────────────────────────────────────
  const IV_KEY = 'emploia_interviews';

  function loadInterviews() {
    const items = JSON.parse(localStorage.getItem(IV_KEY) || '[]')
      .filter(iv => new Date(iv.date) > new Date() - 86400000)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    localStorage.setItem(IV_KEY, JSON.stringify(items));
    const list = document.getElementById('ivList');
    const empty = document.getElementById('ivEmpty');
    if (!items.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    list.innerHTML = items.map(iv => {
      const d = new Date(iv.date);
      const diff = Math.round((d - Date.now()) / 86400000);
      const badge = diff < 0 ? 'Passé' : diff === 0 ? "Aujourd'hui" : diff === 1 ? 'Demain' : `Dans ${diff}j`;
      const badgeColor = diff < 0 ? '#64748b' : diff <= 1 ? '#ef4444' : diff <= 3 ? '#f59e0b' : '#22c55e';
      const prepParams = new URLSearchParams({ tab: 'questions' });
      if (iv.company) prepParams.set('company', iv.company);
      if (iv.role) prepParams.set('job', iv.role);
      const prepUrl = `/tools?${prepParams}`;
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 11px;background:var(--canvas);border:1px solid var(--hairline);border-radius:9px">
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(iv.company)}</div>
          <div style="font-size:11px;color:var(--slate);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(iv.role)} · ${d.toLocaleDateString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
          <span style="font-size:10px;font-weight:700;padding:3px 7px;border-radius:20px;background:${badgeColor}20;color:${badgeColor}">${badge}</span>
          <a href="${prepUrl}" title="Préparer les questions d'entretien" style="text-decoration:none;font-size:14px" data-on-mouseover="this_style_opacity_7_6cd0" data-on-mouseout="this_style_opacity_1_0a1a">🎯</a>
          <button data-on-click="deleteInterview_this_getAttrib_0209" data-arg-7741-0="${esc(iv.id)}" style="background:none;border:none;cursor:pointer;font-size:13px;color:var(--steel);padding:0" title="Supprimer">✕</button>
        </div>
      </div>`;
    }).join('');
  }

  function toggleAddInterview() {
    const f = document.getElementById('addIvForm');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
    if (f.style.display === 'block') {
      const now = new Date(); now.setMinutes(0);
      document.getElementById('ivDate').value = now.toISOString().slice(0,16);
      document.getElementById('ivCompany').focus();
    }
  }

  function saveInterview() {
    const company = document.getElementById('ivCompany').value.trim();
    const role = document.getElementById('ivRole').value.trim();
    const date = document.getElementById('ivDate').value;
    if (!company || !date) return;
    const items = JSON.parse(localStorage.getItem(IV_KEY) || '[]');
    items.push({ id: Date.now().toString(), company, role: role || 'Entretien', date });
    localStorage.setItem(IV_KEY, JSON.stringify(items));
    document.getElementById('addIvForm').style.display = 'none';
    document.getElementById('ivCompany').value = '';
    document.getElementById('ivRole').value = '';
    loadInterviews();
  }

  function deleteInterview(id) {
    const items = JSON.parse(localStorage.getItem(IV_KEY) || '[]').filter(iv => iv.id !== id);
    localStorage.setItem(IV_KEY, JSON.stringify(items));
    loadInterviews();
  }

  // Échappe aussi les guillemets : cette fonction est employée dans des
  // attributs (`href="${esc(j.url)}"`, `title="…"`). Sans cela, une URL d'offre
  // contenant un `"` sortait de l'attribut et pouvait poser un gestionnaire
  // d'événement — et, déclarée ici au niveau global, elle remplaçait la version
  // complète de shared.js pour toute la page.
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  loadInterviews();

  // ── INIT ───────────────────────────────────────────────────────────────────
  loadApplications();
  loadReferral();
  loadSavedJobs();
  loadCurrentUser();
  loadJobsForYou();
  renderScoreChart();

  // ── RELANCE EMAIL ─────────────────────────────────────────────────────────
  let relanceApp = null;
  let relanceData = null;
  let relanceTab = 'short';

  function openRelanceModal(id) {
    const app = allApps.find(a => a.id === id);
    if (!app) return;
    relanceApp = app;
    relanceData = null;
    relanceTab = 'short';

    // Inject modal HTML if not present
    if (!document.getElementById('relanceModal')) {
      const m = document.createElement('div');
      m.id = 'relanceModal';
      m.className = 'relance-modal';
      m.style.display = 'none';
      m.innerHTML = `
        <div class="relance-modal-inner">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <h3>📧 Email de relance</h3>
            <button data-on-click="closeRelanceModal" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--t3)">×</button>
          </div>
          <p id="relanceSubtitle"></p>
          <div id="relanceSubjectBox" style="display:none;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);border-radius:8px;padding:8px 12px;margin-bottom:10px">
            <div style="font-size:9px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Objet</div>
            <div id="relanceSubjectText" style="font-size:13px;color:var(--acc);font-weight:600"></div>
          </div>
          <div class="relance-tabs">
            <button class="relance-tab active" data-on-click="setRelanceTab_short_this_4b58">Version courte</button>
            <button class="relance-tab" data-on-click="setRelanceTab_long_this_2313">Version développée</button>
          </div>
          <div class="relance-content" id="relanceContent">⏳ Génération…</div>
          <div class="relance-tips" id="relanceTips"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary" style="flex:1 1 140px" data-on-click="copyRelance">📋 Copier l'email</button>
            <button class="btn btn-ghost" style="flex:1 1 140px" data-on-click="markFollowedUp">✅ Relance envoyée</button>
          </div>
        </div>`;
      document.body.appendChild(m);
    }

    const daysAgo = Math.floor((Date.now() - (app.updatedAt || app.createdAt || Date.now())) / 86400000);
    document.getElementById('relanceSubtitle').textContent = `${app.company || 'Entreprise'} — ${app.jobTitle || 'Poste'} · candidaté il y a ${daysAgo} jour${daysAgo !== 1 ? 's' : ''}`;
    document.getElementById('relanceContent').textContent = '⏳ Génération de l\'email…';
    document.getElementById('relanceModal').style.display = 'flex';

    fetchRelance(app, daysAgo);
  }

  async function fetchRelance(app, daysAgo) {
    try {
      const res = await fetch('/api/generate/follow-up', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: app.jobTitle || '',
          company: app.company || '',
          daysAgo: daysAgo || 14,
          senderName: window.empUser?.name || '',
          tone: 'professional',
        }),
      });
      if (!res.ok) {
        if (res.status === 401) { closeRelanceModal(); empShowAuth?.('login'); return; }
        if (res.status === 402) { closeRelanceModal(); empShowUpgrade?.(); return; }
        throw new Error();
      }
      relanceData = await res.json();
      document.getElementById('relanceSubjectBox').style.display = 'block';
      document.getElementById('relanceSubjectText').textContent = relanceData.subject || '';
      document.getElementById('relanceTips').innerHTML = (relanceData.tips || []).map(t => `<div class="relance-tip">${esc(t)}</div>`).join('');
      setRelanceTab('short', document.querySelector('.relance-tab'));
    } catch {
      document.getElementById('relanceContent').textContent = 'Erreur lors de la génération. Réessayez.';
    }
  }

  function setRelanceTab(tab, btn) {
    relanceTab = tab;
    document.querySelectorAll('.relance-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (!relanceData) return;
    document.getElementById('relanceContent').textContent = relanceData[tab] || '—';
  }

  function copyRelance() {
    if (!relanceData) return;
    const txt = relanceData[relanceTab] || '';
    navigator.clipboard.writeText(txt).then(() => empToast('Email copié !', 'success')).catch(() => empToast('Copie impossible', 'error'));
  }

  function closeRelanceModal() {
    const m = document.getElementById('relanceModal');
    if (m) m.style.display = 'none';
  }

  // Mark the application as followed-up: silences the reminder for 7 days (14 for the
  // "en retard" banner) and shows a "Relancé il y a Xj" badge. Optimistic + PATCH.
  async function markFollowedUp() {
    if (!relanceApp) return;
    const id = relanceApp.id;
    const app = allApps.find(a => a.id === id);
    if (app) { app.lastFollowUpAt = Date.now(); refresh(); }
    closeRelanceModal();
    empToast('Relance marquée comme envoyée ✓', 'success');
    try {
      await fetch(`/api/applications?id=${encodeURIComponent(id)}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastFollowUpAt: Date.now() }),
      });
    } catch { /* optimistic — local state already updated */ }
  }

  // ── SCORE PROGRESSION CHART ───────────────────────────────────────────────
  function renderScoreChart() {
    const KEY = 'emploia_scores_history';
    let history = [];
    try { history = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch {}
    if (history.length < 2) return;

    const card = document.getElementById('scoreChartCard');
    card.style.display = 'block';

    const canvas = document.getElementById('scoreCanvas');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.parentElement.clientWidth - 28;
    const H = 120;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const PAD = { top: 16, right: 8, bottom: 24, left: 28 };
    const cW = W - PAD.left - PAD.right;
    const cH = H - PAD.top - PAD.bottom;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 1;
    [0, 25, 50, 75, 100].forEach(v => {
      const y = PAD.top + cH - (v / 100) * cH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.font = `9px system-ui`;
      ctx.fillText(v, 2, y + 3);
    });

    const types = ['ats', 'match', 'interview'];
    const colors = { ats: '#6366f1', match: '#22c55e', interview: '#f59e0b' };
    const sorted = [...history].sort((a, b) => a.ts - b.ts).slice(-20);

    document.getElementById('scoreChartMeta').textContent = `${sorted.length} points`;

    types.forEach(type => {
      const pts = sorted.filter(s => s.type === type);
      if (pts.length < 1) return;

      const allTs = sorted.map(s => s.ts);
      const minTs = allTs[0], maxTs = allTs[allTs.length - 1];
      const tsRange = maxTs - minTs || 1;

      ctx.strokeStyle = colors[type];
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      let first = true;
      pts.forEach(p => {
        const x = PAD.left + ((p.ts - minTs) / tsRange) * cW;
        const y = PAD.top + cH - (Math.min(p.score, 100) / 100) * cH;
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Dots
      pts.forEach(p => {
        const x = PAD.left + ((p.ts - minTs) / tsRange) * cW;
        const y = PAD.top + cH - (Math.min(p.score, 100) / 100) * cH;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = colors[type];
        ctx.fill();
      });
    });
  }

  // ── WEEKLY REPORT ─────────────────────────────────────────────────────────
  let reportLoaded = false;

  async function openWeeklyReport() {
    const modal = document.getElementById('reportModal');
    modal.classList.add('open');
    if (reportLoaded) return;
    document.getElementById('reportLoading').style.display = 'block';
    document.getElementById('reportContent').style.display = 'none';
    document.getElementById('reportSubtitle').textContent = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

    try {
      const res = await fetch('/api/weekly-report', { credentials: 'include' });
      if (res.status === 401) {
        empShowAuth('login');
        closeReportModal();
        return;
      }
      if (!res.ok) throw new Error();
      const d = await res.json();
      reportLoaded = true;
      renderReport(d);
    } catch {
      document.getElementById('reportLoading').innerHTML = '<div style="font-size:13px;color:var(--rnb)">Erreur de chargement. Réessayez.</div>';
    }
  }

  function renderReport(d) {
    document.getElementById('reportLoading').style.display = 'none';
    document.getElementById('reportContent').style.display = 'block';

    document.getElementById('reportHeadline').textContent = d.headline || '';
    document.getElementById('reportSummary').textContent = d.summary || '';
    document.getElementById('reportGoal').textContent = d.nextWeekGoal || '';
    document.getElementById('reportMotivation').textContent = '"' + (d.motivation || '') + '"';

    const s = d.stats || {};
    document.getElementById('reportStats').innerHTML = [
      { n: s.totalApps || 0, l: 'candidatures totales' },
      { n: s.thisWeek || 0, l: 'cette semaine' },
      { n: s.interviews || 0, l: 'entretiens' },
      { n: (s.interviewRate || 0) + '%', l: 'taux entretien' },
      { n: s.offers || 0, l: 'offres reçues' },
      { n: s.overdueRelances || 0, l: 'relances à faire' },
    ].map(x => `<div class="report-stat"><div class="report-stat-n">${x.n}</div><div class="report-stat-l">${x.l}</div></div>`).join('');

    const hi = d.highlights || [];
    document.getElementById('reportHighlights').innerHTML = hi.map(h => `<div style="font-size:13px;color:var(--gnb);display:flex;align-items:center;gap:6px;padding:3px 0">✅ ${esc(h)}</div>`).join('');

    const actions = d.actions || [];
    document.getElementById('reportActions').innerHTML = actions.map(a => `<div class="report-action">${esc(a)}</div>`).join('');
  }

  function closeReportModal() {
    document.getElementById('reportModal').classList.remove('open');
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeReportModal(); }
  });

  // ── SKILLS GAP ANALYSIS ───────────────────────────────────────────────────
  function computeSkillsGap(apps) {
    const profile = (localStorage.getItem('emploia_profile_text') || '').toLowerCase();
    if (!profile || apps.length < 2) return;

    // Extract keywords from job titles across all applied/wishlist apps
    const jobWords = apps
      .filter(a => a.status === 'applied' || a.status === 'wishlist' || a.status === 'interview')
      .map(a => (a.jobTitle || '') + ' ' + (a.notes || ''))
      .join(' ')
      .toLowerCase();

    const techSkills = [
      'react','vue','angular','typescript','javascript','python','java','php','node','docker','kubernetes',
      'aws','gcp','azure','sql','mongodb','postgresql','graphql','rest','api','git','agile','scrum',
      'figma','photoshop','excel','powerpoint','salesforce','sap','hubspot','jira','notion',
      'marketing','seo','sea','analytics','adwords','linkedin','crm','b2b','b2c',
      'management','leadership','budget','p&l','kpi','reporting','excel','powerbi',
      'english','german','spanish','mandarin','anglais','allemand','espagnol',
    ];

    const missing = techSkills.filter(skill => {
      const inJobs = jobWords.includes(skill);
      const inProfile = profile.includes(skill);
      return inJobs && !inProfile;
    }).slice(0, 8);

    if (!missing.length) return;
    const card = document.getElementById('skillsGapCard');
    const tags = document.getElementById('skillsGapTags');
    card.style.display = 'block';
    tags.innerHTML = missing.map(s => `<span class="sg-tag">${s}</span>`).join('');
  }

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["closeModal"] = function (event) {
  closeModal()
};
EMP_H["closeRelanceModal"] = function (event) {
  closeRelanceModal()
};
EMP_H["closeReportModal"] = function (event) {
  closeReportModal()
};
EMP_H["copyRefLink"] = function (event) {
  copyRefLink()
};
EMP_H["copyRelance"] = function (event) {
  copyRelance()
};
EMP_H["deleteInterview_this_getAttrib_0209"] = function (event) {
  deleteInterview(this.getAttribute("data-arg-7741-0"))
};
EMP_H["document_getElementById_onboar_8b59"] = function (event) {
  document.getElementById('onboardingCard').style.display='none'
};
EMP_H["dragCard_event_this_getAttribu_02b4"] = function (event) {
  dragCard(event,this.getAttribute("data-arg-9029-0"))
};
EMP_H["dropCard_event_applied_c07e"] = function (event) {
  dropCard(event,'applied')
};
EMP_H["dropCard_event_interview_df6c"] = function (event) {
  dropCard(event,'interview')
};
EMP_H["dropCard_event_offer_fe5b"] = function (event) {
  dropCard(event,'offer')
};
EMP_H["dropCard_event_rejected_e315"] = function (event) {
  dropCard(event,'rejected')
};
EMP_H["dropCard_event_wishlist_83f3"] = function (event) {
  dropCard(event,'wishlist')
};
EMP_H["empShowAuth_register_cac5"] = function (event) {
  empShowAuth('register')
};
EMP_H["event_preventDefault_9c31"] = function (event) {
  event.preventDefault()
};
EMP_H["event_stopPropagation_deleteAp_b42e"] = function (event) {
  event.stopPropagation();deleteApp(this.getAttribute("data-arg-1293-0"))
};
EMP_H["event_stopPropagation_openDeta_79a6"] = function (event) {
  event.stopPropagation();openDetailModal(this.getAttribute("data-arg-8bb2-0"))
};
EMP_H["event_stopPropagation_openRela_4af4"] = function (event) {
  event.stopPropagation();openRelanceModal(this.getAttribute("data-arg-4116-0"))
};
EMP_H["exportCSV"] = function (event) {
  exportCSV()
};
EMP_H["handleGen"] = function (event) {
  handleGen()
};
EMP_H["if_event_target_this_closeModa_24ec"] = function (event) {
  if(event.target===this)closeModal()
};
EMP_H["if_event_target_this_closeRepo_e62e"] = function (event) {
  if(event.target===this)closeReportModal()
};
EMP_H["markFollowedUp"] = function (event) {
  markFollowedUp()
};
EMP_H["openAddModal"] = function (event) {
  openAddModal()
};
EMP_H["openDetailModal_this_getAttrib_fa08"] = function (event) {
  openDetailModal(this.getAttribute("data-arg-b965-0"))
};
EMP_H["openWeeklyReport"] = function (event) {
  openWeeklyReport()
};
EMP_H["saveApplication"] = function (event) {
  saveApplication()
};
EMP_H["saveInterview"] = function (event) {
  saveInterview()
};
EMP_H["setDashTab_all_this_dd33"] = function (event) {
  setDashTab('all',this)
};
EMP_H["setDashTab_applied_this_9692"] = function (event) {
  setDashTab('applied',this)
};
EMP_H["setDashTab_interview_this_7534"] = function (event) {
  setDashTab('interview',this)
};
EMP_H["setDashTab_offer_this_5c79"] = function (event) {
  setDashTab('offer',this)
};
EMP_H["setDashTab_rejected_this_550b"] = function (event) {
  setDashTab('rejected',this)
};
EMP_H["setDashTab_wishlist_this_44c6"] = function (event) {
  setDashTab('wishlist',this)
};
EMP_H["setGenTab_this_ats_3d2b"] = function (event) {
  setGenTab(this,'ats')
};
EMP_H["setGenTab_this_cv_0243"] = function (event) {
  setGenTab(this,'cv')
};
EMP_H["setGenTab_this_lettre_0258"] = function (event) {
  setGenTab(this,'lettre')
};
EMP_H["setRelanceTab_long_this_2313"] = function (event) {
  setRelanceTab('long',this)
};
EMP_H["setRelanceTab_short_this_4b58"] = function (event) {
  setRelanceTab('short',this)
};
EMP_H["setView_kanban_3b02"] = function (event) {
  setView('kanban')
};
EMP_H["setView_list_2812"] = function (event) {
  setView('list')
};
EMP_H["this_select_5c3a"] = function (event) {
  this.select()
};
EMP_H["this_style_borderColor_rgba_11_2fd6"] = function (event) {
  this.style.borderColor='rgba(110,72,190,.2)';this.style.color='var(--slate)'
};
EMP_H["this_style_borderColor_var_brd_8a51"] = function (event) {
  this.style.borderColor='var(--brd)'
};
EMP_H["this_style_borderColor_var_brd_9245"] = function (event) {
  this.style.borderColor='var(--brdh)'
};
EMP_H["this_style_borderColor_var_pri_6099"] = function (event) {
  this.style.borderColor='var(--primary)';this.style.color='var(--primary)'
};
EMP_H["this_style_opacity_1_0a1a"] = function (event) {
  this.style.opacity='1'
};
EMP_H["this_style_opacity_7_6cd0"] = function (event) {
  this.style.opacity='.7'
};
EMP_H["toggleAddInterview"] = function (event) {
  toggleAddInterview()
};
EMP_H["unsaveJobDash_this_getAttribut_1f50"] = function (event) {
  unsaveJobDash(this.getAttribute("data-arg-cd2a-0"),this.closest('div[style]'))
};
