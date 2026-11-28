// ── DATA MODEL ────────────────────────────────────────────────────
const SECTION_META = {
  exp:    { label: 'Expérience',    icon: '💼' },
  edu:    { label: 'Formation',     icon: '🎓' },
  skills: { label: 'Compétences',  icon: '⭐' },
  lang:   { label: 'Langues',       icon: '🌍' },
};

const DEFAULT_CV = {
  name: 'Marie Dupont',
  role: 'Développeuse Full-Stack Senior',
  email: 'marie.dupont@email.fr',
  phone: '06 12 34 56 78',
  city: 'Paris, France',
  linkedin: 'linkedin.com/in/mariedupont',
  summary: 'Développeuse passionnée avec 5 ans d\'expérience dans la création d\'applications web modernes. Spécialisée en React, Node.js et architectures cloud.',
  exp: [
    { title: 'Lead Développeuse Frontend', company: 'TechCorp', date: '2022 — Présent', desc: 'Conception d\'une plateforme SaaS pour 50k+ utilisateurs.\nManagement d\'une équipe de 4 développeurs.\nAmélioration des performances de 60% via refactoring TypeScript.' },
    { title: 'Développeuse Full-Stack', company: 'StartupXYZ', date: '2019 — 2022', desc: 'Développement d\'une API REST Node.js avec 10M+ requêtes/jour.\nMigration AWS, réduction des coûts de 35%.' }
  ],
  edu: [
    { title: 'Master Informatique', school: 'EPITA', date: '2017 — 2019', desc: 'Spécialisation Génie Logiciel' }
  ],
  skills: [
    { name: 'React / Next.js', level: 95 }, { name: 'TypeScript', level: 90 },
    { name: 'Node.js', level: 88 }, { name: 'PostgreSQL', level: 80 },
    { name: 'AWS / Cloud', level: 75 }, { name: 'Docker', level: 70 }
  ],
  lang: [
    { name: 'Français', level: 'Natif' },
    { name: 'Anglais', level: 'Courant (C1)' },
    { name: 'Espagnol', level: 'Intermédiaire (B1)' }
  ],
  sectionOrder: ['exp', 'edu', 'skills', 'lang'],
  sectionVisible: { exp: true, edu: true, skills: true, lang: true },
  design: { template: 'moderne', color: '#6366f1', font: 'inter' }
};

// Migrate old flat CV to new format
function migrateCV(raw) {
  if (!raw) return null;
  if (!raw.design) raw.design = { template: raw.template || 'moderne', color: '#6366f1', font: 'inter' };
  if (!raw.sectionOrder) raw.sectionOrder = ['exp', 'edu', 'skills', 'lang'];
  if (!raw.sectionVisible) raw.sectionVisible = { exp: true, edu: true, skills: true, lang: true };
  delete raw.template;
  return raw;
}

let cv = migrateCV(JSON.parse(localStorage.getItem('emploia_cv') || 'null')) || JSON.parse(JSON.stringify(DEFAULT_CV));

// ── UTILITIES ─────────────────────────────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function hex2rgb(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}

function accentStyle(opacity = 1) {
  const c = cv.design.color;
  return opacity < 1 ? `rgba(${hex2rgb(c)},${opacity})` : c;
}

function fontFamily() {
  const f = cv.design.font;
  if (f === 'sora') return "'Sora', sans-serif";
  if (f === 'georgia') return "'Georgia', serif";
  return "'Inter', sans-serif";
}

// ── TABS ──────────────────────────────────────────────────────────
function setTab(btn, tab) {
  document.querySelectorAll('.ed-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.ed-section').forEach(s => s.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  if (tab === 'sections') renderSectionRows();
}

function setMobileMode(mode, e) {
  document.querySelectorAll('.mmt-btn').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  const page = document.getElementById('builderPage');
  page.classList.remove('mobile-edit', 'mobile-preview');
  page.classList.add('mobile-' + mode);
}

// ── LOAD / SAVE ───────────────────────────────────────────────────
function loadFields() {
  document.getElementById('f-name').value = cv.name || '';
  document.getElementById('f-role').value = cv.role || '';
  document.getElementById('f-email').value = cv.email || '';
  document.getElementById('f-phone').value = cv.phone || '';
  document.getElementById('f-city').value = cv.city || '';
  document.getElementById('f-linkedin').value = cv.linkedin || '';
  document.getElementById('f-summary').value = cv.summary || '';
  renderExpList();
  renderEduList();
  renderSkillsList();
  renderLangList();
  syncDesignUI();
}

function updateCV() {
  cv.name = document.getElementById('f-name').value;
  cv.role = document.getElementById('f-role').value;
  cv.email = document.getElementById('f-email').value;
  cv.phone = document.getElementById('f-phone').value;
  cv.city = document.getElementById('f-city').value;
  cv.linkedin = document.getElementById('f-linkedin').value;
  cv.summary = document.getElementById('f-summary').value;
  renderCV();
  saveCV();
}

let saveTimer;
function saveCV() {
  document.getElementById('saveStatus').textContent = 'Saving...';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    localStorage.setItem('emploia_cv', JSON.stringify(cv));
    document.getElementById('saveStatus').textContent = 'Sauvegardé';
    computeATS();
    if (window.empUser) {
      try {
        await fetch('/api/profile', {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: cv.name?.split(' ')[0] || '',
            lastName: cv.name?.split(' ').slice(1).join(' ') || '',
            title: cv.role || '', phone: cv.phone || '',
            location: cv.city || '', linkedin: cv.linkedin || '',
            summary: cv.summary || '',
          }),
        });
      } catch {}
    }
  }, 400);
}

// ── DESIGN ────────────────────────────────────────────────────────
function setTemplate(tpl) {
  cv.design.template = tpl;
  document.querySelectorAll('.tpl-thumb').forEach(t => t.classList.toggle('active', t.dataset.tpl === tpl));
  renderCV();
  saveCV();
}

function setColor(color, el) {
  cv.design.color = color;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('colorCustom').value = color;
  renderCV();
  updateThumbs();
  saveCV();
}

function setFont(font, el) {
  cv.design.font = font;
  document.querySelectorAll('.font-opt').forEach(o => o.classList.remove('active'));
  el.classList.add('active');
  renderCV();
  saveCV();
}

function syncDesignUI() {
  const { template, color, font } = cv.design;
  document.querySelectorAll('.tpl-thumb').forEach(t => t.classList.toggle('active', t.dataset.tpl === template));
  document.getElementById('colorCustom').value = color;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('active', s.dataset.color === color));
  document.querySelectorAll('.font-opt').forEach(o => o.classList.toggle('active', o.dataset.font === font));
  updateThumbs();
}

