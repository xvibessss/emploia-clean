  let mode = 'cv';
  let lastResult = null;

  function setMode(card, m) {
    document.querySelectorAll('.app-mode-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    mode = m;
    if (m === 'ats') {
      document.getElementById('profileGroup').style.display = 'none';
      document.getElementById('cvGroup').style.display = 'block';
      document.getElementById('leftTitle').textContent = "Collez votre CV pour l'analyser";
    } else {
      document.getElementById('profileGroup').style.display = 'block';
      document.getElementById('cvGroup').style.display = 'none';
      document.getElementById('leftTitle').textContent = m === 'letter' ? "Détails pour la lettre" : "Décrivez l'offre & votre profil";
    }
    resetResult();
  }

  function updateLen() {
    document.getElementById('jobLen').textContent = document.getElementById('jobInput').value.length + ' car.';
    document.getElementById('profLen').textContent = document.getElementById('profileInput').value.length + ' car.';
    document.getElementById('cvLen').textContent = document.getElementById('cvInput').value.length + ' car.';
  }

  function loadExample() {
    document.getElementById('jobInput').value = `Développeur Full-Stack Senior — TechCorp (Paris, Hybride)

Nous recherchons un développeur senior pour rejoindre notre équipe Plateforme. Vous travaillerez sur notre SaaS B2B utilisé par 50k+ utilisateurs.

Stack : React, TypeScript, Node.js, PostgreSQL, AWS
Expérience requise : 5+ ans

Missions :
- Concevoir et développer de nouvelles fonctionnalités
- Encadrer 2 développeurs juniors
- Améliorer les performances et la qualité du code
- Participer aux décisions techniques

Profil : autonomie, esprit d'équipe, anglais courant.`;
    document.getElementById('profileInput').value = `Marie Dupont, développeuse full-stack avec 6 ans d'expérience.

Expériences :
- Lead Développeuse @ StartupXYZ (2021-2024) : conception d'une plateforme SaaS, équipe de 4
- Développeuse Full-Stack @ AgenceABC (2019-2021) : sites e-commerce React/Node
- Stage Frontend @ BigCorp (2018) : refonte UI dashboard interne

Stack : React/Next.js, TypeScript, Node.js/Express, PostgreSQL, MongoDB, AWS, Docker

Formation : Master EPITA Génie Logiciel (2019)
Langues : Français natif, Anglais C1, Espagnol B1`;
    updateLen();
    empToast('Exemple chargé !', 'success');
  }

  function prefillJob(s) {
    document.getElementById('jobInput').value = s;
    document.getElementById('jobInput').focus();
    updateLen();
  }

  let feedbackSent = false;
  async function submitFeedback(rating) {
    if (feedbackSent) return;
    feedbackSent = true;
    const typeMap = { cv: 'cv', letter: 'cover-letter', ats: 'ats-score' };
    const fbLabel = document.getElementById('fbLabel');
    const fbUp = document.getElementById('fbUp');
    const fbDown = document.getElementById('fbDown');
    if (fbUp) fbUp.disabled = true;
    if (fbDown) fbDown.disabled = true;
    if (fbLabel) fbLabel.textContent = rating === 'up' ? 'Merci pour votre retour ! 🙏' : 'Merci, on va améliorer ça !';
    if (rating === 'up' && fbUp) { fbUp.style.background = '#f0ecf9'; fbUp.style.borderColor = 'var(--primary)'; }
    if (rating === 'down' && fbDown) { fbDown.style.background = '#fef2f2'; fbDown.style.borderColor = 'var(--error,#e74c3c)'; }
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: typeMap[mode] || mode, rating }),
      });
    } catch {}
  }

  function resetFeedback() {
    feedbackSent = false;
    const fbLabel = document.getElementById('fbLabel');
    const fbUp = document.getElementById('fbUp');
    const fbDown = document.getElementById('fbDown');
    if (fbLabel) fbLabel.textContent = 'Ce résultat vous a aidé ?';
    if (fbUp) { fbUp.disabled = false; fbUp.style.background = 'none'; fbUp.style.borderColor = 'var(--hairline)'; }
    if (fbDown) { fbDown.disabled = false; fbDown.style.background = 'none'; fbDown.style.borderColor = 'var(--hairline)'; }
  }

  async function generate() {
    const job = document.getElementById('jobInput').value.trim();
    const profile = document.getElementById('profileInput').value.trim();
    const cvText = document.getElementById('cvInput').value.trim();

    if (!job) return empToast('Veuillez décrire l\'offre d\'emploi', 'error');
    if (mode === 'ats' && !cvText) return empToast('Veuillez coller votre CV', 'error');
    if (mode !== 'ats' && !profile) return empToast('Veuillez décrire votre profil', 'error');

    if (window.empUser?.plan === 'free') {
      const used = window.empUser.generationsUsed || 0;
      if (used >= 5) { empShowUpgrade(); return; }
    }

    document.getElementById('genBtn').disabled = true;
    showLoading();

    try {
      const endpoints = { cv: '/api/generate/cv', letter: '/api/generate/cover-letter', ats: '/api/generate/ats-score' };
      const body = mode === 'ats' ? { jobOffer: job, cvText } : { jobOffer: job, profile };

      const res = await fetch(endpoints[mode], {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(body)
      });

      if (res.status === 401) { clearInterval(window._loadIntv); resetResult(); empShowAuth('login'); return; }
      if (res.status === 402) { clearInterval(window._loadIntv); resetResult(); empShowUpgrade(); return; }
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Erreur de génération'); }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream')) {
        clearInterval(window._loadIntv);
        const resultArea = document.getElementById('resultArea');
        resultArea.innerHTML = '<div class="app-result-content" style="flex:1"></div>';
        const contentEl = resultArea.querySelector('.app-result-content');
        document.getElementById('resultActions').style.display = 'block';
        document.getElementById('resultActionsBottom').style.display = 'block';
        updateNextStepLinks();

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '', fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.chunk) { fullText += parsed.chunk; contentEl.textContent = fullText; }
              if (parsed.done) {
                lastResult = fullText;
                renderRevision(fullText);
                if (window.empUser?.plan === 'free') { window.empUser.generationsUsed = (window.empUser.generationsUsed || 0) + 1; syncUsagePill(window.empUser); }
                if (window.plausible) plausible('generation_complete', { props: { type: mode } });
                if (window.trackEvent) trackEvent(mode === 'cv' ? 'cv_generated' : mode === 'letter' ? 'letter_generated' : 'ats_checked', { mode });
                setTimeout(showFloatingNudge, 2000);
              }
            } catch (e) { if (e.message !== 'Unexpected end of JSON input') throw e; }
          }
        }
      } else {
        const data = await res.json();
        const result = data.result || data;
        if (window.empUser?.plan === 'free') { window.empUser.generationsUsed = (window.empUser.generationsUsed || 0) + 1; syncUsagePill(window.empUser); }
        if (window.plausible) plausible('generation_complete', { props: { type: mode } });
        if (window.trackEvent) trackEvent(mode === 'cv' ? 'cv_generated' : mode === 'letter' ? 'letter_generated' : 'ats_checked', { mode });
        showResult(result);
      }
    } catch (e) {
      showError(e.message || 'Erreur de génération');
    } finally {
      document.getElementById('genBtn').disabled = false;
    }
  }

  function showLoading() {
    const steps = mode === 'ats'
      ? ['Analyse du CV...', 'Comparaison avec l\'offre...', 'Calcul du score...', 'Génération des recommandations...']
      : ['Analyse de l\'offre...', 'Identification des mots-clés...', 'Adaptation du profil...', 'Rédaction du contenu...', 'Optimisation ATS...'];
    document.getElementById('resultArea').innerHTML = `<div class="app-result-loading"><div class="app-spinner"></div><div class="app-loading-text">L'IA travaille pour vous</div><div class="app-loading-step" id="loadStep">${steps[0]}</div></div>`;
    let i = 0;
    const intv = setInterval(() => { i++; if (i >= steps.length) { clearInterval(intv); return; } const el = document.getElementById('loadStep'); if (el) el.textContent = steps[i]; }, 700);
    window._loadIntv = intv;
  }

  async function shareAtsScore(score) {
    try {
      const res = await fetch('/api/share-score', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score, jobTitle: '', userId: window.empUser?.id || '' }) });
      const data = await res.json();
      if (data.url) { if (navigator.clipboard) await navigator.clipboard.writeText(data.url).catch(() => {}); window.open(data.url, '_blank', 'noopener'); }
    } catch {}
  }

  function updateNextStepLinks() {
    const jobVal = (document.getElementById('jobInput')?.value || '').split('\n')[0].slice(0, 80).trim();
    const p = jobVal ? `&job=${encodeURIComponent(jobVal)}` : '';
    const links = [
      ['prepInterviewLink', `/tools?tab=questions${p}`],
      ['prepRelanceLink', `/tools?tab=relance${p}`],
      ['prepNegocLink', `/tools?tab=negociation${p}`],
    ];
    links.forEach(([id, href]) => { const el = document.getElementById(id); if (el) el.href = href; });
  }

  function showResult(result) {
    clearInterval(window._loadIntv);
    lastResult = result;
    document.getElementById('resultActions').style.display = 'block';
    document.getElementById('resultActionsBottom').style.display = 'block';
    resetFeedback();
    updateNextStepLinks();

    if (mode === 'ats') {
      const score = result.score ?? 0;
      const grade = score >= 85 ? 'Excellent' : score >= 70 ? 'Très bon' : score >= 55 ? 'Correct' : 'À améliorer';
      const color = score >= 70 ? 'var(--success)' : score >= 55 ? 'var(--warning)' : 'var(--error)';
      try { const KEY = 'emploia_scores_history'; const hist = JSON.parse(localStorage.getItem(KEY) || '[]'); hist.push({ type: 'ats', ts: Date.now(), score }); localStorage.setItem(KEY, JSON.stringify(hist.slice(-50))); } catch {}
      document.getElementById('resultArea').innerHTML = `
        <div class="app-ats-display">
          <div class="app-ats-ring" style="background:conic-gradient(${color} ${score*3.6}deg,var(--hairline) 0)">
            <span class="app-ats-num" style="color:${color}">${score}<span style="font-size:16px">%</span></span>
          </div>
          <div class="app-ats-grade" style="color:${color}">${grade}</div>
          ${Array.isArray(result.bars) && result.bars.length ? `<div class="app-ats-bars">${result.bars.map(b => { const bv = Math.min(100, Math.max(0, Number(b.val) || 0)); return `<div class="app-ats-bar"><div class="app-ats-bar-name">${esc(String(b.name||''))}</div><div class="app-ats-bar-track"><div class="app-ats-bar-fill" style="width:${bv}%;background:${color}"></div></div><div class="app-ats-bar-num">${bv}%</div></div>`; }).join('')}</div>` : ''}
          ${Array.isArray(result.recommendations) && result.recommendations.length ? `<div style="margin-top:16px;width:100%;background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--r-lg);padding:14px"><h4 style="font-size:11px;font-weight:700;color:var(--ink);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Recommandations</h4><ul style="margin:0 0 0 16px;padding:0;display:flex;flex-direction:column;gap:4px">${result.recommendations.map(r => `<li style="font-size:12px;color:var(--slate);line-height:1.7">${esc(String(r))}</li>`).join('')}</ul></div>` : ''}
          ${score >= 75 ? `<button data-on-click="shareAtsScore_JSON_parse_this_ffe1" data-arg-8595-0="${esc(JSON.stringify(score))}" class="emp-btn emp-btn-secondary" style="margin-top:14px;font-size:12px;padding:8px 16px">Partager mon score</button>` : ''}
        </div>`;
    } else {
      const rawText = typeof result === 'string' ? result : (result.result || result.text || JSON.stringify(result));
      const resultArea = document.getElementById('resultArea');
      resultArea.innerHTML = '<div class="app-result-content" style="flex:1"></div>';
      resultArea.querySelector('.app-result-content').textContent = rawText;
    }
  }

  function showError(msg) {
    clearInterval(window._loadIntv);
    document.getElementById('resultArea').innerHTML = `<div class="app-result-empty" style="color:var(--error)"><div class="app-result-empty-icon">⚠️</div><h3 style="color:var(--error)">Erreur de génération</h3><p style="color:var(--slate)">${esc(String(msg))}</p><button class="emp-btn emp-btn-secondary" data-on-click="generate" style="margin-top:14px;font-size:12px">Réessayer</button></div>`;
  }

  function resetResult() {
    lastResult = null;
    document.getElementById('resultArea').innerHTML = `<div class="app-result-empty"><div class="app-result-empty-icon">✨</div><h3>En attente de génération</h3><p>Remplissez les champs à gauche puis cliquez sur "Générer".</p></div>`;
    document.getElementById('resultActions').style.display = 'none';
    document.getElementById('resultActionsBottom').style.display = 'none';
  }

  function showFloatingNudge() {
    if (document.getElementById('empFloatNudge')) return;
    const user = window.empUser;
    if (!user || user.plan !== 'free') return;
    const used = user.generationsUsed || 0;
    if (used < 2) return;
    const dismissed = localStorage.getItem('emp_nudge_dismissed');
    if (dismissed && Date.now() - Number(dismissed) < 86400000) return;
    const remaining = 5 - used;
    const nudge = document.createElement('div');
    nudge.id = 'empFloatNudge';
    nudge.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;width:300px;background:var(--canvas);border:1.5px solid var(--hairline);border-radius:var(--r-xl);box-shadow:var(--sh-3);padding:18px 18px 14px;animation:fadeUp .4s var(--ease)';
    nudge.innerHTML = `<button data-on-click="function_localStorage_setItem_e327" style="position:absolute;top:10px;right:12px;background:none;border:none;cursor:pointer;font-size:16px;color:var(--stone);line-height:1">✕</button><div style="font-size:18px;margin-bottom:6px">🚀</div><div style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:4px">${remaining === 1 ? 'Dernière génération gratuite !' : `Plus que ${remaining} générations gratuites`}</div><div style="font-size:11px;color:var(--slate);line-height:1.5;margin-bottom:12px">Passez Pro pour générer autant de CVs que vous voulez — sans limite, sans attente.</div><button data-on-click="empShowUpgrade_document_getEle_e752" class="emp-btn emp-btn-primary" style="width:100%;padding:10px;font-size:13px">Essai Pro gratuit 7j</button><div style="text-align:center;font-size:10px;color:var(--stone);margin-top:6px">0€ aujourd'hui · Annulation en 1 clic</div>`;
    document.body.appendChild(nudge);
    if (window.plausible) plausible('float_nudge_shown', { props: { used: String(used) } });
    setTimeout(() => { document.getElementById('empFloatNudge')?.remove(); }, 18000);
  }

  // ── Mode révision : lister les [à compléter] avant export ──
  // L'implémentation vit dans shared.js (empRevisionPanel / empPlaceholders)
  // pour que tools.html applique exactement la même détection : la version
  // locale d'ici était la seule à exister, et les outils exportaient sans
  // garde-fou.
  function renderRevision(text) {
    const area = document.getElementById('resultArea');
    if (!area) return;
    // Hors CV et lettre, le marqueur entre crochets n'est pas un champ à
    // remplir : on retire le panneau plutôt que de l'afficher à tort.
    window.empRevisionPanel(area, mode === 'cv' || mode === 'letter' ? text : '');
  }
  function confirmIfIncomplete() {
    return window.empConfirmIfIncomplete(typeof lastResult === 'string' ? lastResult : '');
  }

  function copyResult() {
    if (!lastResult) return;
    if (!confirmIfIncomplete()) return;
    const txt = typeof lastResult === 'string' ? lastResult : JSON.stringify(lastResult, null, 2);
    navigator.clipboard.writeText(txt).then(() => empToast('Copié dans le presse-papier !', 'success')).catch(() => empToast('Copie impossible — utilisez Ctrl+C', 'error'));
  }

  async function saveToVault() {
    if (!lastResult) return;
    if (!window.empUser) { empShowAuth('login'); return; }
    if (!confirmIfIncomplete()) return;
    const txt = typeof lastResult === 'string' ? lastResult : (lastResult.result || lastResult.text || JSON.stringify(lastResult, null, 2));
    const modeLabel = { cv: 'CV', letter: 'Lettre de motivation', ats: 'Analyse ATS' }[mode] || mode;
    const jobVal = (document.getElementById('jobInput')?.value || '').slice(0, 60).trim();
    const name = `${modeLabel}${jobVal ? ' — ' + jobVal : ''} · ${new Date().toLocaleDateString('fr-FR')}`;
    const type = mode === 'letter' ? 'letter' : 'cv';
    const btn = document.getElementById('saveVaultBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sauvegarde…'; }
    try {
      const res = await fetch('/api/cv-versions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content: txt, type }),
      });
      const d = await res.json();
      if (!res.ok) {
        if (res.status === 402) return empToast('Limite de 3 docs atteinte — passez Pro pour 20 documents', 'error');
        return empToast(d.error || 'Erreur de sauvegarde', 'error');
      }
      empToast('Sauvegardé dans vos documents !', 'success');
      if (btn) btn.textContent = '✅ Sauvegardé';
    } catch { empToast('Erreur réseau', 'error'); }
    finally { if (btn) btn.disabled = false; }
  }

  async function downloadResult() {
    if (!lastResult) return;
    if (!confirmIfIncomplete()) return;
    const txt = typeof lastResult === 'string' ? lastResult : JSON.stringify(lastResult, null, 2);
    empToast('Génération du PDF…', 'info');
    try {
      if (!window.jspdf) {
        await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
      const margin = 18, pageW = doc.internal.pageSize.getWidth(), maxW = pageW - margin * 2;
      const lines = txt.split('\n');
      let y = margin + 5;
      for (const rawLine of lines) {
        const wrapped = doc.splitTextToSize(rawLine || ' ', maxW);
        for (const wl of wrapped) {
          if (y > 282) { doc.addPage(); y = margin; }
          const isBold = /^━+/.test(wl) || /^[A-ZÀÉÈÊËÎÏÔÙÛÜ\s]{5,}$/.test(wl.trim());
          doc.setFont('helvetica', isBold ? 'bold' : 'normal');
          doc.text(wl, margin, y); y += 5.2;
        }
        if (!rawLine.trim()) y += 1;
      }
      const label = mode === 'cv' ? 'CV' : mode === 'letter' ? 'Lettre-Motivation' : mode;
      doc.save(`Emploia-${label}-${Date.now()}.pdf`);
      empToast('PDF téléchargé !', 'success');
    } catch {
      const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `emploia-${mode}.txt`; a.click();
      empToast('Téléchargé (format texte)', 'info');
    }
  }

  // ── PROFILE SAVE / RESTORE ──────────────────────────────────────────────
  let profileSaveTimer = null;
  function scheduleProfileSave() { clearTimeout(profileSaveTimer); profileSaveTimer = setTimeout(saveProfile, 2000); }
  function saveProfile() {
    const profile = document.getElementById('profileInput').value.trim();
    if (!profile) return;
    localStorage.setItem('emploia_profile_text', profile);
    document.getElementById('profileSavedBadge').style.display = 'block';
    fetch('/api/profile', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileText: profile }) }).catch(() => {});
  }
  function restoreProfile() {
    const saved = localStorage.getItem('emploia_profile_text');
    if (saved && !document.getElementById('profileInput').value) {
      document.getElementById('profileInput').value = saved;
      document.getElementById('profileSavedBadge').style.display = 'block';
      updateLen();
    }
  }

  updateLen();
  restoreProfile();

  // ── USAGE PILL SYNC ─────────────────────────────────────────────────────
  function syncUsagePill(user) {
    const pill = document.getElementById('usagePill');
    if (!pill || !user) return;
    const used = user.generationsUsed || 0;
    const limit = 5;
    const remaining = limit - used;
    if (user.plan !== 'free') {
      pill.innerHTML = `⭐ Plan ${user.plan === 'intensif' ? 'Intensif' : 'Pro'} · générations illimitées`;
      if (user.planActivatedAt) {
        const daysPro = (Date.now() - new Date(user.planActivatedAt).getTime()) / 86400000;
        const daysLeft = Math.ceil(7 - daysPro);
        if (daysPro < 7 && daysLeft > 0) {
          const trialBanner = document.createElement('div');
          trialBanner.style.cssText = 'background:var(--tint-rose);border:1px solid #f0c0cb;border-radius:var(--r-lg);padding:10px 16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;max-width:720px;margin-left:auto;margin-right:auto';
          trialBanner.innerHTML = `<span>Essai Pro — <strong style="color:var(--brand-pink-deep)">${daysLeft} jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''}</strong> · Vous serez débité 24€/mois à l'issue de l'essai.</span><a href="/api/stripe-portal" style="font-size:12px;color:var(--brand-pink-deep);font-weight:700;text-decoration:none;white-space:nowrap">Gérer</a>`;
          const appHeader = document.querySelector('.app-wrap');
          if (appHeader) appHeader.insertBefore(trialBanner, appHeader.firstChild);
        }
      }
    } else if (remaining <= 0) {
      pill.innerHTML = `<span style="color:var(--error)">Limite atteinte</span> · <button data-on-click="empShowUpgrade" style="color:var(--primary);font-weight:700;background:none;border:none;cursor:pointer;font-size:12px;padding:0">Passer Pro</button>`;
    } else if (remaining <= 2) {
      pill.innerHTML = `<span style="color:var(--warning)"><strong>${remaining}</strong> génération${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}</span> · <button data-on-click="empShowUpgrade" style="color:var(--primary);font-weight:700;background:none;border:none;cursor:pointer;font-size:12px;padding:0">Passer Pro</button>`;
      setTimeout(showFloatingNudge, 3000);
    } else {
      pill.innerHTML = `✨ <span><strong>${used}</strong> / ${limit} générations gratuites</span> <button data-on-click="empShowUpgrade" style="color:var(--primary);font-weight:700;background:none;border:none;cursor:pointer;font-size:12px;padding:0;margin-left:8px">Passer Pro</button>`;
      if (used >= 2) setTimeout(showFloatingNudge, 5000);
    }
  }
  window.addEventListener('empUserLoaded', e => { if (e.detail) syncUsagePill(e.detail); });
  setTimeout(() => syncUsagePill(window.empUser), 800);

  // Pre-fill from sessionStorage (from /jobs)
  const prefill = sessionStorage.getItem('emp_prefill');
  if (prefill) {
    try {
      const data = JSON.parse(prefill);
      document.getElementById('jobInput').value = `${data.title}${data.company ? ` — ${data.company}` : ''}\n\n${data.desc || ''}`;
      sessionStorage.removeItem('emp_prefill');
      updateLen();
      empToast('Offre pré-remplie depuis la liste', 'success');
    } catch(e) {}
  }

  // Pre-fill from ?offre= URL param
  const urlP = new URLSearchParams(window.location.search);
  const offreParam = urlP.get('offre');
  if (offreParam && !prefill) {
    const jobInput = document.getElementById('jobInput');
    if (jobInput && !jobInput.value.trim()) {
      jobInput.value = offreParam; // déjà décodé par URLSearchParams — un second decodeURIComponent levait URIError sur un « % » littéral
      updateLen();
      history.replaceState(null, '', '/app');
    }
  }

  // ── KEYBOARD SHORTCUT: Cmd/Ctrl+Enter to generate ──────────────────
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      const btn = document.getElementById('genBtn');
      if (btn && !btn.disabled) generate();
    }
  });

  // Success banner after Stripe redirect
  if (urlP.get('success') === '1') {
    history.replaceState(null, '', '/app');
    const showProBanner = () => {
      const banner = document.createElement('div');
      banner.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:1000;background:var(--success);color:#fff;padding:14px 28px;border-radius:var(--r-xl);font-size:14px;font-weight:600;box-shadow:0 8px 32px rgba(47,143,78,.4);display:flex;align-items:center;gap:12px;max-width:92vw';
      banner.innerHTML = `<span style="font-size:22px">🎉</span><div><div>Bienvenue dans le Plan Pro !</div><div style="font-weight:400;font-size:12px;opacity:.9;margin-top:2px">Générations illimitées activées — profitez de vos 7 jours d'essai.</div></div><button data-on-click="this_parentElement_remove_3ee9" style="background:none;border:none;color:#fff;cursor:pointer;font-size:18px;margin-left:8px;opacity:.7">✕</button>`;
      document.body.appendChild(banner);
      setTimeout(() => banner?.remove(), 10000);
    };
    let polls = 0;
    const pollPlan = setInterval(async () => {
      polls++;
      if (polls > 5) { clearInterval(pollPlan); showProBanner(); return; }
      try {
        const r = await fetch('/api/auth/me', { credentials: 'include' });
        if (r.ok) {
          const d = await r.json();
          if (d.user?.plan === 'pro') {
            clearInterval(pollPlan);
            window.empUser = d.user;
            if (typeof empUpdateNav === 'function') empUpdateNav(d.user);
            syncUsagePill(d.user);
            showProBanner();
          }
        }
      } catch {}
    }, 2000);
  }

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["copyResult"] = function (event) {
  copyResult()
};
EMP_H["downloadResult"] = function (event) {
  downloadResult()
};
EMP_H["empShowUpgrade"] = function (event) {
  empShowUpgrade()
};
EMP_H["empShowUpgrade_document_getEle_e752"] = function (event) {
  empShowUpgrade();document.getElementById('empFloatNudge')?.remove();if(window.plausible)plausible('float_nudge_cta_click')
};
EMP_H["function_localStorage_setItem_e327"] = function (event) {
  (function(){localStorage.setItem('emp_nudge_dismissed',Date.now());document.getElementById('empFloatNudge')?.remove()})()
};
EMP_H["generate"] = function (event) {
  generate()
};
EMP_H["loadExample"] = function (event) {
  loadExample()
};
EMP_H["prefillJob_Consultant_Marketin_d6e9"] = function (event) {
  prefillJob('Consultant Marketing Digital')
};
EMP_H["prefillJob_Data_Analyst_Junior_04b3"] = function (event) {
  prefillJob('Data Analyst Junior — Finance')
};
EMP_H["prefillJob_Dev_Frontend_Senior_2697"] = function (event) {
  prefillJob('Dev Frontend Senior — TechCorp Paris')
};
EMP_H["prefillJob_Product_Manager_Saa_6350"] = function (event) {
  prefillJob('Product Manager — SaaS B2B')
};
EMP_H["saveProfile"] = function (event) {
  saveProfile()
};
EMP_H["saveToVault"] = function (event) {
  saveToVault()
};
EMP_H["setMode_this_ats_0ed4"] = function (event) {
  setMode(this,'ats')
};
EMP_H["setMode_this_cv_cdbc"] = function (event) {
  setMode(this,'cv')
};
EMP_H["setMode_this_letter_e1e1"] = function (event) {
  setMode(this,'letter')
};
EMP_H["shareAtsScore_JSON_parse_this_ffe1"] = function (event) {
  shareAtsScore(JSON.parse(this.getAttribute("data-arg-8595-0")))
};
EMP_H["submitFeedback_down_2b69"] = function (event) {
  submitFeedback('down')
};
EMP_H["submitFeedback_up_fd75"] = function (event) {
  submitFeedback('up')
};
EMP_H["this_parentElement_remove_3ee9"] = function (event) {
  this.parentElement.remove()
};
EMP_H["updateLen"] = function (event) {
  updateLen()
};
EMP_H["updateLen_scheduleProfileSave_3e7c"] = function (event) {
  updateLen(); scheduleProfileSave()
};
EMP_H["window_location_href_cv_builde_1d69"] = function (event) {
  window.location.href='/cv-builder'
};
