/* ═══════════════════════════════════════════════════
   EMPLOIA — Shared JavaScript utilities
═══════════════════════════════════════════════════ */

// HTML escaping — used by all pages to prevent XSS
function esc(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── SCROLL PROGRESS ──────────────────────────────────
(function() {
  const bar = document.getElementById('emp-scroll-prog');
  if (!bar) return;
  window.addEventListener('scroll', () => {
    const pct = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight) * 100;
    bar.style.width = Math.min(pct, 100) + '%';
  }, { passive: true });
})();

// ── MOBILE NAV ────────────────────────────────────────
function empToggleNav() {
  const nav = document.getElementById('empMobileNav');
  const btn = document.getElementById('empHamburger');
  if (!nav || !btn) return;
  nav.classList.toggle('open');
  btn.classList.toggle('open');
}

document.addEventListener('click', e => {
  const nav = document.getElementById('empMobileNav');
  const btn = document.getElementById('empHamburger');
  if (nav && btn && !nav.contains(e.target) && !btn.contains(e.target)) {
    nav.classList.remove('open');
    btn.classList.remove('open');
  }
});

// Close on link click
document.querySelectorAll('#empMobileNav a').forEach(a => {
  a.addEventListener('click', () => {
    document.getElementById('empMobileNav')?.classList.remove('open');
    document.getElementById('empHamburger')?.classList.remove('open');
  });
});

// ── REVEAL ON SCROLL ─────────────────────────────────
(function() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
})();

