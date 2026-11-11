/* ════════════════════════════════════════════════════════
   CV VAULT — page logic
════════════════════════════════════════════════════════ */

const MONTH_NAMES = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

/* State */
let state = {
  versions: [],
  filtered: [],
  maxVersions: 3,
  plan: 'free',
  filter: 'all',
  search: '',
  activeModalId: null
};

/* ── INIT ─────────────────────────────────────────── */
function init() {
  // Wait for auth to resolve before deciding what to show
  const authReady = () => {
    if (window.empUser) {
      fetchVersions();
    } else {
      // Show auth gate after short delay (let shared.js finish empAuthInit)
      setTimeout(() => {
        if (!window.empUser) {
          document.getElementById('vaultAuthGate').classList.add('open');
          document.body.style.overflow = 'hidden';
          hideSkeleton();
        }
      }, 800);
    }
  };

  if (window.empUser !== undefined && window.empUser !== null) {
    authReady();
  } else {
    window.addEventListener('empUserLoaded', () => {
      document.getElementById('vaultAuthGate').classList.remove('open');
      document.body.style.overflow = '';
      fetchVersions();
    }, { once: true });
    // If no user event fires (not logged in), empAuthInit will complete and empUser stays null
    window.addEventListener('empAuthChange', e => {
      if (e.detail.user) {
        document.getElementById('vaultAuthGate').classList.remove('open');
        document.body.style.overflow = '';
        fetchVersions();
      }
    });
    authReady();
  }
}

/* ── FETCH ───────────────────────────────────────── */
async function fetchVersions() {
  try {
    const res = await fetch('/api/cv-versions', { credentials: 'same-origin' });
    if (res.status === 401) {
      document.getElementById('vaultAuthGate').classList.add('open');
      document.body.style.overflow = 'hidden';
      hideSkeleton();
      return;
    }
    if (!res.ok) throw new Error('Erreur serveur');
    const data = await res.json();
    state.versions = data.versions || [];
    state.maxVersions = data.maxVersions || 3;
    state.plan = data.plan || 'free';
    applyFilter();
    renderUsageBar(state.versions.length, state.maxVersions);
    showUpgradeBanner();
  } catch (err) {
    hideSkeleton();
    empToast('Impossible de charger les documents', 'error');
  }
}

/* ── FILTER ──────────────────────────────────────── */
function setFilter(f) {
  state.filter = f;
  document.querySelectorAll('.vault-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === f);
  });
  applyFilter();
}

function setSearch(q) {
  state.search = q.toLowerCase().trim();
  applyFilter();
}

function applyFilter() {
  let filtered = state.filter === 'all' ? state.versions : state.versions.filter(v => v.type === state.filter);
  if (state.search) filtered = filtered.filter(v => (v.name || '').toLowerCase().includes(state.search));
  state.filtered = filtered;
  renderVersions(state.filtered);
}

/* ── RENDER VERSIONS ─────────────────────────────── */
function renderVersions(versions) {
  hideSkeleton();
  const grid = document.getElementById('vaultGrid');
  const empty = document.getElementById('vaultEmpty');
  const toolbar = document.getElementById('vaultToolbar');
  const countLabel = document.getElementById('vaultCountLabel');

  if (state.versions.length > 0) toolbar.style.display = '';

  if (versions.length === 0) {
    grid.style.display = 'none';
    if (state.filter === 'all') {
      empty.style.display = '';
      toolbar.style.display = 'none';
    } else {
      empty.style.display = '';
      empty.querySelector('h3').textContent = 'Aucun document dans cette catégorie';
      empty.querySelector('p').textContent = 'Changez de filtre ou générez un nouveau document.';
    }
    if (countLabel) countLabel.textContent = '';
    return;
  }

  empty.style.display = 'none';
  grid.style.display = '';
  if (countLabel) countLabel.textContent = versions.length + ' document' + (versions.length > 1 ? 's' : '');

  grid.innerHTML = versions.map(v => renderCard(v)).join('');
}

