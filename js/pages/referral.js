  // Year
  document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());

  // FAQ accordion
  function faqToggle(item) {
    item.classList.toggle('open');
  }

  // Reward tracker rendering
  function renderTracker(months) {
    const slots = document.getElementById('trackerSlots');
    if (!slots) return;
    slots.innerHTML = '';
    for (let i = 1; i <= 6; i++) {
      const div = document.createElement('div');
      div.className = 'ref-tracker-slot' + (i <= months ? ' earned' : '');
      div.innerHTML = `<span class="icon">🎁</span><span>${i} mois</span>`;
      slots.appendChild(div);
    }
    const bar = document.getElementById('trackerBar');
    if (bar) bar.style.width = Math.min(months / 6 * 100, 100) + '%';
  }
  renderTracker(0); // initial empty state

  // Load referral data
  async function loadReferral() {
    try {
      const r = await fetch('/api/auth/me', { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      if (!d.user) return;

      document.getElementById('refNotLogged').style.display = 'none';
      document.getElementById('refLoggedIn').style.display = 'block';

      const refR = await fetch('/api/referral', { credentials: 'include' });
      if (!refR.ok) return;
      const ref = await refR.json();

      const link = ref.link || `https://emploia.eu/?ref=${ref.code}`;
      document.getElementById('refLink').value = link;

      const signups = ref.signups || 0;
      const months = ref.monthsEarned || 0;
      document.getElementById('refSignups').textContent = signups;
      document.getElementById('refMonths').textContent = months;

      // Update hero counter
      document.getElementById('heroSignups').textContent = signups;
      document.getElementById('heroMonths').textContent = months;
      if (signups > 0) document.getElementById('heroCounter').style.display = 'inline-flex';

      // Update tracker
      renderTracker(months);

      const msg = encodeURIComponent(`Essaie Emploia — le copilote IA pour décrocher des entretiens 🚀 : ${link}`);
      document.getElementById('shareWA').href = `https://wa.me/?text=${msg}`;
      document.getElementById('shareLI').href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`;
      document.getElementById('shareEmail').href = `mailto:?subject=Je%20te%20recommande%20Emploia&body=${msg}`;
    } catch (e) {}
  }

  function copyLink() {
    const val = document.getElementById('refLink').value;
    navigator.clipboard.writeText(val)
      .then(() => empToast('Lien copié !', 'success'))
      .catch(() => empToast('Copie impossible — utilisez Ctrl+C', 'error'));
  }

  // Check URL ref param (when landing via a referral link)
  const urlRef = new URLSearchParams(window.location.search).get('ref');
  if (urlRef && /^[A-Z0-9]{8}$/i.test(urlRef)) {
    sessionStorage.setItem('emploia_ref', urlRef.toUpperCase());
  }

  loadReferral();

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["copyLink"] = function (event) {
  copyLink()
};
EMP_H["faqToggle_this_parentElement_3e3c"] = function (event) {
  faqToggle(this.parentElement)
};
