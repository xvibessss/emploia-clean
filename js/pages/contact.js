window.addEventListener('empUserLoaded', function(e){
  const u = e.detail;
  if(u && u.name) document.getElementById('cName').value = u.name;
  if(u && u.email) document.getElementById('cEmail').value = u.email;
});
if(window.empUser){
  if(window.empUser.name) document.getElementById('cName').value = window.empUser.name;
  if(window.empUser.email) document.getElementById('cEmail').value = window.empUser.email;
}

async function submitContact(){
  const name = document.getElementById('cName').value.trim();
  const email = document.getElementById('cEmail').value.trim();
  const subject = document.getElementById('cSubject').value;
  const message = document.getElementById('cMessage').value.trim();
  const errEl = document.getElementById('cError');
  errEl.style.display = 'none';
  if(!name || name.length < 2){ errEl.textContent = 'Veuillez entrer votre nom.'; errEl.style.display = 'block'; return; }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){ errEl.textContent = 'Email invalide.'; errEl.style.display = 'block'; return; }
  if(!message || message.length < 10){ errEl.textContent = 'Message trop court (10 caractères minimum).'; errEl.style.display = 'block'; return; }
  const btn = document.getElementById('cSubmit');
  btn.disabled = true; btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Envoi en cours…';
  try {
    const res = await fetch('/api/contact', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,email,subject,message}) });
    if(res.ok){
      document.getElementById('contactForm').style.display = 'none';
      document.getElementById('successMsg').style.display = 'block';
    } else {
      const d = await res.json().catch(()=>({}));
      errEl.textContent = d.error || 'Erreur lors de l\'envoi. Écrivez directement à contact@emploia.eu';
      errEl.style.display = 'block';
      btn.disabled = false; btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Envoyer le message';
    }
  } catch {
    errEl.textContent = 'Erreur réseau. Écrivez directement à contact@emploia.eu';
    errEl.style.display = 'block';
    btn.disabled = false; btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Envoyer le message';
  }
}

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["submitContact"] = function (event) {
  submitContact()
};
