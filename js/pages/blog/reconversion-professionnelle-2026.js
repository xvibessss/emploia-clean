document.addEventListener('scroll', () => {
  const h = document.documentElement;
  const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
  document.getElementById('read-progress').style.width = Math.min(pct, 100) + '%';
});
async function submitNW(e, form) {
  e.preventDefault();
  const btn = form.querySelector('.nw-btn');
  btn.disabled = true; btn.textContent = '…';
  try {
    const res = await fetch('/api/newsletter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.querySelector('.nw-input').value, source: 'blog-reconversion' })
    });
    if (res.ok) { form.style.display = 'none'; form.nextElementSibling.style.display = 'block'; }
    else { btn.disabled = false; btn.textContent = "S'abonner →"; }
  } catch { btn.disabled = false; btn.textContent = "S'abonner →"; }
}

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["navigator_clipboard_writeText_9302"] = function (event) {
  navigator.clipboard.writeText('https://emploia.eu/blog/reconversion-professionnelle-2026');this.textContent='✓ Copié !';setTimeout(()=>this.textContent='🔗 Copier',2000)
};