function updateThumbs() {
  const c = cv.design.color;
  renderThumb('moderne', c);
  renderThumb('classique', c);
  renderThumb('minimal', c);
  renderThumb('creatif', c);
}

function renderThumb(tpl, color) {
  const el = document.getElementById('thumb-' + tpl);
  if (!el) return;
  const w = 120, h = 160;
  if (tpl === 'moderne') {
    el.innerHTML = `<svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <rect width="120" height="160" fill="#fff"/>
      <rect width="120" height="52" fill="${color}"/>
      <rect x="10" y="12" width="60" height="8" rx="2" fill="rgba(255,255,255,.85)"/>
      <rect x="10" y="24" width="40" height="5" rx="2" fill="rgba(255,255,255,.6)"/>
      <rect x="10" y="34" width="80" height="3" rx="1" fill="rgba(255,255,255,.4)"/>
      <rect x="10" y="59" width="34" height="3" rx="1" fill="${color}"/>
      <rect x="10" y="65" width="34" height="2" rx="1" fill="#e5e7eb"/>
      <rect x="10" y="70" width="30" height="2" rx="1" fill="#ddd"/>
      <rect x="10" y="75" width="28" height="2" rx="1" fill="#ddd"/>
      <rect x="10" y="80" width="32" height="2" rx="1" fill="#ddd"/>
      <rect x="50" y="59" width="60" height="3" rx="1" fill="${color}"/>
      <rect x="50" y="65" width="60" height="2" rx="1" fill="#e5e7eb"/>
      <rect x="50" y="70" width="55" height="2" rx="1" fill="#ddd"/>
      <rect x="50" y="75" width="50" height="2" rx="1" fill="#ddd"/>
      <rect x="50" y="84" width="60" height="3" rx="1" fill="${color}"/>
      <rect x="50" y="90" width="55" height="2" rx="1" fill="#ddd"/>
      <rect x="50" y="95" width="48" height="2" rx="1" fill="#ddd"/>
    </svg>`;
  } else if (tpl === 'classique') {
    el.innerHTML = `<svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <rect width="120" height="160" fill="#fff"/>
      <rect x="20" y="12" width="80" height="8" rx="2" fill="#1a1a2e"/>
      <rect x="30" y="24" width="60" height="4" rx="2" fill="#555"/>
      <rect x="10" y="33" width="100" height="2" fill="#1a1a2e"/>
      <rect x="10" y="40" width="40" height="3" rx="1" fill="#1a1a2e"/>
      <rect x="10" y="47" width="100" height="1" fill="#ccc"/>
      <rect x="10" y="52" width="95" height="2" rx="1" fill="#ddd"/>
      <rect x="10" y="57" width="88" height="2" rx="1" fill="#ddd"/>
      <rect x="10" y="67" width="40" height="3" rx="1" fill="#1a1a2e"/>
      <rect x="10" y="74" width="100" height="1" fill="#ccc"/>
      <rect x="10" y="79" width="90" height="2" rx="1" fill="#ddd"/>
      <rect x="10" y="84" width="80" height="2" rx="1" fill="#ddd"/>
      <rect x="10" y="96" width="40" height="3" rx="1" fill="#1a1a2e"/>
      <rect x="10" y="103" width="100" height="1" fill="#ccc"/>
      <rect x="10" y="108" width="44" height="2" rx="1" fill="#ddd"/>
      <rect x="68" y="108" width="44" height="2" rx="1" fill="#ddd"/>
    </svg>`;
  } else if (tpl === 'minimal') {
    el.innerHTML = `<svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <rect width="120" height="160" fill="#fff"/>
      <rect x="10" y="14" width="80" height="10" rx="2" fill="#1a1a2e"/>
      <rect x="10" y="28" width="50" height="5" rx="1" fill="#aaa"/>
      <rect x="10" y="38" width="100" height="1.5" fill="#e5e7eb"/>
      <rect x="10" y="45" width="20" height="3" rx="1" fill="${color}"/>
      <rect x="10" y="53" width="95" height="2" rx="1" fill="#ddd"/>
      <rect x="10" y="58" width="88" height="2" rx="1" fill="#ddd"/>
      <rect x="10" y="67" width="20" height="3" rx="1" fill="${color}"/>
      <rect x="10" y="75" width="90" height="2" rx="1" fill="#ddd"/>
      <rect x="10" y="80" width="80" height="2" rx="1" fill="#ddd"/>
      <rect x="10" y="90" width="20" height="3" rx="1" fill="${color}"/>
      <rect x="10" y="98" width="85" height="2" rx="1" fill="#ddd"/>
      <rect x="10" y="103" width="70" height="2" rx="1" fill="#ddd"/>
    </svg>`;
  } else if (tpl === 'creatif') {
    el.innerHTML = `<svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <rect width="120" height="160" fill="#fff"/>
      <rect width="40" height="160" fill="${color}"/>
      <rect x="5" y="20" width="28" height="6" rx="1.5" fill="rgba(255,255,255,.9)"/>
      <rect x="5" y="30" width="22" height="3" rx="1" fill="rgba(255,255,255,.6)"/>
      <rect x="5" y="44" width="28" height="2" rx="1" fill="rgba(255,255,255,.4)"/>
      <rect x="5" y="49" width="24" height="2" rx="1" fill="rgba(255,255,255,.4)"/>
      <rect x="5" y="62" width="20" height="2" rx="1" fill="rgba(255,255,255,.35)"/>
      <rect x="5" y="67" width="28" height="2" rx="1" fill="rgba(255,255,255,.35)"/>
      <rect x="5" y="72" width="22" height="2" rx="1" fill="rgba(255,255,255,.35)"/>
      <rect x="48" y="14" width="65" height="4" rx="1" fill="${color}"/>
      <rect x="48" y="21" width="65" height="1.5" fill="#e5e7eb"/>
      <rect x="48" y="26" width="60" height="2" rx="1" fill="#ddd"/>
      <rect x="48" y="31" width="55" height="2" rx="1" fill="#ddd"/>
      <rect x="48" y="40" width="65" height="4" rx="1" fill="${color}"/>
      <rect x="48" y="47" width="65" height="1.5" fill="#e5e7eb"/>
      <rect x="48" y="52" width="58" height="2" rx="1" fill="#ddd"/>
      <rect x="48" y="57" width="50" height="2" rx="1" fill="#ddd"/>
      <rect x="48" y="65" width="65" height="4" rx="1" fill="${color}"/>
      <rect x="48" y="72" width="60" height="2" rx="1" fill="#ddd"/>
    </svg>`;
  }
}

// ── SECTIONS DRAG & DROP ──────────────────────────────────────────
let dragSrc = null;