// ── TOAST ────────────────────────────────────────────
function empToast(msg, type = 'success') {
  const container = document.getElementById('empToasts') || (() => {
    const c = document.createElement('div');
    c.id = 'empToasts';
    c.className = 'emp-toast-container';
    document.body.appendChild(c);
    return c;
  })();

  const icons = { success: '✓', error: '⚠', info: 'ℹ' };
  const colors = { success: 'var(--gnb)', error: 'var(--rnb)', info: 'var(--blb)' };

  const toast = document.createElement('div');
  toast.className = 'emp-toast';

  const iconEl = document.createElement('span');
  iconEl.style.cssText = `color:${colors[type]};font-size:16px;flex-shrink:0`;
  iconEl.textContent = icons[type];

  const msgEl = document.createElement('span');
  msgEl.style.cssText = 'flex:1;line-height:1.4';
  msgEl.textContent = msg;

  const closeEl = document.createElement('span');
  closeEl.style.cssText = 'cursor:pointer;color:var(--t3);font-size:13px';
  closeEl.textContent = '✕';
  closeEl.addEventListener('click', () => toast.remove());

  toast.append(iconEl, msgEl, closeEl);
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'all .3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── COOKIE BANNER ────────────────────────────────────
(function() {
  const KEY = 'emploia_cookie_v1';
  const banner = document.getElementById('empCookie');
  if (!banner) return;
  if (!localStorage.getItem(KEY)) {
    banner.style.display = 'flex';
  }
  window.empAcceptCookies = function() {
    localStorage.setItem(KEY, 'accepted');
    banner.style.display = 'none';
    // load analytics
    const s = document.createElement('script');
    s.defer = true;
    s.dataset.domain = 'emploia.fr';
    s.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(s);
  };
  window.empDeclineCookies = function() {
    localStorage.setItem(KEY, 'declined');
    banner.style.display = 'none';
  };
})();

// ── COUNTER ANIMATION ────────────────────────────────
function empAnimateCount(el) {
  const target = parseFloat(el.dataset.count);
  const suffix = el.dataset.suffix || '';
  const prefix = el.dataset.prefix || '';
  const duration = 1400;
  const start = performance.now();
  const step = now => {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    const val = target * ease;
    el.textContent = prefix + (Number.isInteger(target) ? Math.round(val) : val.toFixed(1)) + suffix;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── SERVICE WORKER ────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ── FAQ ACCORDION ─────────────────────────────────────
document.querySelectorAll('.emp-faq-item').forEach(item => {
  const btn = item.querySelector('.emp-faq-q');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.emp-faq-item').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

// ── ACTIVE NAV LINK ───────────────────────────────────
(function() {
  const path = window.location.pathname;
  document.querySelectorAll('.emp-nav-a, .emp-bottom-nav-item').forEach(a => {
    const href = a.getAttribute('href');
    if (!href) return;
    if (href === '/' ? path === '/' : path.startsWith(href)) {
      a.classList.add('active');
    }
  });
})();

// ── COUNTER TRIGGER ON SCROLL ─────────────────────────
(function() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        empAnimateCount(e.target);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-count]').forEach(el => obs.observe(el));
})();

// ── MODAL ─────────────────────────────────────────────
window.empOpenModal = function(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; }
};
window.empCloseModal = function(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.remove('open'); document.body.style.overflow = ''; }
};
document.querySelectorAll('.emp-modal-backdrop').forEach(m => {
  m.addEventListener('click', e => {
    if (e.target === m) window.empCloseModal(m.id);
  });
});

// ── AUTH SYSTEM ───────────────────────────────────────
window.empUser = null;

(function empAuthSetup() {
  // Inject styles
  const s = document.createElement('style');
  s.textContent = `
    .emp-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:none;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
    .emp-modal-backdrop.open{display:flex}
    .emp-auth-modal{max-width:420px;width:92%;border-radius:20px;padding:32px;position:relative;background:var(--s2);border:1px solid var(--brd);box-shadow:0 24px 60px rgba(0,0,0,.25)}
    .emp-modal-close{position:absolute;top:14px;right:14px;background:none;border:none;cursor:pointer;font-size:18px;color:var(--t3);padding:4px 8px;border-radius:6px;line-height:1}
    .emp-modal-close:hover{color:var(--t1);background:var(--s4)}
    .emp-auth-logo{width:44px;height:44px;background:var(--grad-primary);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff;margin:0 auto 20px}
    .emp-auth-tabs{display:flex;background:var(--s4);border-radius:10px;padding:3px;margin-bottom:24px;gap:3px}
    .emp-auth-tab{flex:1;padding:8px;border:none;background:transparent;border-radius:8px;font-size:13px;font-weight:700;color:var(--t2);cursor:pointer;font-family:'Sora',sans-serif;transition:all .15s}
    .emp-auth-tab.active{background:var(--s2);color:var(--t1);box-shadow:0 1px 4px rgba(0,0,0,.15)}
    .emp-auth-field{margin-bottom:14px}
    .emp-auth-field label{display:block;font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
    .emp-auth-field input{width:100%;padding:11px 14px;border-radius:10px;border:1.5px solid var(--brd);background:var(--bg);font-size:14px;color:var(--t1);font-family:'Inter',sans-serif;outline:none;transition:border-color .15s;box-sizing:border-box}
    .emp-auth-field input:focus{border-color:var(--blue)}
    .emp-auth-error{padding:10px 12px;border-radius:8px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);color:var(--rnb);font-size:12.5px;margin-bottom:14px}
    .emp-auth-submit{width:100%;padding:13px;border-radius:11px;font-size:14px;font-weight:800;color:#fff;background:var(--grad-primary);border:none;cursor:pointer;font-family:'Sora',sans-serif;transition:all .2s;box-shadow:0 6px 18px rgba(99,102,241,.35)}
    .emp-auth-submit:hover:not(:disabled){transform:translateY(-1px)}
    .emp-auth-submit:disabled{opacity:.55;cursor:not-allowed}
    .emp-auth-legal{text-align:center;font-size:11px;color:var(--t3);margin:14px 0 0}
    .emp-auth-legal a{color:var(--blb)}
    .emp-pwd-strength{height:4px;border-radius:2px;background:var(--s4);margin-top:6px;overflow:hidden}
    .emp-pwd-bar{height:100%;border-radius:2px;transition:width .3s,background .3s;width:0%}
    .emp-nav-auth{display:flex;align-items:center;gap:8px}
    .emp-nav-login{padding:7px 16px;border-radius:8px;font-size:13px;font-weight:700;color:var(--t1);background:transparent;border:1.5px solid var(--brd);cursor:pointer;font-family:'Sora',sans-serif;transition:all .15s}
    .emp-nav-login:hover{border-color:var(--brdh);color:var(--blb)}
    .emp-user-menu{position:relative}
    .emp-user-btn{display:flex;align-items:center;gap:8px;padding:5px 10px 5px 5px;border-radius:100px;border:1.5px solid var(--brd);background:var(--s2);cursor:pointer;font-family:'Sora',sans-serif;transition:all .15s}
    .emp-user-btn:hover{border-color:var(--brdh)}
    .emp-user-avatar{width:28px;height:28px;border-radius:50%;background:var(--grad-primary);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff}
    .emp-user-name{font-size:13px;font-weight:700;color:var(--t1)}
    .emp-user-chevron{font-size:10px;color:var(--t3)}
    .emp-user-dropdown{position:absolute;top:calc(100% + 8px);right:0;background:var(--s2);border:1px solid var(--brd);border-radius:12px;padding:6px;min-width:200px;box-shadow:0 8px 24px rgba(0,0,0,.12);display:none;z-index:1000}
    .emp-user-dropdown.open{display:block}
    .emp-user-dropdown a,.emp-user-dropdown button{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:8px;font-size:13px;font-weight:600;color:var(--t1);text-decoration:none;background:none;border:none;cursor:pointer;width:100%;text-align:left;font-family:'Sora',sans-serif;transition:background .1s}
    .emp-user-dropdown a:hover,.emp-user-dropdown button:hover{background:var(--s4)}
    .emp-user-sep{height:1px;background:var(--brd);margin:4px 0}
    .emp-user-plan{padding:6px 12px;font-size:11px;color:var(--t3)}
    .emp-user-logout{color:var(--rnb)!important}
    @media(max-width:768px){.emp-nav-auth{display:none}}
  `;
  document.head.appendChild(s);

  // Inject modal
  const modal = document.createElement('div');
  modal.id = 'empAuthModal';
  modal.className = 'emp-modal-backdrop';
  modal.innerHTML = `
    <div class="emp-auth-modal">
      <button class="emp-modal-close" onclick="empCloseModal('empAuthModal')" aria-label="Fermer">✕</button>
      <div class="emp-auth-logo">E</div>
      <div class="emp-auth-tabs">
        <button class="emp-auth-tab active" data-tab="login" onclick="empSwitchAuthTab('login')">Se connecter</button>
        <button class="emp-auth-tab" data-tab="register" onclick="empSwitchAuthTab('register')">S'inscrire</button>
      </div>
      <form id="empLoginForm" onsubmit="empSubmitLogin(event)">
        <div class="emp-auth-field"><label>Email</label><input type="email" id="empLoginEmail" placeholder="vous@email.fr" autocomplete="email" required/></div>
        <div class="emp-auth-field"><label>Mot de passe</label><input type="password" id="empLoginPassword" placeholder="••••••••" autocomplete="current-password" required/></div>
        <div id="empLoginError" class="emp-auth-error" style="display:none"></div>
        <button type="submit" class="emp-auth-submit" id="empLoginBtn">Se connecter</button>
      </form>
      <form id="empRegisterForm" style="display:none" onsubmit="empSubmitRegister(event)">
        <div class="emp-auth-field"><label>Prénom et nom</label><input type="text" id="empRegisterName" placeholder="Marie Dupont" autocomplete="name" required/></div>
        <div class="emp-auth-field"><label>Email</label><input type="email" id="empRegisterEmail" placeholder="vous@email.fr" autocomplete="email" required/></div>
        <div class="emp-auth-field">
          <label>Mot de passe</label>
          <input type="password" id="empRegisterPassword" placeholder="8 car. min, 1 majuscule, 1 chiffre" autocomplete="new-password" required oninput="empPwdStrength(this.value)"/>
          <div class="emp-pwd-strength"><div class="emp-pwd-bar" id="empPwdBar"></div></div>
        </div>
        <div id="empRegisterError" class="emp-auth-error" style="display:none"></div>
        <button type="submit" class="emp-auth-submit" id="empRegisterBtn">Créer mon compte gratuit</button>
      </form>
      <p class="emp-auth-legal">En continuant, vous acceptez nos <a href="/legal">CGU</a></p>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) empCloseModal('empAuthModal'); });

  // Inject nav button
  const navLinks = document.querySelector('.emp-nav-links');
  const navCta = navLinks?.querySelector('.emp-nav-cta');
  if (navLinks && navCta) {
    const authDiv = document.createElement('div');
    authDiv.className = 'emp-nav-auth';
    authDiv.id = 'empNavAuth';
    authDiv.innerHTML = `<button class="emp-nav-login" onclick="empShowAuth('login')">Se connecter</button>`;
    navLinks.insertBefore(authDiv, navCta);
  }

  // Check current auth state
  empAuthInit();
})();

window.empShowAuth = function(tab) {
  empSwitchAuthTab(tab || 'login');
  empOpenModal('empAuthModal');
};

window.empSwitchAuthTab = function(tab) {
  document.querySelectorAll('.emp-auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('empLoginForm').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('empRegisterForm').style.display = tab === 'register' ? '' : 'none';
  document.getElementById('empLoginError').style.display = 'none';
  document.getElementById('empRegisterError').style.display = 'none';
};

window.empPwdStrength = function(pwd) {
  const bar = document.getElementById('empPwdBar');
  if (!bar) return;
  const score = [pwd.length >= 8, /[A-Z]/.test(pwd), /[0-9]/.test(pwd), pwd.length >= 12, /[^a-zA-Z0-9]/.test(pwd)].filter(Boolean).length;
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];
  bar.style.width = (score * 20) + '%';
  bar.style.background = colors[score - 1] || '#ef4444';
};

window.empSubmitLogin = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('empLoginBtn');
  const errEl = document.getElementById('empLoginError');
  btn.disabled = true; btn.textContent = 'Connexion…'; errEl.style.display = 'none';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: document.getElementById('empLoginEmail').value.trim(), password: document.getElementById('empLoginPassword').value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur de connexion');
    empCloseModal('empAuthModal');
    window.empUser = data.user;
    empUpdateNav(data.user);
    empToast('Bienvenue ' + data.user.name.split(' ')[0] + ' !', 'success');
    window.dispatchEvent(new CustomEvent('empAuthChange', { detail: { user: data.user } }));
  } catch (err) {
    errEl.textContent = err.message; errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Se connecter';
  }
};

window.empSubmitRegister = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('empRegisterBtn');
  const errEl = document.getElementById('empRegisterError');
  btn.disabled = true; btn.textContent = 'Création…'; errEl.style.display = 'none';
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('empRegisterName').value.trim(),
        email: document.getElementById('empRegisterEmail').value.trim(),
        password: document.getElementById('empRegisterPassword').value
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur d'inscription");
    empCloseModal('empAuthModal');
    window.empUser = data.user;
    empUpdateNav(data.user);
    empToast('Compte créé ! Bienvenue ' + data.user.name.split(' ')[0] + ' 🎉', 'success');
    window.dispatchEvent(new CustomEvent('empAuthChange', { detail: { user: data.user } }));
  } catch (err) {
    errEl.textContent = err.message; errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Créer mon compte gratuit';
  }
};

window.empLogout = async function() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.empUser = null;
  empUpdateNav(null);
  empToast('Déconnecté', 'info');
  window.dispatchEvent(new CustomEvent('empAuthChange', { detail: { user: null } }));
  if (['/dashboard', '/profil'].includes(window.location.pathname)) window.location.href = '/';
};

window.empUpdateNav = function(user) {
  const authDiv = document.getElementById('empNavAuth');
  if (!authDiv) return;
  if (!user) {
    authDiv.innerHTML = `<button class="emp-nav-login" onclick="empShowAuth('login')">Se connecter</button>`;
    return;
  }
  const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  authDiv.innerHTML = `
    <div class="emp-user-menu" id="empUserMenu">
      <button class="emp-user-btn" onclick="empToggleUserMenu()">
        <div class="emp-user-avatar">${initials}</div>
        <span class="emp-user-name">${user.name.split(' ')[0]}</span>
        <span class="emp-user-chevron">▾</span>
      </button>
      <div class="emp-user-dropdown" id="empUserDropdown">
        <a href="/dashboard">📊 Dashboard</a>
        <a href="/profil">👤 Mon profil</a>
        <div class="emp-user-sep"></div>
        <div class="emp-user-plan">Plan : <strong>${user.plan === 'pro' ? '⭐ Pro' : 'Gratuit'}</strong></div>
        <div class="emp-user-sep"></div>
        <button class="emp-user-logout" onclick="empLogout()">Déconnexion</button>
      </div>
    </div>`;
  document.addEventListener('click', e => {
    const menu = document.getElementById('empUserMenu');
    if (menu && !menu.contains(e.target)) document.getElementById('empUserDropdown')?.classList.remove('open');
  });
};

window.empToggleUserMenu = function() {
  document.getElementById('empUserDropdown')?.classList.toggle('open');
};

async function empAuthInit() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.ok) {
      const data = await res.json();
      window.empUser = data.user;
      empUpdateNav(data.user);
    }
  } catch (e) {}
}