/* ── RENDER CARD ─────────────────────────────────── */
function renderCard(v) {
  const badge = typeBadge(v.type);
  const date = formatDate(v.updatedAt || v.createdAt);
  const chars = v.charCount != null ? formatChars(v.charCount) : '';
  const preview = (v.content || '').slice(0, 180).trim();

  return `<article class="vcard reveal" data-id="${esc(v.id)}">
    <div class="vcard-header">
      <div class="vcard-name-wrap">
        <div class="vcard-name" title="Double-cliquez pour renommer" data-on-dblclick="startRename_this_getAttribute_210f" data-arg-ba75-0="${esc(v.id)}" id="name-${esc(v.id)}">${esc(v.name || 'Document sans titre')}</div>
        <input class="vcard-name-input" id="input-${esc(v.id)}" type="text" value="${esc(v.name || '')}" maxlength="120"
          data-on-blur="confirmRename_this_getAttribut_809a" data-arg-1cc7-0="${esc(v.id)}"
          data-on-keydown="handleRenameKey_event_this_get_9d42" data-arg-fe51-0="${esc(v.id)}"/>
        <div class="vcard-name-hint">Dbl-clic pour renommer</div>
      </div>
      <span class="vcard-badge ${badge.cls}">${badge.label}</span>
    </div>
    <div class="vcard-meta">
      <span class="vcard-meta-item">
        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style="opacity:.6"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/></svg>
        ${esc(date)}
      </span>
      ${chars ? `<span class="vcard-meta-item">
        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style="opacity:.6"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd"/></svg>
        ${esc(chars)}
      </span>` : ''}
    </div>
    ${preview ? `<div class="vcard-preview">${esc(preview)}</div>` : ''}
    <div class="vcard-actions">
      <button class="emp-btn emp-btn-secondary emp-btn-sm see-btn" data-on-click="openView_this_getAttribute_dat_4ce6" data-arg-53b4-0="${esc(v.id)}">
        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>
        Voir
      </button>
      <button class="vcard-icon-btn" title="Copier le contenu" data-on-click="copyContent_this_getAttribute_f6e1" data-arg-cce9-0="${esc(v.id)}">
        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/></svg>
      </button>
      <button class="vcard-icon-btn delete" title="Supprimer" data-on-click="deleteVersion_donnees" data-id="${esc(v.id)}" data-name="${esc(v.name||'')}">
        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
      </button>
    </div>
  </article>`;
}

/* ── TYPE BADGE ──────────────────────────────────── */
function typeBadge(type) {
  if (type === 'cv') return { cls: 'vcard-badge-cv', label: 'CV' };
  if (type === 'letter') return { cls: 'vcard-badge-letter', label: 'Lettre' };
  return { cls: 'vcard-badge-other', label: 'Autre' };
}

/* ── USAGE BAR ───────────────────────────────────── */
function renderUsageBar(current, max) {
  const label = document.getElementById('vaultUsageLabel');
  const maxEl = document.getElementById('vaultUsageMax');
  const fill = document.getElementById('vaultUsageFill');
  const pct = max > 0 ? Math.min(current / max * 100, 100) : 0;

  if (label) label.textContent = current + ' document' + (current !== 1 ? 's' : '');
  if (maxEl) maxEl.textContent = '/ ' + max;
  if (fill) {
    fill.style.width = pct + '%';
    fill.classList.toggle('full', current >= max);
  }
}

/* ── UPGRADE BANNER ──────────────────────────────── */
function showUpgradeBanner() {
  const banner = document.getElementById('vaultUpgradeBanner');
  if (!banner) return;
  banner.style.display = (state.plan === 'free' && state.versions.length >= state.maxVersions) ? '' : 'none';
}

/* ── OPEN MODAL ──────────────────────────────────── */
function openView(id) {
  const v = state.versions.find(v => v.id === id);
  if (!v) return;
  state.activeModalId = id;
  document.getElementById('vaultModalTitle').textContent = v.name || 'Document';
  document.getElementById('vaultModalContent').textContent = v.content || '';
  document.getElementById('vaultModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  trackEvent('cv_vault_view', { type: v.type });
}

function closeModal() {
  document.getElementById('vaultModal').classList.remove('open');
  document.body.style.overflow = '';
  state.activeModalId = null;
}

function copyModalContent() {
  const content = document.getElementById('vaultModalContent').textContent;
  copyContent(state.activeModalId, content);
}

function downloadModalContent() {
  const v = state.versions.find(v => v.id === state.activeModalId);
  if (!v) return;
  const text = v.content || '';
  const name = (v.name || v.type || 'document').replace(/[^a-z0-9\-_]/gi, '_');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${name}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  empToast('Document téléchargé !', 'success');
}

/* ── COPY ────────────────────────────────────────── */
function copyContent(id, textOverride) {
  const v = state.versions.find(v => v.id === id);
  if (!v) return;
  const text = textOverride || v.content || '';
  navigator.clipboard?.writeText(text).then(() => {
    empToast('Document copié dans le presse-papiers !', 'success');
    trackEvent('cv_vault_copy', { type: v.type });
  }).catch(() => {
    empToast('Impossible de copier. Essayez manuellement.', 'error');
  });
}

/* ── INLINE RENAME ───────────────────────────────── */
function startRename(id, nameEl) {
  const input = document.getElementById('input-' + id);
  if (!input) return;
  nameEl.style.display = 'none';
  input.style.display = 'block';
  input.focus();
  input.select();
}

function handleRenameKey(e, id) {
  if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  if (e.key === 'Escape') { cancelRename(id); }
}

function cancelRename(id) {
  const v = state.versions.find(v => v.id === id);
  if (!v) return;
  const input = document.getElementById('input-' + id);
  const nameEl = document.getElementById('name-' + id);
  if (input) { input.value = v.name || ''; input.style.display = 'none'; }
  if (nameEl) nameEl.style.display = '';
}

async function confirmRename(id, newName) {
  const v = state.versions.find(v => v.id === id);
  if (!v) return;
  const trimmed = newName.trim();
  const input = document.getElementById('input-' + id);
  const nameEl = document.getElementById('name-' + id);

  // Restore display regardless
  if (input) input.style.display = 'none';
  if (nameEl) nameEl.style.display = '';

  if (!trimmed || trimmed === v.name) return;

  // Optimistic update
  const previous = v.name;
  v.name = trimmed;
  if (nameEl) nameEl.textContent = trimmed;

  try {
    const res = await fetch('/api/cv-versions?id=' + encodeURIComponent(id), {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed })
    });
    if (!res.ok) throw new Error('Erreur serveur');
    empToast('Document renommé', 'success');
  } catch {
    // Rollback
    v.name = previous;
    if (nameEl) nameEl.textContent = previous;
    if (input) input.value = previous;
    empToast('Impossible de renommer le document', 'error');
  }
}