function renderSectionRows() {
  const container = document.getElementById('sectionRows');
  container.innerHTML = cv.sectionOrder.map(id => {
    const meta = SECTION_META[id];
    const visible = cv.sectionVisible[id] !== false;
    return `<div class="section-row" draggable="true" data-id="${id}"
        data-on-dragstart="onDragStart_event_this_getAttr_9109" data-arg-8357-0="${esc(id)}"
        data-on-dragover="onDragOver_event_c213"
        data-on-dragleave="onDragLeave_event_d722"
        data-on-drop="onDrop_event_this_getAttribute_6423" data-arg-4477-0="${esc(id)}"
        data-on-dragend="onDragEnd_event_205a">
      <span class="drag-handle">⠿</span>
      <span class="section-row-icon">${meta.icon}</span>
      <span class="section-row-label">${meta.label}</span>
      <button class="visibility-toggle ${visible ? '' : 'hidden'}"
        data-on-click="toggleVisible_this_getAttribut_d8fd" data-arg-e2d8-0="${esc(id)}"
        title="${visible ? 'Masquer' : 'Afficher'}">
        ${visible ? '👁' : '🙈'}
      </button>
    </div>`;
  }).join('');
}

function onDragStart(e, id) {
  dragSrc = id;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.target.classList.add('dragging'), 0);
}

function onDragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.section-row').forEach(r => r.classList.remove('drag-over'));
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function onDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function onDrop(e, targetId) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!dragSrc || dragSrc === targetId) return;
  const arr = cv.sectionOrder;
  const fromIdx = arr.indexOf(dragSrc);
  const toIdx = arr.indexOf(targetId);
  arr.splice(fromIdx, 1);
  arr.splice(toIdx, 0, dragSrc);
  dragSrc = null;
  renderSectionRows();
  renderCV();
  saveCV();
}

function toggleVisible(id, btn) {
  cv.sectionVisible[id] = !cv.sectionVisible[id];
  const vis = cv.sectionVisible[id];
  btn.textContent = vis ? '👁' : '🙈';
  btn.classList.toggle('hidden', !vis);
  btn.title = vis ? 'Masquer' : 'Afficher';
  renderCV();
  saveCV();
}

// ── RENDER CV ─────────────────────────────────────────────────────
function renderCV() {
  const paper = document.getElementById('cvPaper');
  const tpl = cv.design.template;
  if (tpl === 'classique') paper.innerHTML = renderClassique();
  else if (tpl === 'minimal') paper.innerHTML = renderMinimal();
  else if (tpl === 'creatif') paper.innerHTML = renderCreatif();
  else paper.innerHTML = renderModerne();
}

function visibleSections() {
  return cv.sectionOrder.filter(id => cv.sectionVisible[id] !== false);
}

// ── TEMPLATE: MODERNE (2-col header + body) ───────────────────────
function renderModerne() {
  const c = cv.design.color, ff = fontFamily();
  const sections = visibleSections();

  const leftSections = sections.filter(id => ['skills', 'lang'].includes(id));
  const rightSections = sections.filter(id => ['exp', 'edu'].includes(id));

  const renderLeft = (id) => {
    if (id === 'skills' && cv.skills?.length) {
      return `<div class="cv-section">
        <div class="cv-h2 cv-h2-line" style="color:${c};border-color:${accentStyle(.2)}">Compétences</div>
        ${cv.skills.map(s => `
          <div class="cv-skill-row">
            <span style="font-weight:600">${esc(s.name)}</span>
            <div class="cv-skill-bar"><div class="cv-skill-fill" style="width:${s.level}%;background:${c}"></div></div>
          </div>`).join('')}
      </div>`;
    }
    if (id === 'lang' && cv.lang?.length) {
      return `<div class="cv-section">
        <div class="cv-h2 cv-h2-line" style="color:${c};border-color:${accentStyle(.2)}">Langues</div>
        ${cv.lang.map(l => `
          <div class="cv-lang-row"><span style="font-weight:600">${esc(l.name)}</span><span style="color:#888">${esc(l.level)}</span></div>`).join('')}
      </div>`;
    }
    return '';
  };

  const renderRight = (id) => {
    if (id === 'exp' && cv.exp?.length) {
      return `<div class="cv-section">
        <div class="cv-h2 cv-h2-line" style="color:${c};border-color:${accentStyle(.2)}">Expérience</div>
        ${cv.exp.map(e => `
          <div class="cv-exp-item">
            <div class="cv-exp-head">
              <div><div class="cv-exp-title">${esc(e.title)}</div>
              <div class="cv-exp-co" style="color:${c}">${esc(e.company)}</div></div>
              <div class="cv-exp-date">${esc(e.date)}</div>
            </div>
            <div class="cv-exp-desc">${esc(e.desc)}</div>
          </div>`).join('')}
      </div>`;
    }
    if (id === 'edu' && cv.edu?.length) {
      return `<div class="cv-section">
        <div class="cv-h2 cv-h2-line" style="color:${c};border-color:${accentStyle(.2)}">Formation</div>
        ${cv.edu.map(e => `
          <div class="cv-exp-item">
            <div class="cv-exp-head">
              <div><div class="cv-exp-title">${esc(e.title)}</div>
              <div class="cv-exp-co" style="color:${c}">${esc(e.school)}</div></div>
              <div class="cv-exp-date">${esc(e.date)}</div>
            </div>
            ${e.desc ? `<div class="cv-exp-desc">${esc(e.desc)}</div>` : ''}
          </div>`).join('')}
      </div>`;
    }
    return '';
  };

  return `<div style="font-family:${ff}">
    <div class="cv-moderne-header" style="background:${c}">
      <h1 style="color:#fff">${esc(cv.name)}</h1>
      <div class="cv-role" style="color:rgba(255,255,255,.88)">${esc(cv.role)}</div>
      <div class="cv-contact" style="color:rgba(255,255,255,.8)">
        ${cv.email ? `<span>✉ ${esc(cv.email)}</span>` : ''}
        ${cv.phone ? `<span>📱 ${esc(cv.phone)}</span>` : ''}
        ${cv.city ? `<span>📍 ${esc(cv.city)}</span>` : ''}
        ${cv.linkedin ? `<span>💼 ${esc(cv.linkedin)}</span>` : ''}
      </div>
    </div>
    <div class="cv-moderne-body">
      <div class="cv-moderne-sidebar">
        ${cv.summary ? `<div class="cv-section"><div class="cv-h2 cv-h2-line" style="color:${c};border-color:${accentStyle(.2)}">À propos</div><p class="cv-summary">${esc(cv.summary)}</p></div>` : ''}
        ${leftSections.map(renderLeft).join('')}
      </div>
      <div class="cv-moderne-main">
        ${rightSections.map(renderRight).join('')}
      </div>
    </div>
  </div>`;
}

