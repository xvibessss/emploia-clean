  const token = new URLSearchParams(location.search).get('token');

  if (!token) {
    document.getElementById('rpForm').innerHTML = `
      <div style="text-align:center">
        <div style="font-size:48px;margin-bottom:16px">⚠️</div>
        <h1>Lien invalide</h1>
        <p class="rp-sub">Ce lien de réinitialisation est invalide ou a expiré.</p>
        <a href="/" style="display:inline-block;margin-top:16px;color:var(--blb);font-weight:700;font-size:14px">Retour à l'accueil</a>
      </div>`;
  }

  function rpStrength(pwd) {
    const bar = document.getElementById('rpBar');
    if (!bar) return;
    const score = [pwd.length >= 8, /[A-Z]/.test(pwd), /[0-9]/.test(pwd), pwd.length >= 12, /[^a-zA-Z0-9]/.test(pwd)].filter(Boolean).length;
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];
    bar.style.width = (score * 20) + '%';
    bar.style.background = colors[score - 1] || '#ef4444';
  }

  async function rpSubmit() {
    const password = document.getElementById('rpPassword').value;
    const confirm = document.getElementById('rpConfirm').value;
    const errEl = document.getElementById('rpError');
    const btn = document.getElementById('rpBtn');

    errEl.style.display = 'none';
    if (!password) { errEl.textContent = 'Entrez un mot de passe'; errEl.style.display = 'block'; return; }
    if (password !== confirm) { errEl.textContent = 'Les mots de passe ne correspondent pas'; errEl.style.display = 'block'; return; }
    if (password.length < 8) { errEl.textContent = 'Mot de passe trop court (8 caractères min)'; errEl.style.display = 'block'; return; }

    btn.disabled = true; btn.textContent = 'Enregistrement…';
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      document.getElementById('rpForm').style.display = 'none';
      document.getElementById('rpSuccess').style.display = 'block';
      setTimeout(() => { window.location.href = '/dashboard'; }, 2000);
    } catch (err) {
      errEl.textContent = err.message; errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Enregistrer le nouveau mot de passe';
    }
  }

  document.addEventListener('keydown', e => { if (e.key === 'Enter') rpSubmit(); });

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["rpStrength_this_value_3096"] = function (event) {
  rpStrength(this.value)
};
EMP_H["rpSubmit"] = function (event) {
  rpSubmit()
};