/* ── DELETE ──────────────────────────────────────── */
function deleteVersion(id, name) {
  const displayName = name || 'ce document';
  if (!confirm('Supprimer « ' + displayName + ' » ? Cette action est irréversible.')) return;
  doDelete(id);
}

async function doDelete(id) {
  // Optimistic remove from UI
  state.versions = state.versions.filter(v => v.id !== id);
  applyFilter();
  renderUsageBar(state.versions.length, state.maxVersions);
  showUpgradeBanner();

  try {
    const res = await fetch('/api/cv-versions?id=' + encodeURIComponent(id), {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('Erreur serveur');
    empToast('Document supprimé', 'success');
    trackEvent('cv_vault_delete');
  } catch {
    empToast('Erreur lors de la suppression', 'error');
    // Re-fetch to restore consistent state
    fetchVersions();
  }
}

/* ── HELPERS ─────────────────────────────────────── */
function hideSkeleton() {
  const skel = document.getElementById('vaultSkeleton');
  if (skel) skel.style.display = 'none';
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
  } catch { return ''; }
}

function formatChars(n) {
  if (typeof n !== 'number') return '';
  return n.toLocaleString('fr-FR') + ' car.';
}

/* ── MODAL BACKDROP CLOSE ────────────────────────── */
document.getElementById('vaultModal').addEventListener('click', e => {
  if (e.target === document.getElementById('vaultModal')) closeModal();
});

/* ── KEYBOARD SHORTCUTS ──────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('vaultModal').classList.contains('open')) closeModal();
  }
});

/* ── BOOT ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["closeModal"] = function (event) {
  closeModal()
};
EMP_H["confirmRename_this_getAttribut_809a"] = function (event) {
  confirmRename(this.getAttribute("data-arg-1cc7-0"), this.value)
};
EMP_H["copyContent_this_getAttribute_f6e1"] = function (event) {
  copyContent(this.getAttribute("data-arg-cce9-0"))
};
EMP_H["copyModalContent"] = function (event) {
  copyModalContent()
};
EMP_H["downloadModalContent"] = function (event) {
  downloadModalContent()
};
EMP_H["handleRenameKey_event_this_get_9d42"] = function (event) {
  handleRenameKey(event, this.getAttribute("data-arg-fe51-0"))
};
EMP_H["openView_this_getAttribute_dat_4ce6"] = function (event) {
  openView(this.getAttribute("data-arg-53b4-0"))
};
EMP_H["setFilter_all_ba1c"] = function (event) {
  setFilter('all')
};
EMP_H["setFilter_cv_c9f9"] = function (event) {
  setFilter('cv')
};
EMP_H["setFilter_letter_6b46"] = function (event) {
  setFilter('letter')
};
EMP_H["setFilter_other_c3a0"] = function (event) {
  setFilter('other')
};
EMP_H["setSearch_this_value_392c"] = function (event) {
  setSearch(this.value)
};
EMP_H["startRename_this_getAttribute_210f"] = function (event) {
  startRename(this.getAttribute("data-arg-ba75-0"), this)
};
EMP_H["deleteVersion_donnees"] = function (event) {
  deleteVersion(this.getAttribute("data-id"), this.getAttribute("data-name"))
};