// ── TEMPLATE: CLASSIQUE ───────────────────────────────────────────
function renderClassique() {
  const c = cv.design.color, ff = "'Georgia', serif";
  const sections = visibleSections();

  const renderSection = (id) => {
    if (id === 'exp' && cv.exp?.length) {
      return `<div style="margin-bottom:20px">
        <div class="cv-h2 cv-h2-line" style="color:#1a1a2e;border-color:#1a1a2e;font-family:Georgia,serif">Expérience professionnelle</div>
        ${cv.exp.map(e => `
          <div class="cv-exp-item">
            <div class="cv-exp-head">
              <div class="cv-exp-title">${esc(e.title)} — <span style="color:${c}">${esc(e.company)}</span></div>
              <div class="cv-exp-date">${esc(e.date)}</div>
            </div>
            <div class="cv-exp-desc">${esc(e.desc)}</div>
          </div>`).join('')}
      </div>`;
    }
    if (id === 'edu' && cv.edu?.length) {
      return `<div style="margin-bottom:20px">
        <div class="cv-h2 cv-h2-line" style="color:#1a1a2e;border-color:#1a1a2e;font-family:Georgia,serif">Formation</div>
        ${cv.edu.map(e => `
          <div class="cv-exp-item">
            <div class="cv-exp-head">
              <div class="cv-exp-title">${esc(e.title)} — ${esc(e.school)}</div>
              <div class="cv-exp-date">${esc(e.date)}</div>
            </div>
            ${e.desc ? `<div class="cv-exp-desc">${esc(e.desc)}</div>` : ''}
          </div>`).join('')}
      </div>`;
    }
    return '';
  };

  const mainSections = sections.filter(id => ['exp','edu'].includes(id));
  const showSkills = sections.includes('skills') && cv.skills?.length;
  const showLang = sections.includes('lang') && cv.lang?.length;

  return `<div class="cv-classique" style="font-family:${ff}">
    <div class="cv-classique-head">
      <h1>${esc(cv.name)}</h1>
      <div class="cv-role">${esc(cv.role)}</div>
      <div class="cv-contact">
        ${cv.email ? `<span>${esc(cv.email)}</span>` : ''}
        ${cv.phone ? `<span>${esc(cv.phone)}</span>` : ''}
        ${cv.city ? `<span>${esc(cv.city)}</span>` : ''}
        ${cv.linkedin ? `<span>${esc(cv.linkedin)}</span>` : ''}
      </div>
    </div>
    ${cv.summary ? `<div style="margin-bottom:20px"><div class="cv-h2 cv-h2-line" style="color:#1a1a2e;border-color:#1a1a2e;font-family:Georgia,serif">Profil</div><p style="font-size:11.5px;line-height:1.7;color:#333">${esc(cv.summary)}</p></div>` : ''}
    ${mainSections.map(renderSection).join('')}
    ${showSkills || showLang ? `<div class="cv-classique-divider">
      ${showSkills ? `<div><div class="cv-h2 cv-h2-line" style="color:#1a1a2e;border-color:#1a1a2e;font-family:Georgia,serif">Compétences</div>
        ${cv.skills.map(s=>`<div style="font-size:11.5px;margin-bottom:4px">• ${esc(s.name)}</div>`).join('')}</div>` : ''}
      ${showLang ? `<div><div class="cv-h2 cv-h2-line" style="color:#1a1a2e;border-color:#1a1a2e;font-family:Georgia,serif">Langues</div>
        ${cv.lang.map(l=>`<div style="font-size:11.5px;margin-bottom:4px">• ${esc(l.name)} — <em>${esc(l.level)}</em></div>`).join('')}</div>` : ''}
    </div>` : ''}
  </div>`;
}

// ── TEMPLATE: MINIMALISTE ─────────────────────────────────────────
function renderMinimal() {
  const c = cv.design.color, ff = fontFamily();
  const sections = visibleSections();

  const renderSection = (id) => {
    if (id === 'exp' && cv.exp?.length) {
      return `<div style="margin-bottom:26px">
        <div class="cv-h2" style="color:${c};letter-spacing:2px;font-size:10px">EXPÉRIENCE</div>
        <div class="cv-minimal-hr"></div>
        ${cv.exp.map(e => `
          <div style="margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:1px">
              <span style="font-size:13px;font-weight:600">${esc(e.title)}</span>
              <span style="font-size:10px;color:#888">${esc(e.date)}</span>
            </div>
            <div style="font-size:11px;color:${c};margin-bottom:5px">${esc(e.company)}</div>
            <div style="font-size:10.5px;color:#555;line-height:1.65;white-space:pre-line">${esc(e.desc)}</div>
          </div>`).join('')}
      </div>`;
    }
    if (id === 'edu' && cv.edu?.length) {
      return `<div style="margin-bottom:26px">
        <div class="cv-h2" style="color:${c};letter-spacing:2px;font-size:10px">FORMATION</div>
        <div class="cv-minimal-hr"></div>
        ${cv.edu.map(e => `
          <div style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <span style="font-size:12px;font-weight:600">${esc(e.title)} · ${esc(e.school)}</span>
              <span style="font-size:10px;color:#888">${esc(e.date)}</span>
            </div>
            ${e.desc ? `<div style="font-size:10.5px;color:#888;margin-top:2px">${esc(e.desc)}</div>` : ''}
          </div>`).join('')}
      </div>`;
    }
    if (id === 'skills' && cv.skills?.length) {
      return `<div style="margin-bottom:26px">
        <div class="cv-h2" style="color:${c};letter-spacing:2px;font-size:10px">COMPÉTENCES</div>
        <div class="cv-minimal-hr"></div>
        <div style="font-size:11.5px;line-height:2;color:#444">${cv.skills.map(s=>esc(s.name)).join(' · ')}</div>
      </div>`;
    }
    if (id === 'lang' && cv.lang?.length) {
      return `<div style="margin-bottom:26px">
        <div class="cv-h2" style="color:${c};letter-spacing:2px;font-size:10px">LANGUES</div>
        <div class="cv-minimal-hr"></div>
        ${cv.lang.map(l=>`<div style="font-size:11.5px;line-height:1.8;color:#444">${esc(l.name)} <span style="color:#aaa">— ${esc(l.level)}</span></div>`).join('')}
      </div>`;
    }
    return '';
  };

  return `<div class="cv-minimal" style="font-family:${ff}">
    <div class="cv-minimal-head">
      <h1>${esc(cv.name)}</h1>
      <div class="cv-role">${esc(cv.role)}</div>
      <div class="cv-contact">
        ${cv.email ? `<span>${esc(cv.email)}</span>` : ''}
        ${cv.phone ? `<span>${esc(cv.phone)}</span>` : ''}
        ${cv.city ? `<span>${esc(cv.city)}</span>` : ''}
        ${cv.linkedin ? `<span>${esc(cv.linkedin)}</span>` : ''}
      </div>
    </div>
    ${cv.summary ? `<div style="margin-bottom:26px"><p style="font-size:12px;line-height:1.75;color:#444">${esc(cv.summary)}</p></div>` : ''}
    ${sections.map(renderSection).join('')}
  </div>`;
}

