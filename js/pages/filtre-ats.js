/* /filtre-ats — simulateur de filtre ATS sur de vraies offres.
   Le calcul initial est fait par api/filtre-ats.js ; cocher une compétence
   le refait ici, avec la même règle : une offre laisse passer le CV s'il cite
   ses trois compétences exigées (champ `e`). Aucun gestionnaire en ligne. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const etat = { r: null, cv: new Set(), ajoutees: new Set(), noms: {}, metier: '', ville: '' };
  const nom = (id) => etat.noms[id] || id;
  const fmt = (n) => n.toLocaleString('fr-FR');

  // ── Préremplissage : parcours enregistré, métier de Découvrir ───────────
  function prerempli(p) {
    if (p?.profileText && !$('faCv').value) $('faCv').value = p.profileText;
    if (p?.title && !$('faMetier').value) $('faMetier').value = p.title;
    if (p?.location && !$('faVille').value) $('faVille').value = p.location;
  }
  try {
    const cible = JSON.parse(localStorage.getItem('emploia_decouvrir_cible') || 'null');
    prerempli({ profileText: localStorage.getItem('emploia_profile_text') || '', title: cible?.metier, location: cible?.ville });
  } catch { /* navigation privée */ }
  window.addEventListener('empUserLoaded', () => {
    fetch('/api/profile', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then(prerempli).catch(() => {});
  });

  // ── Lancement ────────────────────────────────────────────────────────────
  async function lancer() {
    const metier = $('faMetier').value.trim();
    const ville = $('faVille').value.trim();
    const cv = $('faCv').value.trim();
    if (metier.length < 2) return empToast('Indique le métier que tu vises', 'error');
    if (cv.length < 80) return empToast('Colle ton CV (quelques lignes au moins)', 'error');
    const btn = $('faGo');
    btn.disabled = true; btn.textContent = 'On passe ton CV au filtre des offres…';
    try {
      const res = await fetch('/api/filtre-ats', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metier, ville, cv }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Simulation impossible pour le moment');
      etat.metier = metier; etat.ville = ville; etat.noms = d.noms || {};
      if (d.insuffisant) {
        $('faResultat').hidden = true;
        empToast(d.nbOffres
          ? `Seulement ${d.nbOffres} offres analysables pour « ${metier} »${ville ? ' à ' + ville : ''}. Essaie un intitulé plus courant ou retire la ville.`
          : `Aucune offre analysable pour « ${metier} »${ville ? ' à ' + ville : ''}. Essaie un intitulé plus courant ou retire la ville.`, 'error');
        return;
      }
      etat.r = d; etat.cv = new Set(d.cv || []); etat.ajoutees = new Set();
      afficher(true);
      $('faResultat').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      empToast(e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Passer mon CV au filtre';
    }
  }

  // ── Calcul local (mêmes règles que le serveur) ───────────────────────────
  function cvEffectif() { return new Set([...etat.cv, ...etat.ajoutees]); }
  function passe(o, cv) { return o.e.every((id) => cv.has(id)); }

  function afficher(premiere) {
    const r = etat.r;
    const cv = cvEffectif();
    const etats = r.offres.map((o) => passe(o, cv));
    const enLice = etats.filter(Boolean).length;
    $('faEnLice').textContent = fmt(enLice);
    $('faFiltrees').textContent = fmt(r.offres.length - enLice);

    const ou = etat.ville ? ` à ${esc(etat.ville)}` : '';
    let phrase = `Sur <strong>${fmt(r.offres.length)} offres réelles</strong> de « ${esc(etat.metier)} »${ou}, ton CV passe le filtre de <strong>${fmt(enLice)}</strong>.`;
    if (etat.ajoutees.size) {
      const gagne = enLice - r.enLice;
      phrase += ` Avec ${[...etat.ajoutees].map((id) => `<strong>${esc(nom(id))}</strong>`).join(', ')}, tu en récupères <strong>${fmt(gagne)}</strong>.`;
    }
    $('faPhrase').innerHTML = phrase;

    const grille = $('faGrille');
    if (premiere) {
      grille.innerHTML = r.offres.map((o, i) => `<button class="fa-pt" role="listitem" data-i="${i}" data-on-click="faPoint" aria-label="${esc(o.t)} — ${esc(o.c)}" style="transition-delay:${Math.min(i * 6, 900)}ms"></button>`).join('');
      // Les points prennent leur couleur une fois posés : on voit le filtre passer.
      requestAnimationFrame(() => requestAnimationFrame(() => colorer(etats, false)));
    } else colorer(etats, true);

    const manquantes = r.manquantes.filter((m) => !etat.cv.has(m.id));
    $('faSectionManque').hidden = !manquantes.length;
    $('faManquantes').innerHTML = manquantes.map((m) => `<button class="fa-puce" data-id="${esc(m.id)}" data-on-click="faBasculer" aria-pressed="${etat.ajoutees.has(m.id)}">${etat.ajoutees.has(m.id) ? '✓ ' : '+ '}${esc(nom(m.id))}<small>${m.r ? `+${fmt(m.r)} offre${m.r > 1 ? 's' : ''}` : `${fmt(m.n)} offre${m.n > 1 ? 's la demandent' : ' la demande'}`}</small></button>`).join('');
    $('faSectionForte').hidden = !r.fortes.length;
    $('faFortes').innerHTML = r.fortes.map((f) => `<span class="fa-puce forte">${esc(nom(f.id))}<small>(${fmt(f.n)})</small></span>`).join('');
    $('faMethode').innerHTML = `<strong>Comment c'est calculé.</strong> Chaque point est une offre publiée sur Emploia pour « ${esc(etat.metier)} »${ou}, dont la description cite au moins une compétence connue (${fmt(r.offres.length)} offres). Pour chacune, on retient ses trois compétences les plus demandées sur l'ensemble de ces offres — celles qu'un recruteur met le plus souvent en filtre. Ton CV passe l'offre s'il cite ces trois compétences. C'est une simulation : chaque recruteur règle son filtre à sa façon, mais les mots-clés exigés, eux, viennent des offres.`;
    $('faResultat').hidden = false;
    $('faDetail').textContent = '';
  }

  function colorer(etats, animer) {
    const points = $('faGrille').children;
    for (let i = 0; i < points.length; i++) {
      const el = points[i];
      const avant = el.classList.contains('ok');
      el.classList.toggle('ok', etats[i]);
      el.classList.toggle('ko', !etats[i]);
      if (animer) {
        el.style.transitionDelay = '0ms';
        if (etats[i] && !avant) { el.classList.remove('revient'); void el.offsetWidth; el.classList.add('revient'); }
      }
    }
  }

  function detailPoint(i) {
    const o = etat.r.offres[i];
    if (!o) return;
    const cv = cvEffectif();
    const exig = o.e.map((id) => `${cv.has(id) ? '✅' : '❌'} ${esc(nom(id))}`).join(' · ');
    $('faDetail').innerHTML = `<strong>${esc(o.t)}</strong>${o.c ? ` — ${esc(o.c)}` : ''}<br>Compétences exigées : ${exig}`;
  }

  async function partager() {
    if (!etat.r) return;
    const enLice = etat.r.offres.filter((o) => passe(o, cvEffectif())).length;
    const texte = `Mon CV passe le filtre ATS de ${enLice} offres sur ${etat.r.offres.length} pour « ${etat.metier} ». Et le tien ?`;
    const url = 'https://emploia.eu/filtre-ats';
    try {
      if (navigator.share) { await navigator.share({ title: 'Simulateur de filtre ATS', text: texte, url }); return; }
      await navigator.clipboard.writeText(`${texte} ${url}`);
      empToast('Résultat copié — colle-le où tu veux', 'success');
    } catch { /* partage annulé */ }
  }

  EMP_H['faLancer'] = function () { lancer(); };
  EMP_H['faPoint'] = function () { detailPoint(Number(this.getAttribute('data-i'))); };
  EMP_H['faBasculer'] = function () {
    const id = this.getAttribute('data-id');
    if (etat.ajoutees.has(id)) etat.ajoutees.delete(id); else etat.ajoutees.add(id);
    afficher(false);
  };
  EMP_H['faPartager'] = function () { partager(); };
  EMP_H['faRecommencer'] = function () { $('faFormulaire').scrollIntoView({ behavior: 'smooth' }); $('faCv').focus(); };
})();
