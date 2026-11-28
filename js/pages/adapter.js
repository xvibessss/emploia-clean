/* /adapter — adaptation guidée du CV, une suggestion à la fois.
   Les suggestions viennent de /api/generate/adaptation-guidee, déjà vérifiées
   par le serveur (extrait réel du CV, aucune compétence ni chiffre inventé).
   Les compétences de l'offre absentes du CV sont posées en QUESTIONS : rien
   ne s'ajoute sans un « oui ». Aucun gestionnaire en ligne. */
(function () {
  'use strict';
  window.empGarderApresInscription = true; // voir empSubmitRegister dans shared.js
  const $ = (id) => document.getElementById(id);
  const etat = {
    user: null, cv: '', cvInitial: '', offre: '', titreOffre: '', pret: null,
    suggestions: [], questions: [], motifs: [], etape: 0, acceptees: [], scoreInitial: null,
  };
  const params = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.slice(1));

  // Même lecture que api/_lib/competences.js : minuscules, sans accents.
  const normaliser = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&amp;|&#\d+;/g, ' ').replace(/[’']/g, "'").replace(/\s+/g, ' ');

  // ── Score : part des compétences de l'offre que le CV cite ───────────────
  function calculerScore() {
    if (!etat.motifs.length) return null;
    const t = normaliser(etat.cv);
    const couvertes = etat.motifs.filter((m) => new RegExp(m.re, 'i').test(t));
    return { v: Math.round((100 * couvertes.length) / etat.motifs.length), n: couvertes.length, total: etat.motifs.length };
  }
  function afficherScore() {
    const s = calculerScore();
    $('adScore').hidden = !s;
    if (!s) return;
    const anneau = $('adAnneau');
    anneau.style.setProperty('--v', s.v);
    anneau.style.setProperty('--c', s.v >= 75 ? '#16A34A' : s.v >= 50 ? '#D97706' : '#DC2626');
    $('adScoreNb').textContent = s.v;
    $('adScoreLib').textContent = `Score de correspondance · ${s.v >= 75 ? 'Très bon' : s.v >= 50 ? 'Bon' : 'À renforcer'}`;
    $('adScoreDetail').textContent = `${s.n} compétence${s.n > 1 ? 's' : ''} de l'offre sur ${s.total} citée${s.n > 1 ? 's' : ''} par ton CV`;
  }

  // ── Aperçu, avec les passages modifiés surlignés ─────────────────────────
  function afficherApercu() {
    let html = esc(etat.cv);
    for (const a of etat.acceptees) {
      const e = esc(a);
      if (e.trim().length > 2) html = html.split(e).join(`<mark>${e}</mark>`);
    }
    $('adApercu').innerHTML = html;
  }

  // ── Chat ─────────────────────────────────────────────────────────────────
  function bulle(html, moi = false) {
    const d = document.createElement('div');
    d.className = 'ad-bulle' + (moi ? ' moi' : '');
    d.innerHTML = html;
    $('adChat').appendChild(d);
    d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return d;
  }
  function etapeSuivante() {
    const ns = etat.suggestions.length;
    const i = etat.etape;
    if (i < ns) return carteSuggestion(etat.suggestions[i], i);
    if (i < ns + etat.questions.length) return carteQuestion(etat.questions[i - ns], i);
    terminer();
  }
  function carteSuggestion(s, i) {
    const d = document.createElement('div');
    d.className = 'ad-carte'; d.id = 'adCarte' + i;
    d.innerHTML = `<span class="ad-section">${esc(s.section)}</span>
      ${s.avant ? `<p class="ad-avant">${esc(s.avant)}</p>` : '<p class="ad-avant" style="text-decoration:none">Ajout</p>'}
      <textarea class="ad-apres" id="adApres${i}" aria-label="Version proposée, modifiable">${esc(s.apres)}</textarea>
      ${s.pourquoi ? `<p class="ad-pourquoi">💡 ${esc(s.pourquoi)}</p>` : ''}
      <div class="ad-boutons"><button class="oui" data-i="${i}" data-on-click="adAccepter">Accepter</button><button data-i="${i}" data-on-click="adRefuser">Refuser</button></div>`;
    $('adChat').appendChild(d);
    d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function carteQuestion(q, i) {
    const d = document.createElement('div');
    d.className = 'ad-carte'; d.id = 'adCarte' + i;
    d.innerHTML = `<span class="ad-section">Question</span>
      <p style="margin:0;font-size:14px;line-height:1.55">L'offre demande <strong>${esc(q.nom)}</strong> et ton CV n'en parle pas. L'as-tu vraiment déjà utilisé ou pratiqué ?</p>
      <div class="ad-boutons"><button class="oui" data-i="${i}" data-on-click="adOui">Oui, je le maîtrise</button><button data-i="${i}" data-on-click="adNon">Non</button></div>`;
    $('adChat').appendChild(d);
    d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function clore(i, texte, moi) {
    const c = $('adCarte' + i);
    if (c) { c.classList.add('faite'); c.querySelector('.ad-boutons')?.remove(); c.querySelector('textarea')?.setAttribute('readonly', ''); }
    if (texte) bulle(texte, moi);
    etat.etape = i + 1;
    afficherScore(); afficherApercu();
    setTimeout(etapeSuivante, 250);
  }

  // Remplace l'extrait tel qu'il est dans le CV, en tolérant les différences
  // d'espaces : l'IA a recopié l'extrait, pas forcément ses retours à la ligne.
  function remplacer(avant, apres) {
    if (etat.cv.includes(avant)) { etat.cv = etat.cv.replace(avant, apres); return true; }
    const motif = avant.trim().split(/\s+/).map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    const re = new RegExp(motif);
    if (!re.test(etat.cv)) return false;
    etat.cv = etat.cv.replace(re, apres);
    return true;
  }
  function accepter(i) {
    const s = etat.suggestions[i];
    const apres = ($('adApres' + i)?.value || s.apres).trim();
    if (!apres) return refuser(i);
    let ok = true;
    if (s.avant) ok = remplacer(s.avant, apres);
    else {
      const lignes = etat.cv.split('\n');
      if (s.section === 'Titre' || s.section === 'Profil') lignes.splice(1, 0, apres); else lignes.push('', apres);
      etat.cv = lignes.join('\n');
    }
    if (!ok) return clore(i, `Je n'ai pas retrouvé ce passage dans ton CV (tu l'as peut-être déjà modifié) : on passe.`);
    etat.acceptees.push(apres);
    clore(i, '✓ Accepté', true);
  }
  function refuser(i) { clore(i, 'Refusé', true); }

  function ajouterCompetence(nom) {
    const lignes = etat.cv.split('\n');
    const i = lignes.findIndex((l) => /^\s*(?:comp[ée]tences|skills|outils|logiciels)\b/i.test(l));
    if (i >= 0) {
      // Titre seul sur sa ligne : on ajoute à la ligne suivante ; sinon à la suite.
      const titreSeul = /^\s*(?:comp[ée]tences|skills|outils|logiciels)[^a-z0-9]*$/i.test(lignes[i]);
      const j = titreSeul && i + 1 < lignes.length && lignes[i + 1].trim() ? i + 1 : i;
      lignes[j] = lignes[j].replace(/\s*$/, '') + (titreSeul && j === i ? ' ' : ', ') + nom;
    } else lignes.push('', 'COMPÉTENCES', nom);
    etat.cv = lignes.join('\n');
    etat.acceptees.push(nom);
  }

  function terminer() {
    const s = calculerScore();
    const nb = etat.acceptees.length;
    const gain = s && etat.scoreInitial != null ? ` Ton score passe de <strong>${etat.scoreInitial}</strong> à <strong>${s.v}</strong>.` : '';
    bulle(`✨ <strong>Ton CV est prêt.</strong> ${nb ? `${nb} modification${nb > 1 ? 's' : ''} appliquée${nb > 1 ? 's' : ''}.` : 'Aucune modification appliquée.'}${gain} Relis-le une dernière fois dans l'aperçu avant de l'envoyer.`);
    $('adFin').hidden = false;
    $('adBtnPret').hidden = !etat.pret;
    if (window.matchMedia('(max-width: 820px)').matches) choisirVue('apercu');
  }

  // ── Démarrage ────────────────────────────────────────────────────────────
  async function commencer() {
    const cv = $('adCv').value.trim();
    const offre = $('adOffre').value.trim();
    if (cv.length < 120) return empToast('Colle ton CV complet (120 caractères au moins)', 'error');
    if (offre.length < 40) return empToast('Colle l\'offre visée', 'error');
    if (etat.user?.plan === 'free' && (etat.user.generationsUsed || 0) >= 5) { window.empShowUpgrade && window.empShowUpgrade(); return; }
    etat.cv = etat.cvInitial = cv; etat.offre = offre;
    const btn = $('adGo'); btn.disabled = true;
    $('adDepart').hidden = true; $('adTravail').hidden = false;
    $('adChat').innerHTML = ''; afficherApercu();
    const attente = bulle('<span class="ad-attente"><span class="ad-roue"></span>Je lis l\'offre et ton CV…</span>');
    try {
      const res = await fetch('/api/generate/adaptation-guidee', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cv, offre }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 401) { window.empShowAuth && window.empShowAuth('login'); throw new Error('Connecte-toi pour continuer'); }
      if (res.status === 402) { window.empShowUpgrade && window.empShowUpgrade(); throw new Error('Tes 5 générations gratuites sont utilisées'); }
      if (!res.ok) throw new Error(d.error || 'Adaptation impossible pour le moment');
      if (etat.user?.plan === 'free') etat.user.generationsUsed = (etat.user.generationsUsed || 0) + 1;
      attente.remove();
      etat.suggestions = d.suggestions || []; etat.questions = d.questions || []; etat.motifs = d.motifs || [];
      etat.etape = 0; etat.acceptees = [];
      etat.scoreInitial = calculerScore()?.v ?? null;
      afficherScore();
      bulle(esc(d.intro || 'On adapte ton CV à cette offre, une modification à la fois.')
        + (d.suggestions?.length ? '' : ' Ton CV reprend déjà bien les termes de l\'offre : je n\'ai que des questions à te poser.'));
      etapeSuivante();
    } catch (e) {
      attente.remove();
      bulle('⚠️ ' + esc(e.message));
      $('adDepart').hidden = false;
    } finally { btn.disabled = false; }
  }

  const texteOffre = (o, description) => [o.title && `Poste : ${o.title}`, o.company && `Entreprise : ${o.company}`,
    o.location && `Lieu : ${o.location}`, o.type && `Contrat : ${o.type}`, description && `\n${description}`].filter(Boolean).join('\n');

  async function prerempli(user) {
    etat.user = user || null;
    if (!etat.user) { $('adAuth').hidden = false; $('adDepart').hidden = true; return; }
    $('adAuth').hidden = true; $('adDepart').hidden = false;
    const idPret = params.get('pret');
    try {
      if (idPret) {
        const d = await (await fetch('/api/prets', { credentials: 'include' })).json();
        const p = (d.prets || []).find((x) => x.id === idPret);
        if (p) {
          etat.pret = p; etat.titreOffre = p.offre?.title || '';
          $('adCv').value = p.cv || ''; $('adOffre').value = texteOffre(p.offre || {}, p.description || '');
          return;
        }
      }
      const idOffre = params.get('offre_id');
      if (idOffre) {
        const r = await fetch('/api/offre?id=' + encodeURIComponent(idOffre));
        if (r.ok) { const o = await r.json(); $('adOffre').value = o.texte || ''; }
      } else if (hash.get('offre')) $('adOffre').value = hash.get('offre').slice(0, 8000);
      if (!$('adCv').value) {
        const r = await fetch('/api/profile', { credentials: 'include' });
        const p = r.ok ? await r.json() : {};
        $('adCv').value = p.profileText || localStorage.getItem('emploia_profile_text') || '';
      }
    } catch { /* préremplissage seulement */ }
  }

  let parti = false;
  const partir = (u) => { if (!parti || (u && !etat.user)) { parti = true; prerempli(u); } };
  window.addEventListener('empUserLoaded', (e) => partir(e.detail));
  window.addEventListener('empAuthChange', (e) => { if (e.detail?.user) { etat.user = null; partir(e.detail.user); } });
  if (window.empUser) partir(window.empUser);
  setTimeout(() => partir(window.empUser || null), 2500);

  function choisirVue(v) {
    $('adGrille').setAttribute('data-vue', v);
    document.querySelectorAll('.ad-onglet').forEach((b) => b.setAttribute('aria-selected', String(b.getAttribute('data-vue') === v)));
  }

  // ── Fin : PDF, copie, documents, Prêts à postuler ────────────────────────
  async function pdf() {
    if (!window.empConfirmIfIncomplete(etat.cv)) return;
    try {
      if (!window.jspdf) await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = '/vendor/jspdf-2.5.1.umd.min.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
      const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
      const marge = 18, largeur = doc.internal.pageSize.getWidth() - marge * 2;
      let y = marge + 5;
      for (const brut of etat.cv.split('\n')) {
        for (const ligne of doc.splitTextToSize(brut || ' ', largeur)) {
          if (y > 282) { doc.addPage(); y = marge; }
          doc.setFont('helvetica', /^[A-ZÀÉÈÊËÎÏÔÙÛÜ\s]{5,}$/.test(ligne.trim()) ? 'bold' : 'normal');
          doc.text(ligne, marge, y); y += 5.2;
        }
        if (!brut.trim()) y += 1;
      }
      doc.save('CV-adapte-Emploia.pdf');
      empToast('PDF téléchargé', 'success');
    } catch { empToast('PDF impossible pour le moment — utilise « Copier »', 'error'); }
  }
  function copier() {
    if (!window.empConfirmIfIncomplete(etat.cv)) return;
    navigator.clipboard.writeText(etat.cv).then(() => empToast('CV copié', 'success')).catch(() => empToast('Copie impossible', 'error'));
  }
  async function enregistrer() {
    const nomDoc = `CV adapté${etat.titreOffre ? ' — ' + etat.titreOffre.slice(0, 50) : ''} · ${new Date().toLocaleDateString('fr-FR')}`;
    const r = await fetch('/api/cv-versions', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nomDoc, content: etat.cv, type: 'cv' }) }).catch(() => null);
    if (r?.ok) { empToast('Enregistré dans tes documents', 'success'); $('adBtnEnregistrer').textContent = '✓ Enregistré'; }
    else if (r?.status === 402) empToast('Limite de documents atteinte — passe Pro pour en garder 20', 'error');
    else empToast('Enregistrement impossible', 'error');
  }
  async function majPret() {
    if (!etat.pret) return;
    const r = await fetch('/api/prets', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: etat.pret.id, cv: etat.cv }) }).catch(() => null);
    if (r?.ok) { empToast('CV mis à jour dans Prêts à postuler', 'success'); $('adBtnPret').textContent = '✓ Mis à jour'; }
    else empToast('Mise à jour impossible', 'error');
  }

  EMP_H['adInscription'] = function () { window.empShowAuth && window.empShowAuth('register'); };
  EMP_H['adCommencer'] = function () { commencer(); };
  EMP_H['adAccepter'] = function () { accepter(Number(this.getAttribute('data-i'))); };
  EMP_H['adRefuser'] = function () { refuser(Number(this.getAttribute('data-i'))); };
  EMP_H['adOui'] = function () {
    const i = Number(this.getAttribute('data-i'));
    const q = etat.questions[i - etat.suggestions.length];
    if (q) ajouterCompetence(q.nom);
    clore(i, `Oui — ${esc(q?.nom || '')} ajouté à tes compétences`, true);
  };
  EMP_H['adNon'] = function () { clore(Number(this.getAttribute('data-i')), 'Non — on n\'ajoute rien', true); };
  EMP_H['adVue'] = function () { choisirVue(this.getAttribute('data-vue')); };
  EMP_H['adPdf'] = function () { pdf(); };
  EMP_H['adCopier'] = function () { copier(); };
  EMP_H['adEnregistrer'] = function () { enregistrer(); };
  EMP_H['adMajPret'] = function () { majPret(); };
})();