// ── TEMPLATE: CRÉATIF (sidebar colorée) ──────────────────────────
function renderCreatif() {
  const c = cv.design.color, ff = fontFamily();
  const sections = visibleSections();
  const leftIds = sections.filter(id => ['skills','lang'].includes(id));
  const rightIds = sections.filter(id => ['exp','edu'].includes(id));

  const renderLeft = (id) => {
    if (id === 'skills' && cv.skills?.length) {
      return `<div style="margin-bottom:18px">
        <div class="cv-h2 cv-h2-sidebar" style="color:rgba(255,255,255,.65);border-color:rgba(255,255,255,.2);font-size:10px;letter-spacing:1.2px">COMPÉTENCES</div>
        ${cv.skills.map(s => `
          <div style="margin-bottom:6px">
            <div style="font-size:10px;color:rgba(255,255,255,.9);margin-bottom:3px;font-weight:600">${esc(s.name)}</div>
            <div style="height:3px;background:rgba(255,255,255,.2);border-radius:2px">
              <div style="height:3px;width:${s.level}%;background:rgba(255,255,255,.7);border-radius:2px"></div>
            </div>
          </div>`).join('')}
      </div>`;
    }
    if (id === 'lang' && cv.lang?.length) {
      return `<div style="margin-bottom:18px">
        <div class="cv-h2 cv-h2-sidebar" style="color:rgba(255,255,255,.65);border-color:rgba(255,255,255,.2);font-size:10px;letter-spacing:1.2px">LANGUES</div>
        ${cv.lang.map(l => `
          <div style="font-size:10px;color:rgba(255,255,255,.85);margin-bottom:5px">
            <span style="font-weight:600">${esc(l.name)}</span><br/>
            <span style="opacity:.7">${esc(l.level)}</span>
          </div>`).join('')}
      </div>`;
    }
    return '';
  };

  const renderRight = (id) => {
    if (id === 'exp' && cv.exp?.length) {
      return `<div style="margin-bottom:18px">
        <div class="cv-h2 cv-h2-line" style="color:${c};border-color:${accentStyle(.2)}">Expérience</div>
        <div style="height:2px;background:${accentStyle(.15)};margin-bottom:10px;border-radius:1px"></div>
        ${cv.exp.map(e => `
          <div class="cv-exp-item">
            <div class="cv-exp-head">
              <div><div class="cv-exp-title">${esc(e.title)}</div>
              <div style="font-size:11px;color:${c};font-weight:600">${esc(e.company)}</div></div>
              <div class="cv-exp-date">${esc(e.date)}</div>
            </div>
            <div class="cv-exp-desc">${esc(e.desc)}</div>
          </div>`).join('')}
      </div>`;
    }
    if (id === 'edu' && cv.edu?.length) {
      return `<div style="margin-bottom:18px">
        <div class="cv-h2" style="color:${c}">Formation</div>
        <div style="height:2px;background:${accentStyle(.15)};margin-bottom:10px;border-radius:1px"></div>
        ${cv.edu.map(e => `
          <div class="cv-exp-item">
            <div class="cv-exp-head">
              <div><div class="cv-exp-title">${esc(e.title)}</div>
              <div style="font-size:11px;color:${c};font-weight:600">${esc(e.school)}</div></div>
              <div class="cv-exp-date">${esc(e.date)}</div>
            </div>
            ${e.desc ? `<div class="cv-exp-desc">${esc(e.desc)}</div>` : ''}
          </div>`).join('')}
      </div>`;
    }
    return '';
  };

  return `<div class="cv-creatif" style="font-family:${ff}">
    <div class="cv-creatif-sidebar" style="background:${c}">
      <h1>${esc(cv.name)}</h1>
      <div class="cv-role">${esc(cv.role)}</div>
      ${cv.summary ? `<div style="margin-bottom:20px"><div class="cv-h2 cv-h2-sidebar" style="color:rgba(255,255,255,.65);border-color:rgba(255,255,255,.2);font-size:10px;letter-spacing:1.2px">PROFIL</div><p style="font-size:10px;color:rgba(255,255,255,.85);line-height:1.65">${esc(cv.summary)}</p></div>` : ''}
      <div style="margin-bottom:18px">
        <div class="cv-h2 cv-h2-sidebar" style="color:rgba(255,255,255,.65);border-color:rgba(255,255,255,.2);font-size:10px;letter-spacing:1.2px">CONTACT</div>
        <div class="cv-contact" style="color:rgba(255,255,255,.85);font-size:10px;line-height:1.9">
          ${cv.email ? `<div>${esc(cv.email)}</div>` : ''}
          ${cv.phone ? `<div>${esc(cv.phone)}</div>` : ''}
          ${cv.city ? `<div>${esc(cv.city)}</div>` : ''}
          ${cv.linkedin ? `<div>${esc(cv.linkedin)}</div>` : ''}
        </div>
      </div>
      ${leftIds.map(renderLeft).join('')}
    </div>
    <div class="cv-creatif-main">
      ${rightIds.map(renderRight).join('')}
    </div>
  </div>`;
}

// ── REPEATER LISTS ────────────────────────────────────────────────
function renderExpList() {
  document.getElementById('expList').innerHTML = (cv.exp || []).map((e, i) => `
    <div class="rep-item">
      <button class="rep-del" data-on-click="delItem_exp_JSON_parse_this_ge_5caa" data-arg-1ca9-0="${esc(JSON.stringify(i))}">🗑</button>
      <div class="field-row">
        <div class="field"><label>Poste</label><input value="${esc(e.title)}" data-on-input="cv_exp_JSON_parse_this_getAttr_d8a7" data-arg-e677-0="${esc(JSON.stringify(i))}"/></div>
        <div class="field"><label>Entreprise</label><input value="${esc(e.company)}" data-on-input="cv_exp_JSON_parse_this_getAttr_e2bb" data-arg-63d8-0="${esc(JSON.stringify(i))}"/></div>
      </div>
      <div class="field"><label>Période</label><input value="${esc(e.date)}" placeholder="2022 — Présent" data-on-input="cv_exp_JSON_parse_this_getAttr_f8ee" data-arg-aad3-0="${esc(JSON.stringify(i))}"/></div>
      <div class="field"><label>Description</label><textarea data-on-input="cv_exp_JSON_parse_this_getAttr_21ab" data-arg-d4a6-0="${esc(JSON.stringify(i))}" rows="4">${esc(e.desc)}</textarea></div>
    </div>`).join('');
}

