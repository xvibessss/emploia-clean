'use strict';

// Les extensions Manifest V3 refusent tout JavaScript en ligne : les anciens
// attributs onclick="…" de cette fenêtre ne s'exécutaient pas, aucun bouton ne
// marchait. Tout est branché ici par addEventListener.

const $ = id => document.getElementById(id);
const CHAMPS = { inputFirst: 'firstName', inputLast: 'lastName', inputEmail: 'email', inputPhone: 'phone', inputCity: 'location', inputLinkedin: 'linkedin', inputTitle: 'title' };
let ongletId = null;

function toast(msg) {
  document.querySelector('.popup-toast')?.remove();
  const el = document.createElement('div');
  el.className = 'popup-toast';
  el.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);background:#22c55e;color:#fff;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;z-index:9999;white-space:nowrap;';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function afficherProfil(p) {
  const aUnProfil = !!(p && (p.email || p.firstName));
  $('stateProfile').style.display = aUnProfil ? 'block' : 'none';
  $('stateConnect').style.display = 'none';
  $('btnShowForm').style.display = aUnProfil ? 'none' : 'block';
  $('statusDot').className = aUnProfil ? 'header-status connected' : 'header-status';
  if (!aUnProfil) return;
  $('pAvatar').textContent = (p.firstName || p.email || 'E')[0].toUpperCase();
  $('pName').textContent = [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email;
  $('pTitle').textContent = p.title || '';
  $('pEmail').textContent = p.email || '—';
  $('pPhone').textContent = p.phone || '—';
  $('pCity').textContent = p.location || '—';
}

function ouvrirFormulaire(p) {
  for (const [id, cle] of Object.entries(CHAMPS)) $(id).value = (p && p[cle]) || '';
  $('stateConnect').style.display = 'block';
  $('stateProfile').style.display = 'none';
  $('btnShowForm').style.display = 'none';
}

function enregistrer() {
  const profil = {};
  for (const [id, cle] of Object.entries(CHAMPS)) profil[cle] = $(id).value.trim();
  if (!profil.email && !profil.firstName) { $('inputEmail').style.borderColor = '#ef4444'; return; }
  chrome.storage.local.set({ emploia_profile: profil }, () => { toast('Profil enregistré'); afficherProfil(profil); });
}

function envoyer(type) {
  return new Promise(resolve => {
    if (ongletId == null) return resolve(null);
    chrome.tabs.sendMessage(ongletId, { type }, res => resolve(chrome.runtime.lastError ? null : res));
  });
}

async function etatDeLaPage() {
  const [onglet] = await chrome.tabs.query({ active: true, currentWindow: true });
  ongletId = onglet ? onglet.id : null;
  const etat = await envoyer('PAGE_STATE');
  if (!etat) return; // page non prise en charge, ou chargée avant l'installation
  if (etat.offre) {
    $('pageTitle').textContent = 'Offre détectée';
    $('pageHint').textContent = 'Emploia l’ouvre dans le générateur, déjà collée.';
    $('btnAdapt').disabled = false;
  }
  if (etat.formulaire) {
    $('pageTitle').textContent = 'Formulaire de candidature';
    $('pageHint').textContent = 'Vérifiez toujours les champs avant d’envoyer.';
    $('btnFill').style.display = 'block';
  }
}

$('btnAdapt').addEventListener('click', async () => {
  const res = await envoyer('TRIGGER_ADAPT');
  if (res && res.ok) window.close(); else toast('Aucune offre lisible ici');
});
$('btnFill').addEventListener('click', async () => {
  const res = await envoyer('TRIGGER_AUTOFILL');
  toast(res && res.count ? `${res.count} champ(s) rempli(s)` : 'Aucun champ reconnu');
});
$('btnSave').addEventListener('click', enregistrer);
$('btnShowForm').addEventListener('click', () => ouvrirFormulaire(null));
$('btnEdit').addEventListener('click', () => chrome.storage.local.get(['emploia_profile'], d => ouvrirFormulaire(d.emploia_profile)));
$('btnClear').addEventListener('click', () => chrome.storage.local.remove(['emploia_profile', 'emploia_draft', 'emploia_token'], () => { toast('Profil effacé'); afficherProfil(null); }));

chrome.storage.local.get(['emploia_profile'], d => afficherProfil(d.emploia_profile));
etatDeLaPage();
