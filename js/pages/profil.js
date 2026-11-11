  // Section switching
  function showSection(id, btn) {
    document.querySelectorAll('[id^="sec-"]').forEach(s => s.style.display = 'none');
    document.getElementById('sec-' + id).style.display = 'block';
    document.querySelectorAll('.pnav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (id === 'documents') loadDocuments();
  }

  // Skills
  function removeSkill(el) {
    el.closest('.skill-tag').remove();
  }

  function addSkill() {
    const input = document.getElementById('skillInput');
    const val = input.value.trim();
    if (!val) return;
    const empty = document.getElementById('skillsEmpty');
    if (empty) empty.remove();
    const tag = document.createElement('span');
    tag.className = 'skill-tag';
    tag.innerHTML = `<span class="skill-level-dot level-beginner"></span>${esc(val)}<span class="remove" data-on-click="removeSkill_this_17cf">✕</span>`;
    document.getElementById('skillsWrap').appendChild(tag);
    input.value = '';
    empToast('Compétence ajoutée', 'success');
  }

  document.getElementById('skillInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addSkill();
  });

  // Dynamic completion bar
  function calculateCompletion() {
    const checks = [
      { id: 'prfFirstName', weight: 8, label: 'prénom' },
      { id: 'prfLastName',  weight: 8, label: 'nom' },
      { id: 'prfTitle',     weight: 15, label: 'titre de poste' },
      { id: 'prfLocation',  weight: 8, label: 'localisation' },
      { id: 'prfPhone',     weight: 6, label: 'téléphone' },
      { id: 'prfSummary',   weight: 20, label: 'résumé professionnel' },
      { id: 'prfLinkedin',  weight: 8, label: 'profil LinkedIn' },
      { id: 'prfPortfolio', weight: 5, label: 'portfolio' },
    ];
    let score = 0;
    const missing = [];
    for (const c of checks) {
      const el = document.getElementById(c.id);
      if (el && el.value.trim().length > 1) score += c.weight;
      else missing.push(c.label);
    }
    const skillCount = document.querySelectorAll('.skill-tag').length;
    if (skillCount >= 3) score += 22;
    else if (skillCount >= 1) score += 10;
    else missing.push('compétences (min. 3)');

    score = Math.min(score, 100);
    document.getElementById('completionBar').style.width = score + '%';
    document.getElementById('completionPct').textContent = score + '%';
    const tip = document.getElementById('completionTip');
    if (score === 100) tip.textContent = '✅ Profil complet !';
    else if (missing.length > 0) tip.textContent = `À compléter : ${missing.slice(0, 2).join(', ')}`;
    else tip.textContent = '';
    return score;
  }

  setTimeout(calculateCompletion, 500);

  // CV Import
  async function importCV(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 3_000_000) { empToast('Fichier trop volumineux (max 3 MB)', 'error'); return; }
    if (file.type !== 'application/pdf') { empToast('Format PDF requis', 'error'); return; }

    empToast('Analyse du CV en cours...', 'info');

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];
      try {
        const res = await fetch('/api/import-cv', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: base64 }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          empToast(err.error || 'Erreur lors de l\'analyse', 'error');
          return;
        }
        const data = await res.json();
        fillProfileFromCV(data);
        empToast('CV importé avec succès !', 'success');
      } catch {
        empToast('Erreur réseau', 'error');
      }
      input.value = '';
    };
    reader.readAsDataURL(file);
  }

  function fillProfileFromCV(data) {
    const set = (id, val) => { if (val && document.getElementById(id)) document.getElementById(id).value = val; };
    set('prfFirstName', data.firstName);
    set('prfLastName',  data.lastName);
    set('prfEmail',     data.email);
    set('prfPhone',     data.phone);
    set('prfTitle',     data.title);
    set('prfLocation',  data.location);
    set('prfSummary',   data.summary);
    set('prfLinkedin',  data.linkedin);
    set('prfPortfolio', data.portfolio);

    // Update sidebar display
    const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ');
    const sidebarName = document.getElementById('sidebarName');
    const sidebarTitle = document.getElementById('sidebarTitle');
    if (fullName && sidebarName) sidebarName.textContent = fullName;
    if (sidebarTitle) {
      const parts = [data.title, data.location].filter(Boolean);
      if (parts.length) sidebarTitle.textContent = parts.join(' · ');
    }

    if (data.skills?.length) {
      const wrap = document.getElementById('skillsWrap');
      if (wrap) {
        wrap.innerHTML = '';
        data.skills.forEach(skill => {
          const tag = document.createElement('span');
          tag.className = 'skill-tag';
          tag.innerHTML = `<span class="skill-level-dot level-beginner"></span>${esc(skill)}<span class="remove" data-on-click="removeSkill_this_17cf">✕</span>`;
          wrap.appendChild(tag);
        });
      }
    }

    if (Array.isArray(data.langs) && data.langs.length) {
      const wrap = document.getElementById('langWrap');
      if (wrap) {
        wrap.innerHTML = '';
        data.langs.forEach(lang => {
          const tag = document.createElement('span');
          tag.className = 'skill-tag';
          tag.innerHTML = `<span class="skill-level-dot level-beginner"></span>${esc(lang)}<span class="remove" data-on-click="removeSkill_this_17cf">✕</span>`;
          wrap.appendChild(tag);
        });
      }
    }
    if (data.preferences && typeof data.preferences === 'object') {
      _prefs = data.preferences;
      localStorage.setItem('emploia_prefs', JSON.stringify(_prefs));
      renderPrefs();
    }
    if (data.toggles && typeof data.toggles === 'object') {
      _toggles = data.toggles;
      localStorage.setItem('emploia_toggles', JSON.stringify(_toggles));
      renderToggles();
    }
    if (Array.isArray(data.experiences) && data.experiences.length) {
      _exps = data.experiences;
      saveExpsToStorage();
      renderExps();
    }
    if (Array.isArray(data.formations) && data.formations.length) {
      _forms = data.formations;
      saveFormsToStorage();
      renderForms();
    }

    // Save profile text to localStorage for AI match score
    const profileText = [
      data.title, data.summary,
      data.skills?.join(', '),
      data.experience?.map(e => `${e.title} chez ${e.company} : ${e.description}`).join(' '),
    ].filter(Boolean).join('\n');
    localStorage.setItem('emploia_profile_text', profileText);
  }

  function collectProfile() {
    const skills = [...document.querySelectorAll('#skillsWrap .skill-tag')].map(t => (t.querySelector('.skill-name') || t.childNodes[1])?.textContent.trim()).filter(Boolean);
    const langs  = [...document.querySelectorAll('#langWrap .skill-tag')].map(t => (t.querySelector('.skill-name') || t.childNodes[1])?.textContent.trim()).filter(Boolean);
    return {
      firstName:   document.getElementById('prfFirstName')?.value.trim() || '',
      lastName:    document.getElementById('prfLastName')?.value.trim() || '',
      title:       document.getElementById('prfTitle')?.value.trim() || '',
      location:    document.getElementById('prfLocation')?.value.trim() || '',
      phone:       document.getElementById('prfPhone')?.value.trim() || '',
      summary:     document.getElementById('prfSummary')?.value.trim() || '',
      linkedin:    document.getElementById('prfLinkedin')?.value.trim() || '',
      portfolio:   document.getElementById('prfPortfolio')?.value.trim() || '',
      skills,
      langs,
      experiences: _exps,
      formations:  _forms,
      preferences: typeof _prefs   !== 'undefined' ? _prefs   : {},
      toggles:     typeof _toggles !== 'undefined' ? _toggles : {},
    };
  }

  async function saveProfile() {
    const btn = document.getElementById('saveProfileBtn');
    btn.disabled = true; btn.textContent = 'Sauvegarde…';
    const data = collectProfile();
    // Always save to localStorage for AI match score
    localStorage.setItem('emploia_profile_text', [data.title, data.summary, data.skills?.join(', ')].filter(Boolean).join('\n'));
    // Save to KV if logged in
    if (window.empUser) {
      try {
        const res = await fetch('/api/profile', {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          empToast('Profil sauvegardé dans votre compte ✓', 'success');
          markProfileSaved();
        } else {
          // Seuls le titre, le résumé et les compétences vivent en local : dire
          // « sauvegardé localement » laissait croire que tout l'était.
          empToast('Échec de la sauvegarde — vos modifications sont toujours là, réessayez', 'error');
        }
      } catch {
        empToast('Connexion perdue — vos modifications sont toujours là, réessayez', 'error');
      }
    } else {
      empToast('Connectez-vous pour enregistrer votre profil dans votre compte', 'info');
      if (typeof empShowAuth === 'function') empShowAuth('login');
    }
    btn.disabled = false; btn.textContent = 'Sauvegarder les modifications';
  }

  // ── Barre « modifications non sauvegardées » : affichée seulement quand le
  // formulaire diffère vraiment du profil enregistré.
  let savedProfileSnapshot = null;
  function profileSnapshot() { try { return JSON.stringify(collectProfile()); } catch { return null; } }
  function refreshSaveBar() {
    const bar = document.querySelector('.save-bar');
    if (!bar || savedProfileSnapshot === null) return;
    bar.classList.toggle('visible', profileSnapshot() !== savedProfileSnapshot);
  }
  function markProfileSaved() { savedProfileSnapshot = profileSnapshot(); refreshSaveBar(); }
  function cancelProfileChanges() {
    if (!confirm('Abandonner les modifications non sauvegardées ?')) return;
    savedProfileSnapshot = null; // pas de seconde confirmation au rechargement
    location.reload();
  }
  ['input', 'change', 'click'].forEach(ev => document.addEventListener(ev, () => setTimeout(refreshSaveBar, 60), true));
  window.addEventListener('beforeunload', e => {
    if (savedProfileSnapshot !== null && profileSnapshot() !== savedProfileSnapshot) { e.preventDefault(); e.returnValue = ''; }
  });

  // Load profile from KV if logged in
  async function loadProfileFromServer() {
    if (!window.empUser) return;
    try {
      const res = await fetch('/api/profile', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || typeof data !== 'object') return;
      fillProfileFromCV(data); // reuse same filler
      setTimeout(calculateCompletion, 200);
      setTimeout(markProfileSaved, 250);
    } catch {}
  }

  async function loadStats() {
    try {
      const r = await fetch('/api/applications?stats=1', { credentials: 'include' });
      if (!r.ok) return;
      const { stats } = await r.json();
      if (!stats) return;
      const el = id => document.getElementById(id);
      if (el('statTotal'))     el('statTotal').textContent     = stats.total;
      if (el('statInterview')) el('statInterview').textContent = stats.interview;
      if (el('statOffers'))    el('statOffers').textContent    = stats.offer;
    } catch {}
  }

  async function loadDocuments() {
    const list = document.getElementById('docList');
    if (!list) return;
    try {
      const r = await fetch('/api/cv-versions', { credentials: 'include' });
      if (!r.ok) { list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--t3);font-size:13px">Impossible de charger les documents</div>'; return; }
      const { versions } = await r.json();
      if (!versions?.length) {
        list.innerHTML = `<div style="text-align:center;padding:40px;color:var(--t3);font-size:13px">Aucun document sauvegardé.<br/><a href="/cv-builder" style="color:var(--inb);font-weight:700">Créer votre premier CV →</a></div>`;
        return;
      }
      const icons = { cv: '📄', letter: '✉️', other: '📎' };
      list.innerHTML = versions.map(v => {
        const date = v.createdAt ? new Date(v.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        return `<div class="doc-item">
          <div class="doc-icon">${icons[v.type] || '📄'}</div>
          <div class="doc-info">
            <div class="doc-name">${esc(v.name || 'Document sans titre')}</div>
            <div class="doc-meta">${v.type === 'cv' ? 'CV' : v.type === 'letter' ? 'Lettre de motivation' : 'Document'}${date ? ' · ' + date : ''}</div>
          </div>
          <a href="/cv-builder" class="icon-btn" title="Ouvrir dans le CV Builder">✏️</a>
        </div>`;
      }).join('');
    } catch {
      list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--t3);font-size:13px">Erreur lors du chargement</div>';
    }
  }

  window.addEventListener('empAuthChange', e => {
    if (e.detail.user) { loadProfileFromServer(); showSubscriptionInfo(e.detail.user); }
  });
  // Référence par défaut : le formulaire tel que la page l'a construit. Le
  // chargement serveur la remplace dès qu'il a rempli les champs.
  setTimeout(() => { if (savedProfileSnapshot === null) markProfileSaved(); }, 1500);
  setTimeout(async () => {
    loadProfileFromServer();
    loadStats();
    // Load user for subscription info
    try {
      const r = await fetch('/api/auth/me', { credentials: 'include' });
      if (r.ok) {
        const data = await r.json();
        const u = data.user || data;
        showSubscriptionInfo(u);
        const gensEl = document.getElementById('statGens');
        if (gensEl) gensEl.textContent = u.generationsUsed || 0;
      }
    } catch {}
  }, 900);

  function showSubscriptionInfo(user) {
    if (!user || user.plan === 'free') return;
    const section = document.getElementById('subscriptionSection');
    if (!section) return;
    section.style.display = 'block';
    const labels = { pro: 'Pro', intensif: 'Intensif' };
    document.getElementById('subPlanLabel').textContent = labels[user.plan] || user.plan;
    if (user.cancelAtPeriodEnd && user.cancelAt) {
      const d = new Date(user.cancelAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      document.getElementById('subCancelDate').textContent = d;
      document.getElementById('cancelWarning').style.display = 'block';
    }
  }

  async function changePassword() {
    const current = document.getElementById('pwdCurrent')?.value || '';
    const newPwd   = document.getElementById('pwdNew')?.value     || '';
    const confirm  = document.getElementById('pwdConfirm')?.value  || '';
    if (!current || !newPwd || !confirm) { empToast('Remplissez tous les champs', 'error'); return; }
    if (newPwd !== confirm) { empToast('Les mots de passe ne correspondent pas', 'error'); return; }
    if (newPwd.length < 8) { empToast('Nouveau mot de passe trop court (8 caractères min)', 'error'); return; }
    const btn = document.getElementById('pwdBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Mise à jour…'; }
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: newPwd }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        empToast('Mot de passe mis à jour !', 'success');
        ['pwdCurrent', 'pwdNew', 'pwdConfirm'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      } else {
        empToast(data.error || 'Erreur lors de la mise à jour', 'error');
      }
    } catch { empToast('Erreur réseau — réessayez', 'error'); }
    if (btn) { btn.disabled = false; btn.textContent = 'Mettre à jour'; }
  }

  async function confirmDeleteAccount() {
    const confirmed = window.confirm(
      'Supprimer votre compte ? Cette action est irréversible.\n\nToutes vos données seront effacées (candidatures, documents, alertes).'
    );
    if (!confirmed) return;
    const btn = document.querySelector('button[onclick="confirmDeleteAccount()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Suppression…'; }
    try {
      const res = await fetch('/api/auth/delete-account', { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        empToast('Compte supprimé. Redirection…', 'success');
        setTimeout(() => { window.location.href = '/'; }, 1500);
      } else {
        const data = await res.json().catch(() => ({}));
        empToast(data.error || 'Erreur lors de la suppression', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Supprimer mon compte'; }
      }
    } catch {
      empToast('Erreur réseau — réessayez', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Supprimer mon compte'; }
    }
  }

  // ── LinkedIn Import ──────────────────────────────────────────────────────
  function toggleLinkedInImport() {
    const panel = document.getElementById('liImportPanel');
    const btn = document.getElementById('liToggleBtn');
    const open = panel.style.display === 'none';
    panel.style.display = open ? 'block' : 'none';
    btn.textContent = open ? 'Fermer ↑' : 'Ouvrir →';
  }

  async function importLinkedIn() {
    const raw = (document.getElementById('liText').value || '').trim();
    if (!raw) { empToast('Collez d\'abord votre texte LinkedIn', 'error'); return; }
    const btn = document.getElementById('liImportBtn');
    btn.disabled = true; btn.textContent = '⏳ Analyse…';
    try {
      // Save raw text for AI usage (app.html / smart-apply)
      localStorage.setItem('emploia_profile_text', raw);
      // Try to extract structured info with Claude via /api/import-cv
      const res = await fetch('/api/import-cv', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: raw }),
      });
      if (res.ok) {
        const data = await res.json();
        fillProfileFromCV(data);
        setTimeout(calculateCompletion, 200);
        empToast('Profil LinkedIn importé ✓', 'success');
        toggleLinkedInImport();
        document.getElementById('liText').value = '';
      } else {
        // Fallback: populate summary textarea with raw text
        const summaryEl = document.getElementById('prfSummary');
        if (summaryEl) summaryEl.value = raw.slice(0, 1200);
        empToast('Texte importé dans le résumé — complétez les autres champs', 'info');
        setTimeout(calculateCompletion, 200);
      }
    } catch {
      // Silent fallback: at least save to localStorage
      empToast('Texte sauvegardé pour l\'IA (profil serveur indisponible)', 'info');
    }
    btn.disabled = false; btn.textContent = '✨ Importer dans mon profil';
  }

  // ── Langues ──────────────────────────────────────────────────────────────
  function addLang() {
    const input = document.getElementById('langInput');
    const val = input.value.trim();
    if (!val) return;
    const wrap = document.getElementById('langWrap');
    const empty = document.getElementById('langEmpty');
    if (empty) empty.remove();
    const tag = document.createElement('span');
    tag.className = 'skill-tag';
    tag.innerHTML = `<span class="skill-level-dot level-beginner"></span>${esc(val)}<span class="remove" data-on-click="removeSkill_this_17cf">✕</span>`;
    wrap.appendChild(tag);
    input.value = '';
    empToast('Langue ajoutée', 'success');
  }
  document.getElementById('langInput').addEventListener('keydown', e => { if (e.key === 'Enter') addLang(); });

  // ── Préférences ──────────────────────────────────────────────────────────
  let _prefs = JSON.parse(localStorage.getItem('emploia_prefs') || '{}');
  let _toggles = JSON.parse(localStorage.getItem('emploia_toggles') || '{}');

  function renderPrefs() {
    const p = _prefs;
    const contracts = Array.isArray(p.contracts) && p.contracts.length ? p.contracts.join(' · ') : '—';
    const salaire = p.salaireMin || p.salaireMax
      ? [(p.salaireMin ? p.salaireMin.toLocaleString('fr-FR') + ' €' : ''), (p.salaireMax ? p.salaireMax.toLocaleString('fr-FR') + ' €' : '')].filter(Boolean).join(' — ')
      : '—';
    const levels = Array.isArray(p.levels) && p.levels.length ? p.levels.join(' · ') : '—';
    document.getElementById('prefContrat').textContent  = contracts;
    document.getElementById('prefSalaire').textContent  = salaire;
    document.getElementById('prefLoc').textContent      = p.location   || '—';
    document.getElementById('prefSecteur').textContent  = p.secteur    || '—';
    document.getElementById('prefDispo').textContent    = p.dispo      || '—';
    document.getElementById('prefNiveau').textContent   = levels;
  }

  function renderToggles() {
    const at = document.getElementById('alertToggle');
    const vt = document.getElementById('visibleToggle');
    if (at) at.classList.toggle('on', !!_toggles.alertEmails);
    if (vt) vt.classList.toggle('on', !!_toggles.profileVisible);
  }

  function togglePref(elId, key) {
    _toggles[key] = !_toggles[key];
    document.getElementById(elId).classList.toggle('on', _toggles[key]);
    localStorage.setItem('emploia_toggles', JSON.stringify(_toggles));
  }

  function openPrefsModal() {
    const p = _prefs;
    // Contracts checkboxes
    document.querySelectorAll('#contractTypes input[type=checkbox]').forEach(cb => {
      cb.checked = Array.isArray(p.contracts) && p.contracts.includes(cb.value);
    });
    // Levels checkboxes
    document.querySelectorAll('#expLevels input[type=checkbox]').forEach(cb => {
      cb.checked = Array.isArray(p.levels) && p.levels.includes(cb.value);
    });
    document.getElementById('prefSalaireMin').value  = p.salaireMin  || '';
    document.getElementById('prefSalaireMax').value  = p.salaireMax  || '';
    document.getElementById('prefLocInput').value    = p.location    || '';
    document.getElementById('prefSecteurInput').value = p.secteur    || '';
    document.getElementById('prefDispoSelect').value = p.dispo       || '';
    document.getElementById('prefsModal').showModal();
  }

  function savePrefs() {
    _prefs = {
      contracts:  [...document.querySelectorAll('#contractTypes input:checked')].map(c => c.value),
      salaireMin: parseInt(document.getElementById('prefSalaireMin').value) || null,
      salaireMax: parseInt(document.getElementById('prefSalaireMax').value) || null,
      location:   document.getElementById('prefLocInput').value.trim(),
      secteur:    document.getElementById('prefSecteurInput').value.trim(),
      dispo:      document.getElementById('prefDispoSelect').value,
      levels:     [...document.querySelectorAll('#expLevels input:checked')].map(c => c.value),
    };
    localStorage.setItem('emploia_prefs', JSON.stringify(_prefs));
    renderPrefs();
    document.getElementById('prefsModal').close();
    empToast('Préférences enregistrées', 'success');
  }

  document.getElementById('prefsModal').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  renderPrefs();
  renderToggles();

  // ── Expériences & Formations ─────────────────────────────────────────────
  let _exps  = JSON.parse(localStorage.getItem('emploia_exps')  || '[]');
  let _forms = JSON.parse(localStorage.getItem('emploia_forms') || '[]');
  let _editExpId  = null;
  let _editFormId = null;

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function renderExps() {
    const list = document.getElementById('expList');
    const empty = document.getElementById('expEmpty');
    if (!_exps.length) { if (empty) empty.style.display = ''; return; }
    if (empty) empty.style.display = 'none';
    const items = _exps.map(e => {
      const typeStr = e.type ? ' · ' + e.type : '';
      const locStr  = e.location ? ' · ' + esc(e.location) : '';
      const start   = [e.startMonth, e.startYear].filter(Boolean).join(' ');
      const end     = e.current ? 'Présent' : [e.endMonth, e.endYear].filter(Boolean).join(' ') || '';
      const period  = [start, end].filter(Boolean).join(' — ');
      return `<div class="exp-item">
        <div class="exp-logo">🏢</div>
        <div class="exp-info">
          <div class="exp-title">${esc(e.title)}</div>
          <div class="exp-company">${esc(e.company)}${typeStr}${locStr}</div>
          ${period ? `<div class="exp-period">${period}</div>` : ''}
          ${e.description ? `<div class="exp-desc">${esc(e.description)}</div>` : ''}
        </div>
        <div class="exp-actions">
          <button class="icon-btn" title="Modifier" data-on-click="openExpModal_this_getAttribute_8105" data-arg-5a54-0="${esc(e.id)}">✏️</button>
          <button class="icon-btn" title="Supprimer" data-on-click="deleteExp_this_getAttribute_da_c636" data-arg-f2b5-0="${esc(e.id)}">🗑️</button>
        </div>
      </div>`;
    }).join('');
    list.innerHTML = items + (empty ? empty.outerHTML : '');
    if (document.getElementById('expEmpty')) document.getElementById('expEmpty').style.display = 'none';
  }

  function renderForms() {
    const list = document.getElementById('formList');
    const empty = document.getElementById('formEmpty');
    if (!_forms.length) { if (empty) empty.style.display = ''; return; }
    if (empty) empty.style.display = 'none';
    const items = _forms.map(f => {
      const end    = f.current ? 'En cours' : f.endYear || '';
      const period = [f.startYear, end].filter(Boolean).join(' — ');
      const mention = f.mention ? ' · ' + esc(f.mention) : '';
      return `<div class="exp-item">
        <div class="exp-logo">🎓</div>
        <div class="exp-info">
          <div class="exp-title">${esc(f.degree)}</div>
          <div class="exp-company">${esc(f.school)}</div>
          ${period ? `<div class="exp-period">${period}${mention}</div>` : ''}
        </div>
        <div class="exp-actions">
          <button class="icon-btn" title="Modifier" data-on-click="openFormModal_this_getAttribut_7911" data-arg-5e81-0="${esc(f.id)}">✏️</button>
          <button class="icon-btn" title="Supprimer" data-on-click="deleteFrm_this_getAttribute_da_14c8" data-arg-49d1-0="${esc(f.id)}">🗑️</button>
        </div>
      </div>`;
    }).join('');
    list.innerHTML = items + (empty ? empty.outerHTML : '');
    if (document.getElementById('formEmpty')) document.getElementById('formEmpty').style.display = 'none';
  }

  function saveExpsToStorage() {
    localStorage.setItem('emploia_exps', JSON.stringify(_exps));
  }
  function saveFormsToStorage() {
    localStorage.setItem('emploia_forms', JSON.stringify(_forms));
  }

  function openExpModal(id) {
    _editExpId = id || null;
    const modal = document.getElementById('expModal');
    document.getElementById('expModalTitle').textContent = id ? 'Modifier l\'expérience' : 'Ajouter une expérience';
    const exp = id ? _exps.find(e => e.id === id) : null;
    document.getElementById('expTitle').value       = exp?.title       || '';
    document.getElementById('expCompany').value     = exp?.company     || '';
    document.getElementById('expType').value        = exp?.type        || '';
    document.getElementById('expLocation').value    = exp?.location    || '';
    document.getElementById('expStartMonth').value  = exp?.startMonth  || '';
    document.getElementById('expStartYear').value   = exp?.startYear   || '';
    document.getElementById('expEndMonth').value    = exp?.endMonth    || '';
    document.getElementById('expEndYear').value     = exp?.endYear     || '';
    document.getElementById('expCurrent').checked   = exp?.current     || false;
    document.getElementById('expEndMonth').disabled = exp?.current     || false;
    document.getElementById('expEndYear').disabled  = exp?.current     || false;
    document.getElementById('expDesc').value        = exp?.description || '';
    modal.showModal();
  }

  function saveExp() {
    const title   = document.getElementById('expTitle').value.trim();
    const company = document.getElementById('expCompany').value.trim();
    if (!title || !company) { empToast('Poste et entreprise requis', 'error'); return; }
    const entry = {
      id:          _editExpId || uid(),
      title, company,
      type:        document.getElementById('expType').value,
      location:    document.getElementById('expLocation').value.trim(),
      startMonth:  document.getElementById('expStartMonth').value,
      startYear:   document.getElementById('expStartYear').value,
      endMonth:    document.getElementById('expEndMonth').value,
      endYear:     document.getElementById('expEndYear').value,
      current:     document.getElementById('expCurrent').checked,
      description: document.getElementById('expDesc').value.trim(),
    };
    if (_editExpId) {
      const idx = _exps.findIndex(e => e.id === _editExpId);
      if (idx !== -1) _exps[idx] = entry;
    } else {
      _exps.unshift(entry);
    }
    saveExpsToStorage();
    renderExps();
    document.getElementById('expModal').close();
    empToast(_editExpId ? 'Expérience modifiée' : 'Expérience ajoutée', 'success');
    _editExpId = null;
  }

  function deleteExp(id) {
    if (!confirm('Supprimer cette expérience ?')) return;
    _exps = _exps.filter(e => e.id !== id);
    saveExpsToStorage();
    renderExps();
    empToast('Expérience supprimée', 'info');
  }

  function openFormModal(id) {
    _editFormId = id || null;
    const modal = document.getElementById('formModal');
    document.getElementById('formModalTitle').textContent = id ? 'Modifier la formation' : 'Ajouter une formation';
    const f = id ? _forms.find(x => x.id === id) : null;
    document.getElementById('frmDegree').value  = f?.degree  || '';
    document.getElementById('frmSchool').value  = f?.school  || '';
    document.getElementById('frmStart').value   = f?.startYear || '';
    document.getElementById('frmEnd').value     = f?.endYear   || '';
    document.getElementById('frmCurrent').checked  = f?.current   || false;
    document.getElementById('frmEnd').disabled     = f?.current   || false;
    document.getElementById('frmMention').value = f?.mention  || '';
    modal.showModal();
  }

  function saveFrm() {
    const degree = document.getElementById('frmDegree').value.trim();
    const school = document.getElementById('frmSchool').value.trim();
    if (!degree || !school) { empToast('Diplôme et établissement requis', 'error'); return; }
    const entry = {
      id:        _editFormId || uid(),
      degree, school,
      startYear: document.getElementById('frmStart').value,
      endYear:   document.getElementById('frmEnd').value,
      current:   document.getElementById('frmCurrent').checked,
      mention:   document.getElementById('frmMention').value.trim(),
    };
    if (_editFormId) {
      const idx = _forms.findIndex(x => x.id === _editFormId);
      if (idx !== -1) _forms[idx] = entry;
    } else {
      _forms.unshift(entry);
    }
    saveFormsToStorage();
    renderForms();
    document.getElementById('formModal').close();
    empToast(_editFormId ? 'Formation modifiée' : 'Formation ajoutée', 'success');
    _editFormId = null;
  }

  function deleteFrm(id) {
    if (!confirm('Supprimer cette formation ?')) return;
    _forms = _forms.filter(x => x.id !== id);
    saveFormsToStorage();
    renderForms();
    empToast('Formation supprimée', 'info');
  }

  // Close modals on backdrop click
  ['expModal','formModal'].forEach(id => {
    const d = document.getElementById(id);
    if (d) d.addEventListener('click', e => { if (e.target === d) d.close(); });
  });

  renderExps();
  renderForms();

  // Recalculate completion on any field change
  document.querySelectorAll('#prfFirstName,#prfLastName,#prfTitle,#prfLocation,#prfPhone,#prfSummary,#prfLinkedin,#prfPortfolio').forEach(el => {
    el.addEventListener('input', () => setTimeout(calculateCompletion, 100));
  });

  function exportProfileText() {
    const text = localStorage.getItem('emploia_profile_text') || '';
    if (!text) { empToast('Sauvegardez d\'abord votre profil', 'error'); return; }
    const firstName = document.getElementById('prfFirstName')?.value || '';
    const lastName = document.getElementById('prfLastName')?.value || '';
    const name = (firstName + '_' + lastName).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || 'profil';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${name}_emploia.txt`;
    a.click();
    URL.revokeObjectURL(url);
    empToast('Profil exporté !', 'success');
  }

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["addLang"] = function (event) {
  addLang()
};
EMP_H["addSkill"] = function (event) {
  addSkill()
};
EMP_H["cancelProfileChanges"] = function (event) {
  cancelProfileChanges()
};
EMP_H["changePassword"] = function (event) {
  changePassword()
};
EMP_H["confirmDeleteAccount"] = function (event) {
  confirmDeleteAccount()
};
EMP_H["deleteExp_this_getAttribute_da_c636"] = function (event) {
  deleteExp(this.getAttribute("data-arg-f2b5-0"))
};
EMP_H["deleteFrm_this_getAttribute_da_14c8"] = function (event) {
  deleteFrm(this.getAttribute("data-arg-49d1-0"))
};
EMP_H["document_getElementById_cvFile_5726"] = function (event) {
  document.getElementById('cvFileInput').click()
};
EMP_H["document_getElementById_expEnd_7f67"] = function (event) {
  document.getElementById('expEndMonth').disabled=this.checked;document.getElementById('expEndYear').disabled=this.checked
};
EMP_H["document_getElementById_expMod_89b8"] = function (event) {
  document.getElementById('expModal').close()
};
EMP_H["document_getElementById_formMo_629a"] = function (event) {
  document.getElementById('formModal').close()
};
EMP_H["document_getElementById_frmEnd_7d98"] = function (event) {
  document.getElementById('frmEnd').disabled=this.checked
};
EMP_H["document_getElementById_prefsM_8bc2"] = function (event) {
  document.getElementById('prefsModal').close()
};
EMP_H["exportProfileText"] = function (event) {
  exportProfileText()
};
EMP_H["importCV_this_6bcc"] = function (event) {
  importCV(this)
};
EMP_H["importLinkedIn"] = function (event) {
  importLinkedIn()
};
EMP_H["openExpModal"] = function (event) {
  openExpModal()
};
EMP_H["openExpModal_this_getAttribute_8105"] = function (event) {
  openExpModal(this.getAttribute("data-arg-5a54-0"))
};
EMP_H["openFormModal"] = function (event) {
  openFormModal()
};
EMP_H["openFormModal_this_getAttribut_7911"] = function (event) {
  openFormModal(this.getAttribute("data-arg-5e81-0"))
};
EMP_H["openPrefsModal"] = function (event) {
  openPrefsModal()
};
EMP_H["removeSkill_this_17cf"] = function (event) {
  removeSkill(this)
};
EMP_H["saveExp"] = function (event) {
  saveExp()
};
EMP_H["saveFrm"] = function (event) {
  saveFrm()
};
EMP_H["savePrefs"] = function (event) {
  savePrefs()
};
EMP_H["saveProfile"] = function (event) {
  saveProfile()
};
EMP_H["showSection_competences_this_5581"] = function (event) {
  showSection('competences', this)
};
EMP_H["showSection_documents_this_c81c"] = function (event) {
  showSection('documents', this)
};
EMP_H["showSection_experience_this_799e"] = function (event) {
  showSection('experience', this)
};
EMP_H["showSection_formation_this_ff67"] = function (event) {
  showSection('formation', this)
};
EMP_H["showSection_infos_this_1e1e"] = function (event) {
  showSection('infos', this)
};
EMP_H["showSection_preferences_this_f31d"] = function (event) {
  showSection('preferences', this)
};
EMP_H["showSection_securite_this_16ac"] = function (event) {
  showSection('securite', this)
};
EMP_H["toggleLinkedInImport"] = function (event) {
  toggleLinkedInImport()
};
EMP_H["togglePref_alertToggle_alertEm_00c9"] = function (event) {
  togglePref('alertToggle','alertEmails')
};
EMP_H["togglePref_visibleToggle_profi_4e2a"] = function (event) {
  togglePref('visibleToggle','profileVisible')
};