function renderEduList() {
  document.getElementById('eduList').innerHTML = (cv.edu || []).map((e, i) => `
    <div class="rep-item">
      <button class="rep-del" data-on-click="delItem_edu_JSON_parse_this_ge_3a76" data-arg-90fa-0="${esc(JSON.stringify(i))}">🗑</button>
      <div class="field"><label>Diplôme</label><input value="${esc(e.title)}" data-on-input="cv_edu_JSON_parse_this_getAttr_83e1" data-arg-c041-0="${esc(JSON.stringify(i))}"/></div>
      <div class="field-row">
        <div class="field"><label>Établissement</label><input value="${esc(e.school)}" data-on-input="cv_edu_JSON_parse_this_getAttr_0d81" data-arg-e346-0="${esc(JSON.stringify(i))}"/></div>
        <div class="field"><label>Période</label><input value="${esc(e.date)}" data-on-input="cv_edu_JSON_parse_this_getAttr_845e" data-arg-504b-0="${esc(JSON.stringify(i))}"/></div>
      </div>
      <div class="field"><label>Détails</label><textarea data-on-input="cv_edu_JSON_parse_this_getAttr_6500" data-arg-ec26-0="${esc(JSON.stringify(i))}" rows="2">${esc(e.desc||'')}</textarea></div>
    </div>`).join('');
}

function renderSkillsList() {
  document.getElementById('skillsList').innerHTML = (cv.skills || []).map((s, i) => `
    <div class="rep-item" style="padding:11px">
      <button class="rep-del" data-on-click="delItem_skills_JSON_parse_this_b2c0" data-arg-66a1-0="${esc(JSON.stringify(i))}">🗑</button>
      <div class="field-row" style="margin:0">
        <div class="field" style="margin:0"><label>Nom</label><input value="${esc(s.name)}" data-on-input="cv_skills_JSON_parse_this_getA_f899" data-arg-0570-0="${esc(JSON.stringify(i))}"/></div>
        <div class="field" style="margin:0">
          <label>Niveau (${s.level}%)</label>
          <input type="range" min="0" max="100" value="${s.level}"
            data-on-input="cv_skills_JSON_parse_this_getA_8383" data-arg-91b7-0="${esc(JSON.stringify(i))}"/>
        </div>
      </div>
    </div>`).join('');
}

function renderLangList() {
  document.getElementById('langList').innerHTML = (cv.lang || []).map((l, i) => `
    <div class="rep-item" style="padding:11px">
      <button class="rep-del" data-on-click="delItem_lang_JSON_parse_this_g_8084" data-arg-b146-0="${esc(JSON.stringify(i))}">🗑</button>
      <div class="field-row" style="margin:0">
        <div class="field" style="margin:0"><label>Langue</label><input value="${esc(l.name)}" data-on-input="cv_lang_JSON_parse_this_getAtt_4ecf" data-arg-96ca-0="${esc(JSON.stringify(i))}"/></div>
        <div class="field" style="margin:0"><label>Niveau</label><input value="${esc(l.level)}" placeholder="Courant (C1)" data-on-input="cv_lang_JSON_parse_this_getAtt_2fb8" data-arg-5b10-0="${esc(JSON.stringify(i))}"/></div>
      </div>
    </div>`).join('');
}

function addItem(type) {
  const defaults = {
    exp: { title:'', company:'', date:'', desc:'' },
    edu: { title:'', school:'', date:'', desc:'' },
    skills: { name:'Nouvelle compétence', level:70 },
    lang: { name:'', level:'' }
  };
  cv[type] = cv[type] || [];
  cv[type].push({ ...defaults[type] });
  if (type === 'exp') renderExpList();
  else if (type === 'edu') renderEduList();
  else if (type === 'skills') renderSkillsList();
  else if (type === 'lang') renderLangList();
  renderCV(); saveCV();
}

function delItem(type, i) {
  cv[type].splice(i, 1);
  if (type === 'exp') renderExpList();
  else if (type === 'edu') renderEduList();
  else if (type === 'skills') renderSkillsList();
  else if (type === 'lang') renderLangList();
  renderCV(); saveCV();
}

// ── ATS SCORE ─────────────────────────────────────────────────────
function computeATS() {
  let score = 30;
  if (cv.name?.length > 3) score += 5;
  if (cv.role?.length > 3) score += 5;
  if (cv.email) score += 5;
  if (cv.phone) score += 4;
  if (cv.city) score += 3;
  if (cv.summary?.length > 80) score += 8;
  if ((cv.exp?.length || 0) >= 1) score += 8;
  if ((cv.exp?.length || 0) >= 2) score += 5;
  if ((cv.skills?.length || 0) >= 5) score += 8;
  if ((cv.skills?.length || 0) >= 8) score += 4;
  if ((cv.edu?.length || 0) >= 1) score += 6;
  if ((cv.lang?.length || 0) >= 2) score += 4;
  if ((cv.exp?.[0]?.desc || '').length > 80) score += 5;
  score = Math.min(score, 100);

  document.getElementById('atsScore').textContent = score + '%';
  let color = 'var(--rnb)', hint = 'À enrichir';
  if (score >= 85) { hint = 'Excellent ! 🚀'; color = 'var(--gnb)'; }
  else if (score >= 70) { hint = 'Très bon 👍'; color = 'var(--gnb)'; }
  else if (score >= 50) { hint = 'À compléter'; color = 'var(--ylb)'; }
  else { hint = 'À enrichir'; }
  document.getElementById('atsHint').textContent = hint;
  document.getElementById('atsCircle').style.background =
    `conic-gradient(${color} ${score * 3.6}deg, var(--s4) 0)`;
}

function aiSuggest(type) {
  empToast('💡 Optimisation IA à venir dans la prochaine mise à jour !', 'info');
}

