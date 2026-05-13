'use strict';

// ── Helpers ───────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function showToast(msg) {
  const old = document.querySelector('.popup-toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'popup-toast';
  el.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);background:#22c55e;color:#fff;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;z-index:9999;white-space:nowrap;';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ── Load saved profile ────────────────────────────────────────────────────

chrome.storage.local.get(['emploia_profile'], (data) => {
  if (data.emploia_profile) {
    showProfileState(data.emploia_profile);
  } else {
    showConnectState();
  }
});

// Update site info in footer
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs[0]) return;
  const url = new URL(tabs[0].url);
  $('siteInfo').textContent = url.hostname.replace('www.', '');
});

// ── Connect state ─────────────────────────────────────────────────────────

function showConnectState() {
  $('stateConnect').style.display = 'block';
  $('stateProfile').style.display = 'none';
  $('statusDot').className = 'header-status';

  // Pre-fill from storage
  chrome.storage.local.get(['emploia_draft'], (data) => {
    if (data.emploia_draft) {
      const d = data.emploia_draft;
      if (d.email) $('inputEmail').value = d.email;
      if (d.firstName) $('inputFirst').value = d.firstName;
      if (d.lastName) $('inputLast').value = d.lastName;
      if (d.phone) $('inputPhone').value = d.phone;
      if (d.location) $('inputCity').value = d.location;
      if (d.linkedin) $('inputLinkedin').value = d.linkedin;
      if (d.title) $('inputTitle').value = d.title;
      if (d.summary) $('inputProfile').value = d.summary;
    }
  });
}

function saveProfile() {
  const profile = {
    email: $('inputEmail').value.trim(),
    firstName: $('inputFirst').value.trim(),
    lastName: $('inputLast').value.trim(),
    phone: $('inputPhone').value.trim(),
    location: $('inputCity').value.trim(),
    linkedin: $('inputLinkedin').value.trim(),
    title: $('inputTitle').value.trim(),
    summary: $('inputProfile').value.trim(),
  };

  if (!profile.email && !profile.firstName) {
    $('inputEmail').style.borderColor = '#ef4444';
    return;
  }

  const btn = $('btnSave');
  btn.disabled = true; btn.textContent = 'Sauvegarde…';

  chrome.storage.local.set({ emploia_profile: profile, emploia_draft: profile }, () => {
    btn.disabled = false; btn.textContent = 'Sauvegarder le profil';
    showToast('Profil sauvegardé !');
    setTimeout(() => showProfileState(profile), 800);
  });
}

// ── Profile state ─────────────────────────────────────────────────────────

function showProfileState(profile) {
  $('stateConnect').style.display = 'none';
  $('stateProfile').style.display = 'block';
  $('statusDot').className = 'header-status connected';

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email || 'Utilisateur';
  $('pAvatar').textContent = (profile.firstName || profile.email || 'U')[0].toUpperCase();
  $('pName').textContent = fullName;
  $('pTitle').textContent = profile.title || 'Profil Emploia';
  $('pEmail').textContent = profile.email || '—';
  $('pPhone').textContent = profile.phone || '—';
  $('pCity').textContent = profile.location || '—';
  $('pLinkedin').textContent = profile.linkedin ? profile.linkedin.replace('https://linkedin.com/in/', '@') : '—';

  // Detect site
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    try {
      const host = new URL(tabs[0].url).hostname;
      const siteMap = {
        'linkedin.com': 'LinkedIn — Easy Apply détecté',
        'indeed': 'Indeed — formulaire détecté',
        'welcometothejungle': 'Welcome to the Jungle',
        'jobteaser': 'JobTeaser',
        'hellowork': 'HelloWork',
        'apec.fr': 'APEC',
        'francetravail.fr': 'France Travail',
      };
      const label = Object.entries(siteMap).find(([k]) => host.includes(k));
      $('siteLabel').textContent = label ? label[1] : 'Cliquez sur le bouton violet sur la page';
    } catch {}
  });
}

function triggerAutofill() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    // Send message to content script to trigger autofill
    chrome.tabs.sendMessage(tabs[0].id, { type: 'TRIGGER_AUTOFILL' }, (res) => {
      if (chrome.runtime.lastError) {
        showToast('Rechargez la page puis réessayez');
        return;
      }
      showToast('Autofill déclenché !');
    });
  });
}

function editProfile() {
  chrome.storage.local.get(['emploia_profile'], (data) => {
    const p = data.emploia_profile || {};
    if (p.email) $('inputEmail').value = p.email;
    if (p.firstName) $('inputFirst').value = p.firstName;
    if (p.lastName) $('inputLast').value = p.lastName;
    if (p.phone) $('inputPhone').value = p.phone;
    if (p.location) $('inputCity').value = p.location;
    if (p.linkedin) $('inputLinkedin').value = p.linkedin;
    if (p.title) $('inputTitle').value = p.title;
    if (p.summary) $('inputProfile').value = p.summary;
    showConnectState();
    $('stateConnect').style.display = 'block';
    $('stateProfile').style.display = 'none';
  });
}

function disconnect() {
  chrome.runtime.sendMessage({ type: 'CLEAR_PROFILE' }, () => {
    showToast('Déconnecté');
    setTimeout(showConnectState, 500);
  });
}

// Listen for TRIGGER_AUTOFILL from external (e.g. keyboard shortcut)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'AUTOFILL_DONE') {
    showToast(`${msg.count} champ${msg.count > 1 ? 's' : ''} rempli${msg.count > 1 ? 's' : ''} !`);
  }
});
