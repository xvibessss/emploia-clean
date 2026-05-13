// Emploia Smart Apply — Content Script
// Detects job application forms and auto-fills them with user profile

(function () {
  'use strict';

  const HOST = location.hostname;
  let fab = null;
  let toastTimer = null;

  // ── Site detection ────────────────────────────────────────────────────────

  function detectSite() {
    if (HOST.includes('linkedin.com')) return 'linkedin';
    if (HOST.includes('indeed')) return 'indeed';
    if (HOST.includes('welcometothejungle')) return 'wttj';
    if (HOST.includes('jobteaser')) return 'jobteaser';
    if (HOST.includes('hellowork')) return 'hellowork';
    if (HOST.includes('apec.fr')) return 'apec';
    if (HOST.includes('francetravail.fr') || HOST.includes('pole-emploi.fr')) return 'ft';
    return 'generic';
  }

  function isApplicationPage() {
    const site = detectSite();
    const url = location.href;
    const path = location.pathname;

    if (site === 'linkedin') {
      return document.querySelector('.jobs-easy-apply-content, .jobs-apply-button, [data-job-id]') !== null;
    }
    if (site === 'indeed') {
      return document.querySelector('#ia-container, .ia-BasePage, [data-testid="apply-button"]') !== null
        || path.includes('/apply') || url.includes('applyRedirect');
    }
    if (site === 'wttj') {
      return path.includes('/apply') || document.querySelector('form[action*="apply"]') !== null;
    }
    if (site === 'jobteaser') {
      return path.includes('/apply') || document.querySelector('.application-form') !== null;
    }
    // Generic: look for form with typical application fields
    return !!document.querySelector('input[name*="first"], input[name*="prenom"], input[name*="nom"], input[name*="email"], textarea[name*="cover"], textarea[name*="letter"], textarea[name*="motivation"]');
  }

  // ── FAB injection ─────────────────────────────────────────────────────────

  function injectFAB() {
    if (document.getElementById('emploia-fab')) return;
    fab = document.createElement('button');
    fab.id = 'emploia-fab';
    fab.innerHTML = `<span class="fab-logo">E</span> Autofill Emploia`;
    fab.title = 'Remplir ce formulaire avec mon profil Emploia';
    fab.addEventListener('click', handleAutofill);
    document.body.appendChild(fab);
  }

  function removeFAB() {
    const el = document.getElementById('emploia-fab');
    if (el) el.remove();
    fab = null;
  }

  function showToast(msg, type = 'info', duration = 3000) {
    let el = document.getElementById('emploia-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'emploia-toast';
      document.body.appendChild(el);
    }
    el.className = type;
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.display = 'none'; }, duration);
  }

  // ── Autofill logic ────────────────────────────────────────────────────────

  async function handleAutofill() {
    fab.classList.add('filling');
    fab.textContent = '⏳ Récupération du profil…';
    showToast('Récupération du profil Emploia…', 'info');

    const profile = await getProfile();
    if (!profile) {
      fab.classList.remove('filling');
      fab.innerHTML = `<span class="fab-logo">E</span> Autofill Emploia`;
      showToast('Profil non trouvé. Ouvrez l\'extension et connectez-vous.', 'error', 5000);
      return;
    }

    const filled = fillForm(profile);
    if (filled > 0) {
      fab.classList.remove('filling');
      fab.classList.add('done');
      fab.innerHTML = `✅ ${filled} champ${filled > 1 ? 's' : ''} rempli${filled > 1 ? 's' : ''}`;
      showToast(`${filled} champ${filled > 1 ? 's' : ''} rempli${filled > 1 ? 's' : ''} automatiquement !`, 'success', 4000);
      chrome.runtime.sendMessage({ type: 'AUTOFILL_DONE', count: filled });
      setTimeout(() => {
        if (fab) { fab.classList.remove('done'); fab.innerHTML = `<span class="fab-logo">E</span> Autofill Emploia`; }
      }, 4000);
    } else {
      fab.classList.remove('filling');
      fab.innerHTML = `<span class="fab-logo">E</span> Autofill Emploia`;
      showToast('Aucun champ reconnu sur cette page.', 'info', 4000);
    }
  }

  function getProfile() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_PROFILE' }, (res) => {
        if (chrome.runtime.lastError || !res?.ok) { resolve(null); return; }
        resolve(res.profile);
      });
    });
  }

  function fillForm(profile) {
    const site = detectSite();
    let filled = 0;

    // Build field map from profile
    const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
    const fieldMap = {
      // Name variants
      'first.name|firstname|prenom|first_name|given.name|given_name': profile.firstName || '',
      'last.name|lastname|nom|last_name|family.name|family_name|surname': profile.lastName || '',
      'full.name|fullname|name|nom.complet': fullName,
      // Contact
      'email|mail|courriel|e-mail': profile.email || '',
      'phone|tel|telephone|mobile|portable|cell': profile.phone || '',
      'linkedin|linkedin.url|linkedin_url': profile.linkedin || '',
      'portfolio|website|site|url|github': profile.portfolio || '',
      // Location
      'city|ville|location|localisation|address|adresse': profile.location || '',
      // Professional
      'title|poste|job.title|job_title|position|titre': profile.title || '',
      // Cover letter / motivation
      'cover.letter|coverletter|letter|lettre|motivation|message|presentation|profil|about|summary|bio': profile.summary || '',
    };

    // LinkedIn Easy Apply — multi-step form
    if (site === 'linkedin') {
      filled += fillLinkedIn(profile, fieldMap);
      return filled;
    }

    // Generic fill: loop over all inputs/textareas/selects
    filled += fillGeneric(fieldMap, profile);
    return filled;
  }

  function fillGeneric(fieldMap, profile) {
    let count = 0;
    const inputs = document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]), textarea, select');

    inputs.forEach(input => {
      if (input.value && input.value.trim()) return; // don't overwrite existing
      const identifier = [
        input.name, input.id, input.placeholder,
        input.getAttribute('aria-label'), input.getAttribute('data-field'),
        input.getAttribute('autocomplete'),
      ].filter(Boolean).join(' ').toLowerCase();

      for (const [pattern, value] of Object.entries(fieldMap)) {
        if (!value) continue;
        const keywords = pattern.split('|');
        const matches = keywords.some(k => identifier.includes(k.replace(/\./g, '')));
        if (matches) {
          setNativeValue(input, value);
          count++;
          break;
        }
      }

      // Email autocomplete
      if (input.type === 'email' && !input.value && profile.email) {
        setNativeValue(input, profile.email); count++;
      }
      // Tel autocomplete
      if (input.type === 'tel' && !input.value && profile.phone) {
        setNativeValue(input, profile.phone); count++;
      }
    });

    return count;
  }

  function fillLinkedIn(profile, fieldMap) {
    let count = 0;
    // LinkedIn uses React controlled components — need native value setter
    const observer = new MutationObserver(() => {
      count += fillGeneric(fieldMap, profile);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 5000);
    count += fillGeneric(fieldMap, profile);
    return count;
  }

  // React/Vue compatible value setter
  function setNativeValue(el, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, value);
    } else {
      el.value = value;
    }

    // Trigger React/Vue reactivity
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // ── Listen for popup-triggered autofill ──────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'TRIGGER_AUTOFILL') {
      handleAutofill().then(() => sendResponse({ ok: true }));
      return true;
    }
  });

  // ── Observer: detect SPA navigation and form appearance ──────────────────

  let checkDebounce = null;
  const pageObserver = new MutationObserver(() => {
    clearTimeout(checkDebounce);
    checkDebounce = setTimeout(checkPage, 800);
  });

  function checkPage() {
    if (isApplicationPage()) {
      injectFAB();
    } else {
      removeFAB();
    }
  }

  pageObserver.observe(document.body, { childList: true, subtree: true });
  checkPage();

  // Also check on URL change (SPA)
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(checkPage, 1200);
    }
  }, 500);

})();
