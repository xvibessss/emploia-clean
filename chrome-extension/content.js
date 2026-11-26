// Emploia — script de contenu
//
// Deux boutons, jamais en même temps :
//  1. Sur une page d'OFFRE : « ✨ Adapter mon CV ». L'offre (titre, entreprise,
//     lieu, description) est lue sur la page et ouverte dans le générateur
//     d'emploia.eu, déjà collée. Rien ne part ailleurs, et seulement au clic.
//  2. Sur un FORMULAIRE de candidature : « Remplir avec Emploia », qui reprend
//     le profil enregistré dans l'extension (stocké en local, sur ce poste).
//
// L'offre est lue d'abord dans le JSON-LD `JobPosting` que la plupart des sites
// d'emploi publient pour Google (WTTJ, HelloWork, APEC, France Travail,
// Indeed…), parce qu'il survit aux refontes de leurs pages. Les sélecteurs par
// site ne servent qu'en repli.

(function () {
  'use strict';

  const HOST = location.hostname;
  const MAX_OFFRE = 8000;      // caractères envoyés au générateur
  const MIN_DESCRIPTION = 200;  // en dessous, ce n'est pas une offre lisible
  const MIN_REPLI = 400;        // plus exigeant quand rien ne dit que c'est une offre
  let toastTimer = null;

  // ── Lecture de l'offre ──────────────────────────────────────────────────

  function texteDeHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = String(html || '')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h[1-6]|div)>/gi, '\n');
    return (div.textContent || '').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
  }

  function jobPostingsDe(noeud, sortie) {
    if (!noeud || typeof noeud !== 'object') return;
    if (Array.isArray(noeud)) { noeud.forEach(n => jobPostingsDe(n, sortie)); return; }
    const type = noeud['@type'];
    if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) sortie.push(noeud);
    if (noeud['@graph']) jobPostingsDe(noeud['@graph'], sortie);
  }

  function offreDepuisJsonLd() {
    const trouvees = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try { jobPostingsDe(JSON.parse(s.textContent), trouvees); } catch {}
    });
    const jp = trouvees.find(j => j.description) || trouvees[0];
    if (!jp) return null;
    const org = jp.hiringOrganization;
    const lieux = [].concat(jp.jobLocation || []).map(l => {
      const a = l && l.address;
      return a ? (typeof a === 'string' ? a : a.addressLocality || a.addressRegion || '') : '';
    }).filter(Boolean);
    return {
      titre: String(jp.title || '').trim(),
      entreprise: String((org && (org.name || org)) || '').trim(),
      lieu: [...new Set(lieux)].join(', '),
      description: texteDeHtml(jp.description),
    };
  }

  function texte(sel) {
    const el = sel && document.querySelector(sel);
    return el ? (el.innerText || el.textContent || '').trim() : '';
  }

  const SELECTEURS = {
    linkedin: {
      titre: '.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, .top-card-layout__title, h1',
      entreprise: '.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .topcard__org-name-link',
      description: '.jobs-description__content, .jobs-box__html-content, #job-details, .show-more-less-html__markup, .description__text',
    },
    indeed: {
      titre: '[data-testid="jobsearch-JobInfoHeader-title"], h1',
      entreprise: '[data-testid="inlineHeader-companyName"], [data-company-name]',
      description: '#jobDescriptionText',
    },
    // France Travail ne publie pas de JobPosting (vérifié le 2026-11-26) : son
    // offre porte des microdonnées itemprop.
    francetravail: {
      titre: '#labelPopin, [itemprop="title"]',
      entreprise: '[itemprop="hiringOrganization"] [itemprop="name"], .media-body h3.t4',
      description: '[itemprop="description"]',
    },
  };

  // Le repli ne doit pas prendre pour une offre le texte d'un bandeau cookies
  // (vu sur HelloWork le 2026-11-26) ni une liste d'« autres offres ».
  const A_EXCLURE = '[class*="cookie" i], [id*="cookie" i], [class*="consent" i], [id*="consent" i], [class*="didomi" i], [id*="onetrust" i], [class*="cc-" i], nav, footer, aside, [role="dialog"]';

  function offreDepuisSelecteurs() {
    const site = HOST.includes('linkedin.com') ? 'linkedin' : HOST.includes('indeed') ? 'indeed' : HOST.includes('francetravail.fr') ? 'francetravail' : null;
    const s = site && SELECTEURS[site];
    if (s) {
      const description = texte(s.description);
      if (description.length >= MIN_DESCRIPTION) return { titre: texte(s.titre), entreprise: texte(s.entreprise), lieu: '', description };
    }
    // Repli générique : le plus long bloc qui ressemble à une description,
    // hors bandeaux et hors listes d'offres.
    const candidats = [...document.querySelectorAll('[class*="description" i], [id*="description" i], [data-testid*="description" i], article')]
      .filter(c => !c.closest(A_EXCLURE) && c.querySelectorAll('a[href]').length < 15);
    let meilleur = '';
    for (const c of candidats) {
      const t = (c.innerText || c.textContent || '').trim();
      if (t.length > meilleur.length) meilleur = t;
    }
    if (meilleur.length < MIN_REPLI) return null;
    return { titre: texte('h1'), entreprise: '', lieu: '', description: meilleur };
  }

  function lireOffre() {
    const j = offreDepuisJsonLd();
    // Un JobPosting dont la description est vide ou tronquée laisse sa chance
    // aux sélecteurs, au lieu de faire disparaître le bouton.
    if (j && j.description.length >= MIN_DESCRIPTION) return j;
    const o = offreDepuisSelecteurs();
    if (!o) return null;
    if (j) { o.titre = j.titre || o.titre; o.entreprise = j.entreprise || o.entreprise; o.lieu = j.lieu || o.lieu; }
    return o;
  }

  function offreEnTexte(o) {
    const entete = [o.titre, o.entreprise && `— ${o.entreprise}`, o.lieu && `(${o.lieu})`].filter(Boolean).join(' ');
    return `${entete}\n\n${o.description}`.slice(0, MAX_OFFRE).trim();
  }

  function adapterMonCV() {
    const o = lireOffre();
    if (!o) { showToast('Aucune offre lisible sur cette page.', 'info', 4000); return false; }
    chrome.runtime.sendMessage({ type: 'OPEN_GENERATOR', offre: offreEnTexte(o), source: location.href });
    showToast('Offre envoyée au générateur Emploia ✨', 'success', 3000);
    return true;
  }

  // ── Formulaire de candidature ───────────────────────────────────────────

  function estFormulaire() {
    if (document.querySelector('.jobs-easy-apply-content, #ia-container, .ia-BasePage')) return true;
    if (/\/apply|\/postuler|\/candidature/i.test(location.pathname)) return true;
    const champs = document.querySelectorAll('input[type="email"], input[autocomplete="given-name"], input[autocomplete="family-name"], input[type="file"]');
    return champs.length >= 2;
  }

  // Chaque champ est reconnu sur des MOTS entiers de ses attributs. L'ancienne
  // version cherchait des sous-chaînes : « name » attrapait « company_name », et
  // « nom » attrapait « nombre » ; le texte de profil partait aussi dans les
  // champs « lettre de motivation », qu'il ne remplace pas.
  const CHAMPS = [
    { cle: 'firstName', mots: ['firstname', 'first', 'prenom', 'given', 'givenname'], auto: 'given-name' },
    { cle: 'lastName', mots: ['lastname', 'last', 'nom', 'family', 'familyname', 'surname'], auto: 'family-name' },
    { cle: 'email', mots: ['email', 'mail', 'courriel'], auto: 'email' },
    { cle: 'phone', mots: ['phone', 'tel', 'telephone', 'mobile', 'portable'], auto: 'tel' },
    { cle: 'linkedin', mots: ['linkedin'] },
    { cle: 'location', mots: ['city', 'ville', 'localisation', 'location'], auto: 'address-level2' },
    { cle: 'title', mots: ['headline', 'poste', 'jobtitle', 'titre'] },
  ];
  const INTERDITS = ['company', 'entreprise', 'societe', 'employer', 'employeur', 'referent', 'reference', 'manager', 'school', 'ecole'];

  function motsDe(input) {
    let label = '';
    if (input.id) { const l = document.querySelector(`label[for="${CSS.escape(input.id)}"]`); if (l) label = l.textContent; }
    if (!label) { const l = input.closest('label'); if (l) label = l.textContent; }
    return [input.name, input.id, input.placeholder, input.getAttribute('aria-label'), input.getAttribute('autocomplete'), label]
      .filter(Boolean).join(' ')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
      .split(/[^a-z0-9]+/).filter(Boolean);
  }

  function champPour(input) {
    const auto = (input.getAttribute('autocomplete') || '').toLowerCase();
    const direct = CHAMPS.find(c => c.auto && c.auto === auto);
    if (direct) return direct.cle;
    if (input.type === 'email') return 'email';
    if (input.type === 'tel') return 'phone';
    const mots = motsDe(input);
    if (mots.some(m => INTERDITS.includes(m))) return null;
    const joint = mots.join('');
    const c = CHAMPS.find(c => c.mots.some(m => mots.includes(m) || (m.length > 6 && joint.includes(m))));
    return c ? c.cle : null;
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function remplir(profil) {
    let n = 0;
    document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=password])').forEach(input => {
      if (input.disabled || input.readOnly || (input.value && input.value.trim())) return;
      const cle = champPour(input);
      const valeur = cle && profil[cle];
      if (valeur) { setNativeValue(input, valeur); n++; }
    });
    return n;
  }

  function getProfile() {
    return new Promise(resolve => {
      chrome.storage.local.get(['emploia_profile'], d => resolve(d.emploia_profile || null));
    });
  }

  async function remplirFormulaire() {
    const profil = await getProfile();
    if (!profil) { showToast('Ouvrez l’extension Emploia et enregistrez votre profil.', 'error', 5000); return 0; }
    const n = remplir(profil);
    if (n) {
      showToast(`${n} champ${n > 1 ? 's' : ''} rempli${n > 1 ? 's' : ''} — vérifiez avant d’envoyer.`, 'success', 4500);
      chrome.runtime.sendMessage({ type: 'AUTOFILL_DONE', count: n });
    } else {
      showToast('Aucun champ reconnu sur cette page.', 'info', 4000);
    }
    return n;
  }

  // ── Interface ───────────────────────────────────────────────────────────

  function showToast(msg, type = 'info', duration = 3000) {
    let el = document.getElementById('emploia-toast');
    if (!el) { el = document.createElement('div'); el.id = 'emploia-toast'; document.body.appendChild(el); }
    el.className = type;
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.display = 'none'; }, duration);
  }

  function bouton(mode) {
    let fab = document.getElementById('emploia-fab');
    if (fab && fab.dataset.mode === mode) return;
    if (fab) fab.remove();
    if (!mode) return;
    fab = document.createElement('button');
    fab.id = 'emploia-fab';
    fab.type = 'button';
    fab.dataset.mode = mode;
    const logo = document.createElement('span');
    logo.className = 'fab-logo';
    logo.textContent = 'E';
    fab.append(logo, document.createTextNode(mode === 'offre' ? ' ✨ Adapter mon CV' : ' Remplir avec Emploia'));
    fab.title = mode === 'offre' ? 'Ouvrir cette offre dans le générateur Emploia' : 'Remplir ce formulaire avec mon profil Emploia';
    fab.addEventListener('click', () => (mode === 'offre' ? adapterMonCV() : remplirFormulaire()));
    document.body.appendChild(fab);
  }

  function verifierPage() {
    bouton(estFormulaire() ? 'formulaire' : lireOffre() ? 'offre' : null);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'TRIGGER_AUTOFILL') { remplirFormulaire().then(n => sendResponse({ ok: true, count: n })); return true; }
    if (msg.type === 'TRIGGER_ADAPT') { sendResponse({ ok: adapterMonCV() }); return; }
    if (msg.type === 'PAGE_STATE') { sendResponse({ offre: !!lireOffre(), formulaire: estFormulaire() }); return; }
  });

  // Les sites d'emploi sont des applications d'une page : on revérifie quand le
  // contenu change, avec un délai pour ne pas relire la page à chaque mutation.
  let attente = null;
  new MutationObserver(() => { clearTimeout(attente); attente = setTimeout(verifierPage, 900); })
    .observe(document.body, { childList: true, subtree: true });
  verifierPage();
})();
