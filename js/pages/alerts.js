  let allAlerts = [];
  let maxAlerts = 10;

  const TYPE_LABELS = { all: 'Tous types', cdi: 'CDI', cdd: 'CDD', stage: 'Stage', alternance: 'Alternance', freelance: 'Freelance' };
  const TYPE_BADGES = { all: 'badge-gray', cdi: 'badge-blue', cdd: 'badge-purple', stage: 'badge-green', alternance: 'badge-yellow', freelance: 'badge-red' };
  const TYPE_EMOJIS = { all: '📋', cdi: '💼', cdd: '📋', stage: '🎓', alternance: '🔄', freelance: '⚡' };

  async function loadAlerts() {
    try {
      const res = await fetch('/api/alerts', { credentials: 'include' });
      if (res.status === 401) { showAuthRequired(); return; }
      if (res.ok) {
        const d = await res.json();
        allAlerts = d.alerts || [];
        maxAlerts = d.maxAlerts || 10;
        renderAlerts();
        updateCountBadge();
      }
    } catch { empToast('Erreur de chargement', 'error'); }
  }

  function renderAlerts() {
    const el = document.getElementById('alertsList');
    document.getElementById('alertsCount').textContent = allAlerts.length;
    if (!allAlerts.length) {
      el.innerHTML = `<div style="text-align:center;padding:48px 24px;color:var(--t3)">
        <div style="font-size:40px;margin-bottom:12px">🔔</div>
        <div style="font-size:14px;font-weight:700;color:var(--t2);margin-bottom:6px">Aucune alerte configurée</div>
        <div style="font-size:12px">Créez votre première alerte pour ne plus rater d'opportunité.</div>
      </div>`;
      return;
    }
    el.innerHTML = allAlerts.map(a => {
      const typeLabel = TYPE_LABELS[a.type] || a.type;
      const typeEmoji = TYPE_EMOJIS[a.type] || '📋';
      const typeBadge = TYPE_BADGES[a.type] || 'badge-gray';
      const freqLabel = a.frequency === 'weekly' ? '📬 Hebdomadaire' : '📧 Quotidienne';
      const date = a.createdAt ? new Date(a.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
      return `
        <div class="alert-card" id="alert-${esc(a.id)}">
          <div class="alert-info">
            <div class="alert-keywords">🔍 ${esc(a.keywords)}</div>
            <div class="alert-meta">
              ${a.location ? `<span class="badge badge-gray">📍 ${esc(a.location)}</span>` : ''}
              <span class="badge ${typeBadge}">${typeEmoji} ${esc(typeLabel)}</span>
              <span class="badge badge-green">${freqLabel}</span>
              ${date ? `<span style="font-size:10px;color:var(--t3)">Créée le ${date}</span>` : ''}
            </div>
          </div>
          <div class="alert-actions">
            <a href="/jobs?q=${encodeURIComponent(a.keywords)}${a.location ? '&location=' + encodeURIComponent(a.location) : ''}${a.type !== 'all' ? '&type=' + encodeURIComponent(a.type) : ''}" class="btn btn-ghost btn-sm" style="font-size:11px">Voir offres →</a>
            <button class="btn btn-ghost btn-sm" style="font-size:11px;color:var(--rnb)" data-on-click="deleteAlert_this_getAttribute_dc8a" data-arg-580e-0="${esc(a.id)}">🗑</button>
          </div>
        </div>`;
    }).join('');
  }

  function updateCountBadge() {
    const el = document.getElementById('alertCountBadge');
    if (el) el.textContent = `${allAlerts.length} / ${maxAlerts} alertes`;
  }

  async function createAlert() {
    const keywords  = document.getElementById('alertKeywords').value.trim();
    const location  = document.getElementById('alertLocation').value.trim();
    const type      = document.getElementById('alertType').value;
    const frequency = document.getElementById('alertFrequency').value;

    if (!keywords) { empToast('Entrez au moins un mot-clé', 'error'); document.getElementById('alertKeywords').focus(); return; }
    if (allAlerts.length >= maxAlerts) { empToast(`Maximum ${maxAlerts} alertes atteint${maxAlerts === 10 ? '. Passez Pro pour 50 alertes.' : '.'}`, 'error'); return; }

    const btn = document.getElementById('createAlertBtn');
    btn.disabled = true;
    btn.textContent = 'Création...';

    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords, location, type, frequency }),
      });
      if (res.status === 401) { empShowAuth('login'); btn.disabled = false; btn.textContent = '🔔 Créer cette alerte'; return; }
      const d = await res.json();
      if (res.ok) {
        allAlerts.push(d.alert);
        renderAlerts();
        updateCountBadge();
        document.getElementById('alertKeywords').value = '';
        document.getElementById('alertLocation').value = '';
        empToast('Alerte créée ! Vous recevrez vos premiers résultats prochainement.', 'success');
      } else {
        empToast(d.error || 'Erreur', 'error');
      }
    } catch {
      empToast('Erreur réseau', 'error');
    }

    btn.disabled = false;
    btn.textContent = '🔔 Créer cette alerte';
  }

  async function deleteAlert(id) {
    if (!confirm('Supprimer cette alerte ?')) return;
    try {
      const res = await fetch('/api/alerts?id=' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        allAlerts = allAlerts.filter(a => a.id !== id);
        renderAlerts();
        updateCountBadge();
        empToast('Alerte supprimée', 'info');
      }
    } catch { empToast('Erreur', 'error'); }
  }

  function showAuthRequired() {
    const el = document.getElementById('alertsList');
    el.innerHTML = `<div style="text-align:center;padding:40px 24px">
      <div style="font-size:40px;margin-bottom:12px">🔐</div>
      <div style="font-size:15px;font-weight:800;color:var(--t1);margin-bottom:8px">Connexion requise</div>
      <div style="font-size:13px;color:var(--t2);margin-bottom:20px">Connectez-vous pour gérer vos alertes emploi.</div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button data-on-click="empShowAuth_register_cac5" class="btn btn-primary btn-sm">S'inscrire gratuitement</button>
        <button data-on-click="empShowAuth_login_c158" class="btn btn-ghost btn-sm">Se connecter</button>
      </div>
    </div>`;
    window.addEventListener('empAuthChange', e => { if (e.detail?.user) loadAlerts(); }, { once: true });
  }

  // ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────
  let pushSubscription = null;

  async function initPush() {
    if (!('PushManager' in window) || !('serviceWorker' in navigator)) return;
    const card = document.getElementById('pushCard');
    if (card) card.style.display = 'flex';

    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        pushSubscription = existing;
        setPushUI(true);
      } else {
        setPushUI(false);
      }
    } catch { /* push not supported in this browser */ }
  }

  function setPushUI(active) {
    const btn = document.getElementById('pushBtn');
    const status = document.getElementById('pushStatus');
    if (!btn || !status) return;
    if (active) {
      btn.textContent = 'Désactiver';
      btn.style.color = 'var(--rnb)';
      status.textContent = '✅ Notifications activées — vous serez alerté immédiatement pour chaque nouvelle offre.';
    } else {
      btn.textContent = 'Activer';
      btn.style.color = '';
      status.textContent = 'Recevez une notification immédiate dès qu\'une offre correspond à vos alertes.';
    }
  }

  async function togglePushNotifs() {
    const btn = document.getElementById('pushBtn');
    btn.disabled = true;
    try {
      const reg = await navigator.serviceWorker.ready;
      if (pushSubscription) {
        await pushSubscription.unsubscribe();
        await fetch('/api/push-subscribe', {
          method: 'DELETE', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: pushSubscription.endpoint }),
        });
        pushSubscription = null;
        setPushUI(false);
        empToast('Notifications désactivées', 'info');
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { empToast('Permission refusée par le navigateur', 'error'); return; }
        const keyRes = await fetch('/api/push-subscribe', { credentials: 'include' });
        if (!keyRes.ok) { empToast('Service push non disponible', 'error'); return; }
        const { publicKey } = await keyRes.json();
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        pushSubscription = sub;
        await fetch('/api/push-subscribe', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
        setPushUI(true);
        empToast('Notifications push activées !', 'success');
      }
    } catch (err) {
      empToast('Erreur : ' + (err.message || 'réessayez'), 'error');
    }
    btn.disabled = false;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
    return output;
  }

  // Pre-fill from jobs page search
  const p = new URLSearchParams(window.location.search);
  if (p.get('q')) document.getElementById('alertKeywords').value = p.get('q');
  if (p.get('location')) document.getElementById('alertLocation').value = p.get('location');
  if (p.get('type') && p.get('type') !== 'tous') document.getElementById('alertType').value = p.get('type');

  loadAlerts();
  initPush();

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["createAlert"] = function (event) {
  createAlert()
};
EMP_H["deleteAlert_this_getAttribute_dc8a"] = function (event) {
  deleteAlert(this.getAttribute("data-arg-580e-0"))
};
EMP_H["empShowAuth_register_cac5"] = function (event) {
  empShowAuth('register')
};
EMP_H["if_event_key_Enter_createAlert_ef48"] = function (event) {
  if(event.key==='Enter')createAlert()
};
EMP_H["togglePushNotifs"] = function (event) {
  togglePushNotifs()
};
