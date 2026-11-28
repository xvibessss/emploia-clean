  // Show nav CTA for non-logged users
  document.getElementById('nav404cta').style.display = '';

  // Search redirect
  function errSearch() {
    const q = document.getElementById('errSearch').value.trim();
    if (q) window.location.href = '/jobs?q=' + encodeURIComponent(q);
  }
  document.getElementById('errSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') errSearch();
  });

  // Floating particles
  const container = document.getElementById('particles');
  const colors = ['rgba(110,72,190,.35)', 'rgba(154,119,216,.3)', 'rgba(197,174,236,.4)'];
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = 2 + Math.random() * 4;
    p.style.cssText = `
      left:${Math.random()*100}%;
      width:${size}px;
      height:${size}px;
      opacity:${0.15 + Math.random() * 0.35};
      animation-duration:${7 + Math.random() * 9}s;
      animation-delay:${-Math.random() * 9}s;
      background:${colors[Math.floor(Math.random() * colors.length)]};
    `;
    container.appendChild(p);
  }

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["errSearch"] = function (event) {
  errSearch()
};
