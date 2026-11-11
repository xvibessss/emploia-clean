/* Pricing → Stripe Checkout. Wires the Pro/Campagne cards (data-checkout) to
   /api/stripe-checkout with the right plan key. The plan key is passed through
   verbatim; the server decides subscription vs one-off payment and amounts are
   whatever the STRIPE_PRICE_* env vars point to.
   A creator code captured from ?code= rides along on the Pack Campagne only —
   the server drops it on any other plan, and drops one it cannot resolve.
   Falls back to /app (the href) if JS/checkout is unavailable. */
(function () {
  function toast(m) { (window.empToast ? window.empToast(m, 'error') : alert(m)); }
  async function startCheckout(plan, btn) {
    const code = plan === 'campagne' && window.empCreatorCode ? window.empCreatorCode() : '';
    // Consentement exprès à l'exécution immédiate : sans lui, pas de commande.
    if (window.empConsentImmediate && !await window.empConsentImmediate(plan === 'campagne' ? 'Pack Campagne' : 'Pro')) return;
    const label = btn.textContent;
    if (window.trackEvent) window.trackEvent('checkout_started', { plan });
    btn.style.pointerEvents = 'none'; btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Redirection…';
    try {
      const res = await fetch('/api/stripe-checkout', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(code ? { plan, code, consent: true } : { plan, consent: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) { window.location.href = data.url; return; }
      toast(data.error || 'Le paiement est momentanément indisponible. Réessayez.');
    } catch (e) {
      toast('Le paiement est momentanément indisponible. Réessayez.');
    }
    btn.style.pointerEvents = ''; btn.removeAttribute('aria-busy'); btn.textContent = label;
  }
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-checkout]');
    if (!btn) return;
    e.preventDefault();
    const plan = btn.getAttribute('data-checkout'); // 'pro' | 'campagne'
    // Prefer an authenticated checkout so the purchase binds to the account.
    if (!window.empUser && typeof window.empShowAuth === 'function') { window.empShowAuth('signup'); return; }
    startCheckout(plan, btn);
  });
})();
