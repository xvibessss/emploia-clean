  const rp = document.getElementById('readProgress');
  window.addEventListener('scroll', () => {
    const h = document.body.scrollHeight - window.innerHeight;
    rp.style.width = (h > 0 ? window.scrollY / h * 100 : 0) + '%';
  });
  function handleNewsletter(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.textContent = 'Inscription en cours...';
    fetch('/api/newsletter', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({email: e.target.querySelector('input').value})
    }).then(() => { btn.textContent = 'Inscrit !'; }).catch(() => { btn.textContent = 'Erreur, réessayez'; });
  }

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["handleNewsletter_event_35f7"] = function (event) {
  handleNewsletter(event)
};
EMP_H["navigator_clipboard_writeText_6781"] = function (event) {
  navigator.clipboard.writeText(location.href);this.textContent='Lien copié !';setTimeout(()=>this.textContent='Copier le lien',2000)
};
