/* /decouvrir — une offre à la fois ; « Adapter mon CV » la met dans une file
   qui génère en arrière-plan pendant qu'on continue à faire défiler.
   Les CV adaptés vont dans « Prêts à postuler » (api/prets.js).

   Aucun gestionnaire en ligne : les boutons portent data-on-click, les
   fonctions sont dans EMP_H (moteur en tête de shared.js). */
(function () {
  'use strict';
  window.empGarderApresInscription = true; // voir empSubmitRegister dans shared.js

  const CLE_VUS = 'emploia_decouvrir_vus';
  const CLE_CIBLE = 'emploia_decouvrir_cible';
  const MAX_VUS = 600;
  const GRATUIT = 5;

  const $ = (id) => document.getElementById(id);
  const lireJSON = (cle, defaut) => { try { return JSON.parse(localStorage.getItem(cle)) ?? defaut; } catch { return defaut; } };
  const ecrireJSON = (cle, v) => { try { localStorage.setItem(cle, JSON.stringify(v)); } catch { /* navigation privée */ } };

  const etat = {
    user: null,
    parcours: '',
    cible: lireJSON(CLE_CIBLE, { metier: '', ville: '' }),
    offres: [],
    page: 0,
    plusDOffres: true,
    vus: new Set(lireJSON(CLE_VUS, [])),
    file: [],          // offres en attente d'adaptation
    enCours: null,     // offre en cours d'adaptation
    prets: [],
    ouvert: null,      // id du prêt affiché dans le panneau
  };

  // ── Petites aides ────────────────────────────────────────────────────────
  const COULEURS = ['#6E48BE', '#2563EB', '#0F766E', '#B45309', '#BE185D', '#4338CA', '#15803D', '#9333EA'];
  function couleur(nom) {
    let h = 0;
    for (const c of String(nom || '?')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return COULEURS[h % COULEURS.length];
  }
  function logo(nom, classe = 'dc-logo') {
    const lettre = (String(nom || '?').trim()[0] || '?').toUpperCase();
    return `<div class="${classe}" style="background:${couleur(nom)}" aria-hidden="true">${esc(lettre)}</div>`;
  }
  function depuis(date) {
    const t = Date.parse(date);
    if (!t) return '';
    const j = Math.floor((Date.now() - t) / 86400000);
    return j <= 0 ? "aujourd'hui" : j === 1 ? 'hier' : `il y a ${j} j`;
  }
  const vrai = (v) => v && v !== 'None' && v !== 'null';
  function texteOffre(o) {
    return [
      o.title && `Poste : ${o.title}`,
      o.company && `Entreprise : ${o.company}`,
      o.location && `Lieu : ${o.location}`,
      vrai(o.type) && `Contrat : ${o.type}`,
      vrai(o.salary) && `Salaire : ${o.salary}`,
      o.description && `\n${String(o.description).slice(0, 7000)}`,
    ].filter(Boolean).join('\n');
  }
  function marquerVu(id) {
    if (!id) return;
    etat.vus.add(id);
    ecrireJSON(CLE_VUS, [...etat.vus].slice(-MAX_VUS));
  }
  function generationsRestantes() {
    const u = etat.user;
    if (!u || u.plan !== 'free') return Infinity;
    const enAttente = etat.file.length + (etat.enCours ? 1 : 0);
    return GRATUIT - (u.generationsUsed || 0) - enAttente;
  }

  // ── Vues ─────────────────────────────────────────────────────────────────
  function montrer(vue) {
    for (const id of ['dcAuth', 'dcReglages', 'dcFlux', 'dcPrets']) $(id).hidden = id !== vue;
    const prets = vue === 'dcPrets';
    $('dcOngletFlux').setAttribute('aria-selected', String(!prets));
    $('dcOngletPrets').setAttribute('aria-selected', String(prets));
  }
  function vueFlux() {
    if (!etat.user) return montrer('dcAuth');
    if (!etat.parcours || !etat.cible.metier) return ouvrirReglages();
    montrer('dcFlux');
    $('dcCibleTexte').innerHTML = `<strong>${esc(etat.cible.metier)}</strong>${etat.cible.ville ? ' · ' + esc(etat.cible.ville) : ''}`;
    if (!etat.offres.length) chargerOffres(); else afficherCarte();
  }
  function ouvrirReglages() {
    montrer('dcReglages');
    $('dcParcours').value = etat.parcours;
    $('dcMetier').value = etat.cible.metier;
    $('dcVille').value = etat.cible.ville;
  }
  function majCompteur() {
    const n = etat.prets.filter((p) => p.statut !== 'postule').length;
    $('dcNbPrets').textContent = String(n);
    document.title = (n ? `(${n}) ` : '') + 'Découvrir — Emploia';
  }

  // ── Offres ───────────────────────────────────────────────────────────────
  async function chargerOffres() {
    $('dcPile').innerHTML = `<div class="dc-vide"><div class="dc-emoji">🔎</div><p>Recherche d'offres pour ${esc(etat.cible.metier)}…</p></div>`;
    $('dcActions').hidden = true;
    const deja = new Set(etat.prets.map((p) => p.offre?.id));
    const p = new URLSearchParams({ q: etat.cible.metier, location: etat.cible.ville || '', limit: '50', page: String(etat.page) });
    try {
      const r = await fetch('/api/jobs?' + p, { credentials: 'include' });
      const d = await r.json();
      const nouvelles = (d.jobs || []).filter((o) => o.id && !etat.vus.has(o.id) && !deja.has(o.id));
      etat.plusDOffres = (d.jobs || []).length > 0 && etat.page < 9;
      etat.offres.push(...nouvelles);
      if (!etat.offres.length && etat.plusDOffres) { etat.page++; return chargerOffres(); }
    } catch {
      etat.plusDOffres = false;
    }
    afficherCarte();
  }

  function afficherCarte() {
    const o = etat.offres[0];
    const pile = $('dcPile');
    if (!o) {
      $('dcActions').hidden = true;
      pile.innerHTML = `<div class="dc-box dc-vide"><div class="dc-emoji">🎉</div><h2>Tu as tout vu pour l'instant</h2>
        <p>De nouvelles offres arrivent chaque jour. Tu peux aussi élargir ta recherche.</p>
        <button class="btn btn-primary" data-on-click="dcModifierReglages">Changer de métier ou de ville</button></div>`;
      return;
    }
    $('dcActions').hidden = false;
    const tags = [o.location, vrai(o.type) && o.type, vrai(o.salary) && o.salary, vrai(o.remote) && o.remote !== 'False' && 'Télétravail', depuis(o.date)]
      .filter(Boolean).map((t) => `<span class="dc-tag">${esc(t)}</span>`).join('');
    pile.innerHTML = `<article class="dc-carte" id="dcCarte" aria-label="${esc(o.title)} chez ${esc(o.company || '')}">
      <span class="dc-tampon gauche">PASSER</span><span class="dc-tampon droite">ADAPTER</span>
      <div class="dc-entete">${logo(o.company)}<div><div class="dc-entreprise">${esc(o.company || 'Entreprise')}</div></div></div>
      <h2 class="dc-titre">${esc(o.title)}</h2>
      <div class="dc-tags">${tags}</div>
      <div class="dc-desc">${esc(String(o.description || 'Pas de description fournie par la source.').slice(0, 1400))}</div>
      ${vrai(o.url) && /^https?:\/\//.test(o.url) ? `<a class="dc-voir" href="${esc(o.url)}" target="_blank" rel="noopener">Voir l'offre complète ↗</a>` : ''}
    </article>`;
    brancherGlisser($('dcCarte'));
    if (etat.offres.length < 4 && etat.plusDOffres) { etat.page++; chargerOffres(); }
  }

  function retirerCarte(sens) {
    const carte = $('dcCarte');
    const o = etat.offres.shift();
    if (o) marquerVu(o.id);
    if (carte) {
      carte.classList.remove('glisse');
      carte.classList.add(sens === 'droite' ? 'part-droite' : 'part-gauche');
      setTimeout(afficherCarte, 220);
    } else afficherCarte();
    return o;
  }

  function brancherGlisser(carte) {
    if (!carte) return;
    let x0 = null, dx = 0;
    const gauche = carte.querySelector('.dc-tampon.gauche'), droite = carte.querySelector('.dc-tampon.droite');
    carte.addEventListener('pointerdown', (e) => {
      if (e.target.closest('a,button')) return;
      x0 = e.clientX; dx = 0; carte.classList.add('glisse'); carte.setPointerCapture(e.pointerId);
    });
    carte.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      dx = e.clientX - x0;
      carte.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`;
      gauche.style.opacity = String(Math.min(1, Math.max(0, -dx / 90)));
      droite.style.opacity = String(Math.min(1, Math.max(0, dx / 90)));
    });
    const fin = () => {
      if (x0 === null) return;
      x0 = null; carte.style.transform = ''; gauche.style.opacity = droite.style.opacity = '0';
      if (dx > 100) adapter(); else if (dx < -100) passer(); else carte.classList.remove('glisse');
    };
    carte.addEventListener('pointerup', fin);
    carte.addEventListener('pointercancel', fin);
  }

  function passer() { if (etat.offres[0]) retirerCarte('gauche'); }

  function adapter() {
    const o = etat.offres[0];
    if (!o) return;
    if (generationsRestantes() <= 0) { window.empShowUpgrade && window.empShowUpgrade(); return; }
    retirerCarte('droite');
    etat.file.push(o);
    majFile();
    traiterFile();
  }

  // ── File d'adaptation, en arrière-plan ───────────────────────────────────
  function majFile(message) {
    const el = $('dcFile');
    if (message) { el.innerHTML = message; el.classList.add('visible'); return; }
    if (!etat.enCours && !etat.file.length) { el.classList.remove('visible'); return; }
    const o = etat.enCours || etat.file[0];
    const reste = etat.file.length;
    el.innerHTML = `<span class="dc-roue"></span><span>Adaptation de ton CV pour <strong>${esc(o.title)}</strong>${reste ? ` · ${reste} en attente` : ''}…</span>`;
    el.classList.add('visible');
  }
  let masquage = null;
  function annoncer(html, duree = 6000) {
    clearTimeout(masquage);
    majFile(html);
    masquage = setTimeout(() => majFile(), duree);
  }

  async function lireFlux(res) {
    const lecteur = res.body.getReader();
    const dec = new TextDecoder();
    let tampon = '', texte = '';
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      tampon += dec.decode(value, { stream: true });
      const lignes = tampon.split('\n');
      tampon = lignes.pop() || '';
      for (const l of lignes) {
        if (!l.startsWith('data: ')) continue;
        let d; try { d = JSON.parse(l.slice(6)); } catch { continue; }
        if (d.error) throw new Error(d.error);
        if (d.chunk) texte += d.chunk;
      }
    }
    return texte;
  }

  async function traiterFile() {
    if (etat.enCours || !etat.file.length) return;
    const o = etat.enCours = etat.file.shift();
    majFile();
    try {
      const res = await fetch('/api/generate/cv', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobOffer: texteOffre(o), profile: etat.parcours }),
      });
      if (res.status === 401) { etat.file = []; window.empShowAuth && window.empShowAuth('login'); throw new Error('session'); }
      if (res.status === 402) { etat.file = []; window.empShowUpgrade && window.empShowUpgrade(); throw new Error('limite'); }
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Erreur de génération'); }
      const cv = await lireFlux(res);
      if (etat.user && etat.user.plan === 'free') etat.user.generationsUsed = (etat.user.generationsUsed || 0) + 1;
      const r = await fetch('/api/prets', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offre: o, description: o.description || '', cv, profil: etat.parcours }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Sauvegarde impossible');
      etat.prets.unshift(d.pret);
      majCompteur();
      if (!$('dcPrets').hidden) afficherPrets();
      etat.enCours = null;
      annoncer(`✅ <span>Ton CV pour <strong>${esc(o.title)}</strong> est prêt.</span> <button class="dc-lien" data-id="${esc(d.pret.id)}" data-on-click="dcOuvrirPret">Voir</button>`);
    } catch (e) {
      etat.enCours = null;
      if (e.message !== 'session' && e.message !== 'limite') {
        annoncer(`⚠️ <span>Adaptation impossible pour <strong>${esc(o.title)}</strong> : ${esc(e.message)}</span>`, 8000);
      }
    } finally {
      etat.enCours = null;
      if (etat.file.length) setTimeout(traiterFile, 400);
    }
  }

  window.addEventListener('beforeunload', (e) => {
    if (etat.enCours || etat.file.length) { e.preventDefault(); e.returnValue = ''; }
  });

  // ── Prêts à postuler ─────────────────────────────────────────────────────
  async function chargerPrets() {
    try {
      const r = await fetch('/api/prets', { credentials: 'include' });
      if (r.ok) etat.prets = (await r.json()).prets || [];
    } catch { /* hors ligne : liste vide */ }
    majCompteur();
  }

  function afficherPrets() {
    montrer('dcPrets');
    const liste = $('dcListe');
    if (!etat.prets.length) {
      liste.innerHTML = `<div class="dc-box dc-vide"><div class="dc-emoji">📭</div><h2>Rien de prêt pour l'instant</h2>
        <p>Dans Découvrir, appuie sur « Adapter mon CV » sur une offre : elle arrivera ici, prête à envoyer.</p>
        <button class="btn btn-primary" data-onglet="flux" data-on-click="dcOnglet">Découvrir des offres</button></div>`;
      return;
    }
    liste.innerHTML = etat.prets.map((p) => `<button class="dc-item" data-id="${esc(p.id)}" data-on-click="dcOuvrirPret">
        ${logo(p.offre.company)}
        <span class="dc-item-txt"><span class="dc-item-titre">${esc(p.offre.title)}</span><br>
        <span class="dc-item-sous">${esc([p.offre.company, p.offre.location].filter(Boolean).join(' · '))}</span></span>
        <span class="dc-statut ${p.statut === 'postule' ? 'postule' : ''}">${p.statut === 'postule' ? 'Postulé' : 'Prêt'}</span>
      </button>`).join('');
  }

  function ouvrirPret(id) {
    const p = etat.prets.find((x) => x.id === id);
    if (!p) return;
    etat.ouvert = id;
    const o = p.offre;
    const ajoutes = (p.ajoutes || []).length
      ? p.ajoutes.map((m) => `<span class="dc-mot">${esc(m)}</span>`).join('')
      : '<span class="dc-note">Ton parcours employait déjà le vocabulaire de l\'offre : le CV a surtout été réorganisé autour du poste.</span>';
    const completer = p.aCompleter
      ? `<p class="dc-note">⚠️ ${p.aCompleter} élément${p.aCompleter > 1 ? 's' : ''} « [à compléter] » à remplir dans le CV avant de l'envoyer.</p>` : '';
    $('dcPanneau').innerHTML = `
      <button class="dc-fermer" data-on-click="dcFermer" aria-label="Fermer">✕</button>
      <div class="dc-entete">${logo(o.company)}<div><div class="dc-entreprise">${esc(o.company || '')}</div>
        <h2 class="dc-titre" style="margin:2px 0 0">${esc(o.title)}</h2></div></div>

      <div class="dc-section"><h3>📄 Ton CV adapté</h3>
        <div class="dc-cv" id="dcCvTexte">${esc(p.cv)}</div>
        <div class="dc-boutons">
          <button data-on-click="dcDeplierCv" id="dcDeplier">Afficher tout</button>
          <button data-on-click="dcPdf">⬇ Télécharger en PDF</button>
          <button data-on-click="dcCopierCv">Copier</button>
          <a href="/adapter?pret=${encodeURIComponent(p.id)}">✍️ Affiner pas à pas</a>
        </div>
      </div>

      <div class="dc-section"><h3>✨ Ce qui a été adapté</h3>
        <div>${ajoutes}</div>
        <p class="dc-note">Mots de l'offre que ton CV reprend désormais et que ton parcours n'employait pas. Rien n'a été inventé : seuls tes faits ont été reformulés.</p>
        ${completer}
      </div>

      ${p.aPreciser ? `<div class="dc-section"><h3>🔍 À vérifier avant d'envoyer</h3><div class="dc-apreciser">${esc(p.aPreciser)}</div>
        <p class="dc-note">Ces points ne figurent ni dans le PDF ni dans la copie.</p></div>` : ''}

      <div class="dc-section"><h3>✉️ Lettre de motivation</h3>
        ${p.lettre
          ? `<div class="dc-cv deplie">${esc(p.lettre)}</div><div class="dc-boutons"><button data-on-click="dcCopierLettre">Copier la lettre</button></div>`
          : `<p class="dc-note" style="margin:0 0 10px">Une lettre écrite pour cette offre, à partir de ton parcours. Compte comme une génération.</p>
             <div class="dc-boutons"><button data-on-click="dcLettre" id="dcBtnLettre">Rédiger la lettre</button></div>`}
      </div>

      <button class="dc-postuler" data-on-click="dcPostuler" ${o.url ? '' : 'disabled'}>
        ${p.statut === 'postule' ? '✓ Candidature envoyée — rouvrir l\'offre ↗' : 'Postuler sur le site de l\'offre ↗'}</button>
      <p class="dc-note" style="text-align:center">L'offre s'ouvre sur son site ; la candidature est ajoutée à ton tableau de bord.</p>
      <button class="dc-supprimer" data-on-click="dcSupprimer">Retirer de la liste</button>`;
    $('dcPanneau').classList.add('ouvert');
    $('dcVoile').classList.add('ouvert');
  }
  const pretOuvert = () => etat.prets.find((x) => x.id === etat.ouvert);
  function fermer() {
    $('dcPanneau').classList.remove('ouvert');
    $('dcVoile').classList.remove('ouvert');
    etat.ouvert = null;
  }

  async function telechargerPdf() {
    const p = pretOuvert();
    if (!p) return;
    if (!window.empConfirmIfIncomplete(p.cv)) return;
    empToast('Génération du PDF…', 'info');
    try {
      if (!window.jspdf) {
        await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = '/vendor/jspdf-2.5.1.umd.min.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
      }
      const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
      const marge = 18, largeur = doc.internal.pageSize.getWidth() - marge * 2;
      let y = marge + 5;
      for (const brut of p.cv.split('\n')) {
        for (const ligne of doc.splitTextToSize(brut || ' ', largeur)) {
          if (y > 282) { doc.addPage(); y = marge; }
          doc.setFont('helvetica', /^━+/.test(ligne) || /^[A-ZÀÉÈÊËÎÏÔÙÛÜ\s]{5,}$/.test(ligne.trim()) ? 'bold' : 'normal');
          doc.text(ligne, marge, y); y += 5.2;
        }
        if (!brut.trim()) y += 1;
      }
      const nom = `CV-${(p.offre.company || 'offre').replace(/[^\p{L}0-9]+/gu, '-')}-Emploia.pdf`;
      doc.save(nom);
      empToast('PDF téléchargé', 'success');
    } catch { empToast('PDF impossible pour le moment — utilise « Copier »', 'error'); }
  }

  function copier(texte, quoi) {
    if (!window.empConfirmIfIncomplete(texte)) return;
    navigator.clipboard.writeText(texte)
      .then(() => empToast(`${quoi} copié${quoi === 'La lettre' ? 'e' : ''}`, 'success'))
      .catch(() => empToast('Copie impossible — sélectionne le texte', 'error'));
  }

  async function redigerLettre() {
    const p = pretOuvert();
    if (!p) return;
    if (generationsRestantes() <= 0) { window.empShowUpgrade && window.empShowUpgrade(); return; }
    const btn = $('dcBtnLettre');
    if (btn) { btn.disabled = true; btn.textContent = 'Rédaction en cours…'; }
    try {
      const res = await fetch('/api/generate/cover-letter', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobOffer: texteOffre({ ...p.offre, description: p.description || '' }), profile: etat.parcours }),
      });
      if (res.status === 402) { window.empShowUpgrade && window.empShowUpgrade(); throw new Error('limite'); }
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Erreur'); }
      const lettre = res.headers.get('content-type')?.includes('event-stream') ? await lireFlux(res) : ((await res.json()).result || '');
      if (etat.user && etat.user.plan === 'free') etat.user.generationsUsed = (etat.user.generationsUsed || 0) + 1;
      const r = await fetch('/api/prets', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, lettre }),
      });
      if (r.ok) Object.assign(p, (await r.json()).pret); else p.lettre = lettre;
      ouvrirPret(p.id);
    } catch (e) {
      if (e.message !== 'limite') empToast('La lettre n\'a pas pu être rédigée. Réessaie.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Rédiger la lettre'; }
    }
  }

  async function postuler() {
    const p = pretOuvert();
    if (!p || !p.offre.url) return;
    window.open(p.offre.url, '_blank', 'noopener');
    if (p.statut === 'postule') return;
    try {
      await fetch('/api/applications', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: p.offre.title, company: p.offre.company, location: p.offre.location,
          salary: p.offre.salary || '', url: p.offre.url, status: 'applied',
          notes: 'CV adapté avec Découvrir (Emploia).',
        }),
      });
      const r = await fetch('/api/prets', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, statut: 'postule' }),
      });
      if (r.ok) Object.assign(p, (await r.json()).pret);
      majCompteur();
      ouvrirPret(p.id);
      empToast('Ajoutée à ton tableau de bord', 'success');
    } catch { empToast('Candidature ouverte, mais pas encore notée dans ton tableau de bord', 'error'); }
  }

  async function supprimer() {
    const p = pretOuvert();
    if (!p) return;
    await fetch('/api/prets?id=' + encodeURIComponent(p.id), { method: 'DELETE', credentials: 'include' }).catch(() => {});
    etat.prets = etat.prets.filter((x) => x.id !== p.id);
    fermer(); majCompteur(); afficherPrets();
  }

  // ── Réglages ─────────────────────────────────────────────────────────────
  async function enregistrerReglages() {
    const parcours = $('dcParcours').value.trim();
    const metier = $('dcMetier').value.trim();
    const ville = $('dcVille').value.trim();
    if (parcours.length < 80) return empToast('Décris ton parcours en quelques lignes (80 caractères au moins)', 'error');
    if (!metier) return empToast('Indique le métier que tu cherches', 'error');
    const btn = $('dcEnregistrer'); btn.disabled = true;
    etat.parcours = parcours;
    const changement = metier !== etat.cible.metier || ville !== etat.cible.ville;
    etat.cible = { metier, ville };
    ecrireJSON(CLE_CIBLE, etat.cible);
    try { localStorage.setItem('emploia_profile_text', parcours); } catch { /* */ }
    // Le profil fusionne côté serveur : on n'envoie que ce que cette page gère.
    await fetch('/api/profile', {
      method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileText: parcours }),
    }).catch(() => {});
    btn.disabled = false;
    if (changement) { etat.offres = []; etat.page = 0; etat.plusDOffres = true; }
    vueFlux();
  }

  // ── Démarrage ────────────────────────────────────────────────────────────
  async function demarrer(user) {
    etat.user = user || null;
    if (!etat.user) return montrer('dcAuth');
    try {
      const r = await fetch('/api/profile', { credentials: 'include' });
      if (r.ok) {
        const p = await r.json();
        etat.parcours = p.profileText || p.summary || '';
        if (!etat.cible.metier && p.title) etat.cible.metier = p.title;
        if (!etat.cible.ville && p.location) etat.cible.ville = p.location;
      }
    } catch { /* */ }
    if (!etat.parcours) { try { etat.parcours = localStorage.getItem('emploia_profile_text') || ''; } catch { /* */ } }
    await chargerPrets();
    if (new URLSearchParams(location.search).get('vue') === 'prets') afficherPrets(); else vueFlux();
  }

  document.addEventListener('keydown', (e) => {
    if ($('dcFlux').hidden || e.target.closest('input,textarea') || $('dcPanneau').classList.contains('ouvert')) {
      if (e.key === 'Escape') fermer();
      return;
    }
    if (e.key === 'ArrowRight') { e.preventDefault(); adapter(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); passer(); }
  });

  // Une session qui arrive après l'invitation (réseau lent) la remplace.
  let parti = false;
  const partir = (u) => { if (!parti || (u && !etat.user)) { parti = true; demarrer(u); } };
  window.addEventListener('empUserLoaded', (e) => partir(e.detail));
  // Inscription ou connexion depuis l'invitation : on enchaîne sans recharger.
  window.addEventListener('empAuthChange', (e) => { if (e.detail && e.detail.user) { etat.user = null; partir(e.detail.user); } });
  if (window.empUser !== undefined && window.empUser !== null) partir(window.empUser);
  // Pas de session : shared.js n'émet rien, on montre l'invitation.
  setTimeout(() => partir(window.empUser || null), 2500);

  // ── Gestionnaires des data-on-click ──────────────────────────────────────
  EMP_H['dcOnglet'] = function () { if (this.getAttribute('data-onglet') === 'prets') afficherPrets(); else vueFlux(); };
  EMP_H['dcInscription'] = function () { window.empShowAuth && window.empShowAuth('register'); };
  EMP_H['dcEnregistrerReglages'] = function () { enregistrerReglages(); };
  EMP_H['dcModifierReglages'] = function () { ouvrirReglages(); };
  EMP_H['dcPasser'] = function () { passer(); };
  EMP_H['dcAdapter'] = function () { adapter(); };
  EMP_H['dcOuvrirPret'] = function () { ouvrirPret(this.getAttribute('data-id')); };
  EMP_H['dcFermer'] = function () { fermer(); };
  EMP_H['dcDeplierCv'] = function () { const el = $('dcCvTexte'); el.classList.toggle('deplie'); this.textContent = el.classList.contains('deplie') ? 'Réduire' : 'Afficher tout'; };
  EMP_H['dcPdf'] = function () { telechargerPdf(); };
  EMP_H['dcCopierCv'] = function () { const p = pretOuvert(); if (p) copier(p.cv, 'Le CV'); };
  EMP_H['dcCopierLettre'] = function () { const p = pretOuvert(); if (p) copier(p.lettre, 'La lettre'); };
  EMP_H['dcLettre'] = function () { redigerLettre(); };
  EMP_H['dcPostuler'] = function () { postuler(); };
  EMP_H['dcSupprimer'] = function () { supprimer(); };
})();