async function exportCV() {
  const el = document.getElementById('cvPaper');
  if (!el) return;
  const btn = document.querySelector('[onclick="exportCV()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Génération…'; }
  empToast('📄 Génération du PDF en cours…', 'info');
  try {
    if (!window.html2pdf) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    const name = (cv.name || 'CV').replace(/\s+/g, '-');
    await html2pdf().set({
      margin: 0,
      filename: `CV-${name}-Emploia.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save();
    empToast('CV téléchargé en PDF !', 'success');
  } catch (err) {
    empToast('Erreur PDF — essayez l\'impression (Ctrl+P)', 'error');
    window.print();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⬇ Télécharger PDF'; }
  }
}

// ── PROFILE SYNC ──────────────────────────────────────────────────
async function loadFromProfile(user) {
  const isDefault = cv.name === 'Marie Dupont';
  if (!isDefault) return;
  try {
    const res = await fetch('/api/profile', { credentials: 'include' });
    if (!res.ok) return;
    const p = await res.json();
    const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || user.name || '';
    if (name) cv.name = name;
    if (p.title) cv.role = p.title;
    if (p.phone) cv.phone = p.phone;
    if (p.location) cv.city = p.location;
    if (p.linkedin) cv.linkedin = p.linkedin;
    if (p.summary) cv.summary = p.summary;
    if (p.skills?.length) cv.skills = p.skills.map(s => typeof s === 'string' ? { name: s, level: 80 } : s);
    if (p.experience?.length) cv.exp = p.experience;
    if (p.education?.length) cv.edu = p.education;
    loadFields();
    renderCV();
  } catch {}
}

// ── CV VERSIONS ───────────────────────────────────────────────────
async function loadVersions() {
  if (!window.empUser) {
    document.getElementById('versionsLoginBanner').style.display = 'block';
    document.getElementById('btnSaveVersion').style.display = 'none';
    return;
  }
  document.getElementById('versionsLoginBanner').style.display = 'none';
  document.getElementById('btnSaveVersion').style.display = 'block';
  try {
    const res = await fetch('/api/cv-versions', { credentials: 'include' });
    if (!res.ok) return;
    const { versions, maxVersions, plan } = await res.json();
    const note = document.getElementById('versionsPlanNote');
    note.style.display = 'block';
    note.textContent = `${versions.length} / ${maxVersions} versions${plan === 'free' ? ' (gratuit)' : ' (Pro)'}`;
    renderVersionsList(versions);
  } catch {}
}

function renderVersionsList(versions) {
  const list = document.getElementById('versionsList');
  const empty = document.getElementById('versionsEmpty');
  if (!versions.length) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  list.innerHTML = versions.map(v => `
    <div style="background:var(--s2);border:1px solid var(--brd);border-radius:10px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(v.name || 'Sans titre')}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">${new Date(v.updatedAt || v.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button data-on-click="loadVersion_this_getAttribute_4823" data-arg-db24-0="${esc(v.id)}" style="padding:5px 10px;border-radius:7px;font-size:11px;font-weight:700;color:var(--inb);background:var(--ind2);border:none;cursor:pointer">Charger</button>
        <button data-on-click="deleteVersion_this_getAttribut_b682" data-arg-b341-0="${esc(v.id)}" style="padding:5px 8px;border-radius:7px;font-size:11px;color:var(--t3);background:transparent;border:1px solid var(--brd);cursor:pointer">✕</button>
      </div>
    </div>`).join('');
}

async function saveVersion() {
  if (!window.empUser) { empShowAuth('login'); return; }
  const name = prompt('Nom de cette version :', `${cv.name || 'CV'} — ${new Date().toLocaleDateString('fr-FR')}`);
  if (!name) return;
  try {
    const res = await fetch('/api/cv-versions', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.slice(0, 100), content: JSON.stringify(cv) }),
    });
    if (res.status === 402) { empToast('Limite de versions atteinte. Passez Pro pour plus de versions.', 'error'); return; }
    if (!res.ok) { empToast('Erreur lors de la sauvegarde', 'error'); return; }
    empToast('Version sauvegardée ✓', 'success');
    loadVersions();
  } catch { empToast('Erreur réseau', 'error'); }
}

async function loadVersion(id) {
  if (!confirm('Charger cette version ? Le CV actuel sera remplacé.')) return;
  try {
    const res = await fetch('/api/cv-versions', { credentials: 'include' });
    if (!res.ok) return;
    const { versions } = await res.json();
    const v = versions.find(x => x.id === id);
    if (!v?.content) return;
    const loaded = JSON.parse(v.content);
    Object.assign(cv, loaded);
    localStorage.setItem('emploia_cv', JSON.stringify(cv));
    loadFields(); renderCV(); computeATS();
    empToast('Version chargée ✓', 'success');
  } catch { empToast('Erreur lors du chargement', 'error'); }
}

async function deleteVersion(id) {
  if (!confirm('Supprimer cette version ?')) return;
  try {
    const res = await fetch(`/api/cv-versions?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) { empToast('Version supprimée', 'success'); loadVersions(); }
  } catch { empToast('Erreur réseau', 'error'); }
}

// ── INIT ──────────────────────────────────────────────────────────
loadFields();
renderCV();
computeATS();
updateThumbs();

window.addEventListener('empUserLoaded', e => {
  if (e.detail) { loadFromProfile(e.detail); loadVersions(); }
});
window.addEventListener('empAuthChange', e => {
  if (e.detail?.user) { loadFromProfile(e.detail.user); loadVersions(); }
});
if (window.empUser) { loadFromProfile(window.empUser); loadVersions(); }

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["addItem_edu_c152"] = function (event) {
  addItem('edu')
};
EMP_H["addItem_exp_68bf"] = function (event) {
  addItem('exp')
};
EMP_H["addItem_lang_66d2"] = function (event) {
  addItem('lang')
};
EMP_H["addItem_skills_2b72"] = function (event) {
  addItem('skills')
};
EMP_H["aiSuggest_exp_059d"] = function (event) {
  aiSuggest('exp')
};
EMP_H["aiSuggest_skills_14ff"] = function (event) {
  aiSuggest('skills')
};
EMP_H["aiSuggest_title_6b37"] = function (event) {
  aiSuggest('title')
};
EMP_H["cv_edu_JSON_parse_this_getAttr_0d81"] = function (event) {
  cv.edu[JSON.parse(this.getAttribute("data-arg-e346-0"))].school=this.value;renderCV();saveCV()
};
EMP_H["cv_edu_JSON_parse_this_getAttr_6500"] = function (event) {
  cv.edu[JSON.parse(this.getAttribute("data-arg-ec26-0"))].desc=this.value;renderCV();saveCV()
};
EMP_H["cv_edu_JSON_parse_this_getAttr_83e1"] = function (event) {
  cv.edu[JSON.parse(this.getAttribute("data-arg-c041-0"))].title=this.value;renderCV();saveCV()
};
EMP_H["cv_edu_JSON_parse_this_getAttr_845e"] = function (event) {
  cv.edu[JSON.parse(this.getAttribute("data-arg-504b-0"))].date=this.value;renderCV();saveCV()
};
EMP_H["cv_exp_JSON_parse_this_getAttr_21ab"] = function (event) {
  cv.exp[JSON.parse(this.getAttribute("data-arg-d4a6-0"))].desc=this.value;renderCV();saveCV()
};
EMP_H["cv_exp_JSON_parse_this_getAttr_d8a7"] = function (event) {
  cv.exp[JSON.parse(this.getAttribute("data-arg-e677-0"))].title=this.value;renderCV();saveCV()
};
EMP_H["cv_exp_JSON_parse_this_getAttr_e2bb"] = function (event) {
  cv.exp[JSON.parse(this.getAttribute("data-arg-63d8-0"))].company=this.value;renderCV();saveCV()
};
EMP_H["cv_exp_JSON_parse_this_getAttr_f8ee"] = function (event) {
  cv.exp[JSON.parse(this.getAttribute("data-arg-aad3-0"))].date=this.value;renderCV();saveCV()
};
EMP_H["cv_lang_JSON_parse_this_getAtt_2fb8"] = function (event) {
  cv.lang[JSON.parse(this.getAttribute("data-arg-5b10-0"))].level=this.value;renderCV();saveCV()
};
EMP_H["cv_lang_JSON_parse_this_getAtt_4ecf"] = function (event) {
  cv.lang[JSON.parse(this.getAttribute("data-arg-96ca-0"))].name=this.value;renderCV();saveCV()
};
EMP_H["cv_skills_JSON_parse_this_getA_8383"] = function (event) {
  cv.skills[JSON.parse(this.getAttribute("data-arg-91b7-0"))].level=+this.value;this.previousElementSibling.textContent='Niveau ('+this.value+'%)';renderCV();saveCV()
};
EMP_H["cv_skills_JSON_parse_this_getA_f899"] = function (event) {
  cv.skills[JSON.parse(this.getAttribute("data-arg-0570-0"))].name=this.value;renderCV();saveCV()
};
EMP_H["delItem_edu_JSON_parse_this_ge_3a76"] = function (event) {
  delItem('edu',JSON.parse(this.getAttribute("data-arg-90fa-0")))
};
EMP_H["delItem_exp_JSON_parse_this_ge_5caa"] = function (event) {
  delItem('exp',JSON.parse(this.getAttribute("data-arg-1ca9-0")))
};
EMP_H["delItem_lang_JSON_parse_this_g_8084"] = function (event) {
  delItem('lang',JSON.parse(this.getAttribute("data-arg-b146-0")))
};
EMP_H["delItem_skills_JSON_parse_this_b2c0"] = function (event) {
  delItem('skills',JSON.parse(this.getAttribute("data-arg-66a1-0")))
};
EMP_H["deleteVersion_this_getAttribut_b682"] = function (event) {
  deleteVersion(this.getAttribute("data-arg-b341-0"))
};
EMP_H["exportCV"] = function (event) {
  exportCV()
};
EMP_H["loadVersion_this_getAttribute_4823"] = function (event) {
  loadVersion(this.getAttribute("data-arg-db24-0"))
};
EMP_H["onDragEnd_event_205a"] = function (event) {
  onDragEnd(event)
};
EMP_H["onDragLeave_event_d722"] = function (event) {
  onDragLeave(event)
};
EMP_H["onDragOver_event_c213"] = function (event) {
  onDragOver(event)
};
EMP_H["onDragStart_event_this_getAttr_9109"] = function (event) {
  onDragStart(event,this.getAttribute("data-arg-8357-0"))
};
EMP_H["onDrop_event_this_getAttribute_6423"] = function (event) {
  onDrop(event,this.getAttribute("data-arg-4477-0"))
};
EMP_H["saveVersion"] = function (event) {
  saveVersion()
};
EMP_H["setColor_10b981_this_eb84"] = function (event) {
  setColor('#10b981',this)
};
EMP_H["setColor_1a1a2e_this_a97c"] = function (event) {
  setColor('#1a1a2e',this)
};
EMP_H["setColor_3b82f6_this_fe0e"] = function (event) {
  setColor('#3b82f6',this)
};
EMP_H["setColor_6366f1_this_c32e"] = function (event) {
  setColor('#6366f1',this)
};
EMP_H["setColor_64748b_this_293f"] = function (event) {
  setColor('#64748b',this)
};
EMP_H["setColor_8b5cf6_this_efb6"] = function (event) {
  setColor('#8b5cf6',this)
};
EMP_H["setColor_ec4899_this_cbda"] = function (event) {
  setColor('#ec4899',this)
};
EMP_H["setColor_ef4444_this_747a"] = function (event) {
  setColor('#ef4444',this)
};
EMP_H["setColor_f59e0b_this_1d14"] = function (event) {
  setColor('#f59e0b',this)
};
EMP_H["setColor_this_value_null_390b"] = function (event) {
  setColor(this.value,null)
};
EMP_H["setFont_georgia_this_faca"] = function (event) {
  setFont('georgia',this)
};
EMP_H["setFont_inter_this_6d0e"] = function (event) {
  setFont('inter',this)
};
EMP_H["setFont_sora_this_99a7"] = function (event) {
  setFont('sora',this)
};
EMP_H["setMobileMode_edit_event_8fc6"] = function (event) {
  setMobileMode('edit',event)
};
EMP_H["setMobileMode_preview_event_be6d"] = function (event) {
  setMobileMode('preview',event)
};
EMP_H["setTab_this_design_1860"] = function (event) {
  setTab(this,'design')
};
EMP_H["setTab_this_edu_5343"] = function (event) {
  setTab(this,'edu')
};
EMP_H["setTab_this_exp_1c87"] = function (event) {
  setTab(this,'exp')
};
EMP_H["setTab_this_lang_129a"] = function (event) {
  setTab(this,'lang')
};
EMP_H["setTab_this_perso_3e26"] = function (event) {
  setTab(this,'perso')
};
EMP_H["setTab_this_sections_b9ab"] = function (event) {
  setTab(this,'sections')
};
EMP_H["setTab_this_skills_85fb"] = function (event) {
  setTab(this,'skills')
};
EMP_H["setTab_this_versions_0d53"] = function (event) {
  setTab(this,'versions')
};
EMP_H["setTemplate_classique_3a41"] = function (event) {
  setTemplate('classique')
};
EMP_H["setTemplate_creatif_d10d"] = function (event) {
  setTemplate('creatif')
};
EMP_H["setTemplate_minimal_e273"] = function (event) {
  setTemplate('minimal')
};
EMP_H["setTemplate_moderne_908a"] = function (event) {
  setTemplate('moderne')
};
EMP_H["toggleVisible_this_getAttribut_d8fd"] = function (event) {
  toggleVisible(this.getAttribute("data-arg-e2d8-0"),this)
};
EMP_H["updateCV"] = function (event) {
  updateCV()
};
EMP_H["window_print_b780"] = function (event) {
  window.print()
};
