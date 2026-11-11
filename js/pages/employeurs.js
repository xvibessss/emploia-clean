  function toggleFaq(btn) {
    const item = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(el => el.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  }

  document.getElementById('jobForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    const errBox = document.getElementById('formError');
    errBox.style.display = 'none';

    const body = {
      title:        document.getElementById('title').value.trim(),
      company:      document.getElementById('company').value.trim(),
      location:     document.getElementById('location').value.trim(),
      type:         document.getElementById('type').value,
      description:  document.getElementById('description').value.trim(),
      contactEmail: document.getElementById('contactEmail').value.trim(),
      applyUrl:     document.getElementById('applyUrl').value.trim(),
      salaryMin:    parseInt(document.getElementById('salaryMin').value) || 0,
      salaryMax:    parseInt(document.getElementById('salaryMax').value) || 0,
      remote:       document.getElementById('remote').checked,
    };

    btn.disabled = true;
    btn.textContent = 'Publication en cours…';

    try {
      const res = await fetch('/api/employer/post-job', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        errBox.textContent = data.error || 'Une erreur est survenue.';
        errBox.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Publier mon offre gratuitement →';
        return;
      }
      document.getElementById('jobForm').style.display = 'none';
      document.getElementById('formSuccess').style.display = 'block';
      window.scrollTo({ top: document.getElementById('poster-offre').offsetTop - 20, behavior: 'smooth' });
    } catch {
      errBox.textContent = 'Erreur réseau. Vérifiez votre connexion et réessayez.';
      errBox.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Publier mon offre gratuitement →';
    }
  });

  // ── Self-service management: /employeurs?manage=<token> ──
  (function () {
    const token = new URLSearchParams(location.search).get('manage');
    if (!token) return;
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const fmtDate = s => { try { return new Date(s).toLocaleDateString('fr-FR'); } catch { return ''; } };
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = '<div style="background:#fff;border-radius:20px;max-width:460px;width:100%;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.3)"><div id="manageBody"><p style="color:#64748b">Chargement de votre offre…</p></div></div>';
    document.body.appendChild(ov);
    const body = ov.querySelector('#manageBody');
    const card = (title, msg) => '<h2 style="font-size:19px;font-weight:800;color:#0f172a;margin:0 0 8px">' + esc(title) + '</h2><p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 18px">' + esc(msg) + '</p><a href="/employeurs" style="color:#6366f1;font-weight:600;font-size:14px">← Retour</a>';
    function show(job) {
      const act = async (action) => {
        const msg = body.querySelector('#mMsg'); msg.textContent = '…'; msg.style.color = '#64748b';
        try {
          const r = await fetch('/api/employer/manage-job', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action }) });
          const d = await r.json();
          if (!r.ok) { msg.textContent = d.error || 'Erreur'; msg.style.color = '#b91c1c'; return; }
          show(d.job);
          const m2 = body.querySelector('#mMsg');
          if (m2) { m2.textContent = action === 'close' ? "Offre clôturée — elle n'apparaît plus aux candidats." : action === 'confirm' ? 'Offre publiée ✅ Elle est visible par les candidats.' : 'Offre prolongée de 45 jours ✅'; m2.style.color = '#0f9d6b'; }
        } catch { msg.textContent = 'Problème réseau, réessayez.'; msg.style.color = '#b91c1c'; }
      };
      if (job.status === 'pending') {
        body.innerHTML =
          '<h2 style="font-size:19px;font-weight:800;color:#0f172a;margin:0 0 4px">Publier votre offre</h2>' +
          '<p style="color:#64748b;font-size:13px;margin:0 0 16px">' + esc(job.title) + ' · ' + esc(job.company) + '</p>' +
          '<p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px">Votre offre attend votre confirmation. Une fois publiée, elle reste en ligne 45 jours et vous pourrez la prolonger ou la clôturer depuis ce même lien.</p>' +
          '<button id="mConfirm" style="width:100%;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;border:0;border-radius:11px;padding:13px;font-weight:700;font-size:14px;cursor:pointer">Publier mon offre →</button>' +
          '<div id="mMsg" style="font-size:13px;margin-top:12px"></div>';
        body.querySelector('#mConfirm').addEventListener('click', () => act('confirm'));
        return;
      }
      const live = job.status === 'active' && job.live;
      const label = job.status === 'closed' ? 'Clôturée' : (job.live ? 'En ligne' : 'Expirée');
      const color = live ? '#0f9d6b' : '#c8781a';
      body.innerHTML =
        '<h2 style="font-size:19px;font-weight:800;color:#0f172a;margin:0 0 4px">Gérer votre offre</h2>' +
        '<p style="color:#64748b;font-size:13px;margin:0 0 16px">' + esc(job.title) + ' · ' + esc(job.company) + '</p>' +
        '<div style="margin-bottom:16px"><span style="font-size:12px;font-weight:700;color:' + color + '">● ' + label + '</span>' + (live ? '<span style="font-size:12px;color:#94a3b8"> · expire le ' + fmtDate(job.expiresAt) + '</span>' : '') + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:10px">' +
        (live
          ? '<button id="mRenew" style="background:#eef2ff;color:#4141d6;border:0;border-radius:11px;padding:13px;font-weight:700;font-size:14px;cursor:pointer">Prolonger de 45 jours</button><button id="mClose" style="background:#fff;color:#b91c1c;border:1.5px solid #fecaca;border-radius:11px;padding:13px;font-weight:700;font-size:14px;cursor:pointer">Clôturer (poste pourvu)</button>'
          : '<button id="mRenew" style="background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;border:0;border-radius:11px;padding:13px;font-weight:700;font-size:14px;cursor:pointer">Remettre en ligne (45 j) →</button>') +
        '</div><div id="mMsg" style="font-size:13px;margin-top:12px"></div>' +
        '<div style="text-align:center;margin-top:16px"><a href="/employeurs" style="color:#94a3b8;font-size:13px">Fermer</a></div>';
      body.querySelector('#mRenew')?.addEventListener('click', () => act('renew'));
      body.querySelector('#mClose')?.addEventListener('click', () => act('close'));
    }
    (async function load() {
      try {
        const r = await fetch('/api/employer/manage-job?token=' + encodeURIComponent(token));
        const d = await r.json();
        if (!r.ok || !d.job) { body.innerHTML = card('Offre introuvable', d.error || "Ce lien de gestion n'est plus valide."); return; }
        show(d.job);
      } catch { body.innerHTML = card('Erreur', 'Problème réseau, réessayez.'); }
    })();
  })();

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["toggleFaq_this_d030"] = function (event) {
  toggleFaq(this)
};
