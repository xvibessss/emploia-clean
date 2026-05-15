/* ═══════════════════════════════════════════════════
   EMPLOIA — Shared JavaScript utilities
═══════════════════════════════════════════════════ */

// Plausible analytics + preconnect — loaded once globally, privacy-first
(function() {
  if (!document.querySelector('link[href="https://plausible.io"]')) {
    const pre = document.createElement('link');
    pre.rel = 'preconnect';
    pre.href = 'https://plausible.io';
    document.head.appendChild(pre);
  }
  if (document.querySelector('script[data-domain="emploia.fr"]')) return;
  const s = document.createElement('script');
  s.defer = true;
  s.dataset.domain = 'emploia.fr';
  s.src = 'https://plausible.io/js/script.js';
  document.head.appendChild(s);
})();

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

// ── CRISP LIVE CHAT ───────────────────────────────────
// Load only on app/dashboard/pricing pages — not on blog/SEO pages
// to avoid slowing down crawler indexing.
(function() {
  const path = window.location.pathname;
  const chatPages = ['/app', '/dashboard', '/interview', '/profil', '/onboarding', '/apply-queue', '/alerts', '/cv-builder', '/'];
  if (!chatPages.some(p => path === p || path.startsWith(p + '?'))) return;
  window.$crisp = [];
  window.CRISP_WEBSITE_ID = 'VOTRE_CRISP_ID';
  const s = document.createElement('script');
  s.src = 'https://client.crisp.chat/l.js';
  s.async = true;
  document.head.appendChild(s);
  // Pre-fill with user info once auth resolves
  window.addEventListener('empAuthChange', e => {
    const u = e.detail?.user;
    if (u && window.$crisp) {
      if (u.email) window.$crisp.push(['set', 'user:email', [u.email]]);
      if (u.name) window.$crisp.push(['set', 'user:nickname', [u.name]]);
      if (u.plan && u.plan !== 'free') window.$crisp.push(['set', 'session:segments', [[u.plan]]]);
    }
  });
})();

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
  const s = document.createElement('style');
  s.textContent = `
    .emp-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:none;align-items:center;justify-content:center;backdrop-filter:blur(6px);padding:16px}
    .emp-modal-backdrop.open{display:flex}
    .emp-auth-modal{max-width:440px;width:100%;border-radius:24px;padding:32px;position:relative;background:var(--s2);border:1px solid var(--brd);box-shadow:0 32px 80px rgba(0,0,0,.3);max-height:90vh;overflow-y:auto}
    .emp-modal-close{position:absolute;top:14px;right:14px;background:none;border:none;cursor:pointer;font-size:18px;color:var(--t3);padding:5px 9px;border-radius:8px;line-height:1;transition:all .15s}
    .emp-modal-close:hover{color:var(--t1);background:var(--s4)}
    .emp-auth-logo{width:44px;height:44px;background:var(--grad-primary);border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff;margin:0 auto 8px}
    .emp-auth-title{font-size:20px;font-weight:800;color:var(--t1);text-align:center;margin:0 0 4px;letter-spacing:-.5px}
    .emp-auth-subtitle{font-size:13px;color:var(--t2);text-align:center;margin:0 0 22px;line-height:1.5}
    .emp-social-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:11px 16px;border-radius:11px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:'Sora',sans-serif;transition:all .15s;margin-bottom:10px;border:1.5px solid var(--brd);background:var(--bg);color:var(--t1)}
    .emp-social-btn:hover{border-color:var(--brdh);transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.08)}
    .emp-auth-divider{display:flex;align-items:center;gap:12px;margin:18px 0;color:var(--t3);font-size:12px;font-weight:600}
    .emp-auth-divider::before,.emp-auth-divider::after{content:'';flex:1;height:1px;background:var(--brd)}
    .emp-auth-tabs{display:flex;background:var(--s4);border-radius:10px;padding:3px;margin-bottom:20px;gap:3px}
    .emp-auth-tab{flex:1;padding:8px;border:none;background:transparent;border-radius:8px;font-size:13px;font-weight:700;color:var(--t2);cursor:pointer;font-family:'Sora',sans-serif;transition:all .15s}
    .emp-auth-tab.active{background:var(--s2);color:var(--t1);box-shadow:0 1px 4px rgba(0,0,0,.15)}
    .emp-auth-field{margin-bottom:14px}
    .emp-auth-field label{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
    .emp-auth-field input{width:100%;padding:11px 14px;border-radius:10px;border:1.5px solid var(--brd);background:var(--bg);font-size:14px;color:var(--t1);font-family:'Inter',sans-serif;outline:none;transition:border-color .15s;box-sizing:border-box}
    .emp-auth-field input:focus{border-color:var(--blue)}
    .emp-auth-forgot{font-size:12px;font-weight:600;color:var(--blb);cursor:pointer;white-space:nowrap}
    .emp-auth-forgot:hover{text-decoration:underline}
    .emp-auth-error{padding:10px 12px;border-radius:8px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);color:var(--rnb);font-size:12.5px;margin-bottom:14px;line-height:1.4}
    .emp-auth-success{padding:10px 12px;border-radius:8px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);color:var(--gnb);font-size:12.5px;margin-bottom:14px;line-height:1.4}
    .emp-auth-submit{width:100%;padding:13px;border-radius:11px;font-size:14px;font-weight:800;color:#fff;background:var(--grad-primary);border:none;cursor:pointer;font-family:'Sora',sans-serif;transition:all .2s;box-shadow:0 6px 18px rgba(99,102,241,.35)}
    .emp-auth-submit:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 24px rgba(99,102,241,.45)}
    .emp-auth-submit:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none}
    .emp-auth-legal{text-align:center;font-size:11px;color:var(--t3);margin:14px 0 0;line-height:1.5}
    .emp-auth-legal a{color:var(--blb)}
    .emp-pwd-strength{height:4px;border-radius:2px;background:var(--s4);margin-top:6px;overflow:hidden}
    .emp-pwd-bar{height:100%;border-radius:2px;transition:width .3s,background .3s;width:0%}
    .emp-auth-back{display:inline-flex;align-items:center;gap:6px;background:none;border:none;cursor:pointer;font-size:13px;font-weight:700;color:var(--t2);padding:0;font-family:'Sora',sans-serif;margin-bottom:20px;transition:color .15s}
    .emp-auth-back:hover{color:var(--t1)}
    .emp-auth-sent-icon{font-size:48px;text-align:center;margin:8px 0 16px}
    .emp-nav-auth{display:flex;align-items:center;gap:8px}
    .emp-nav-login{padding:7px 16px;border-radius:8px;font-size:13px;font-weight:700;color:var(--t1);background:transparent;border:1.5px solid var(--brd);cursor:pointer;font-family:'Sora',sans-serif;transition:all .15s}
    .emp-nav-login:hover{border-color:var(--brdh);color:var(--blb)}
    .emp-user-menu{position:relative}
    .emp-user-btn{display:flex;align-items:center;gap:8px;padding:5px 10px 5px 5px;border-radius:100px;border:1.5px solid var(--brd);background:var(--s2);cursor:pointer;font-family:'Sora',sans-serif;transition:all .15s}
    .emp-user-btn:hover{border-color:var(--brdh)}
    .emp-user-avatar{width:28px;height:28px;border-radius:50%;background:var(--grad-primary);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;overflow:hidden;flex-shrink:0}
    .emp-user-avatar img{width:100%;height:100%;object-fit:cover}
    .emp-user-name{font-size:13px;font-weight:700;color:var(--t1)}
    .emp-user-chevron{font-size:10px;color:var(--t3)}
    .emp-user-dropdown{position:absolute;top:calc(100% + 8px);right:0;background:var(--s2);border:1px solid var(--brd);border-radius:14px;padding:6px;min-width:210px;box-shadow:0 12px 32px rgba(0,0,0,.15);display:none;z-index:1000}
    .emp-user-dropdown.open{display:block}
    .emp-user-dropdown a,.emp-user-dropdown button{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:8px;font-size:13px;font-weight:600;color:var(--t1);text-decoration:none;background:none;border:none;cursor:pointer;width:100%;text-align:left;font-family:'Sora',sans-serif;transition:background .1s}
    .emp-user-dropdown a:hover,.emp-user-dropdown button:hover{background:var(--s4)}
    .emp-user-sep{height:1px;background:var(--brd);margin:4px 0}
    .emp-user-plan{padding:6px 12px;font-size:11px;color:var(--t3)}
    .emp-user-logout{color:var(--rnb)!important}
    @media(max-width:768px){.emp-nav-auth{display:none}}
  `;
  document.head.appendChild(s);

  const GOOGLE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`;

  const modal = document.createElement('div');
  modal.id = 'empAuthModal';
  modal.className = 'emp-modal-backdrop';
  modal.innerHTML = `
    <div class="emp-auth-modal">
      <button class="emp-modal-close" onclick="empCloseModal('empAuthModal')" aria-label="Fermer">✕</button>

      <!-- ÉCRAN 1 : Connexion / Inscription -->
      <div id="empAuthMain">
        <div class="emp-auth-logo">E</div>
        <h2 class="emp-auth-title">Bienvenue sur Emploia</h2>
        <p class="emp-auth-subtitle">Votre copilote IA pour décrocher des entretiens</p>

        <button class="emp-social-btn" onclick="empGoogleLogin()">
          ${GOOGLE_ICON} Continuer avec Google
        </button>
        <div class="emp-auth-divider">ou continuer avec un email</div>

        <div class="emp-auth-tabs">
          <button class="emp-auth-tab active" data-tab="login" onclick="empSwitchAuthTab('login')">Se connecter</button>
          <button class="emp-auth-tab" data-tab="register" onclick="empSwitchAuthTab('register')">S'inscrire</button>
        </div>

        <form id="empLoginForm" onsubmit="empSubmitLogin(event)">
          <div class="emp-auth-field"><label>Email</label><input type="email" id="empLoginEmail" placeholder="vous@email.fr" autocomplete="email" required/></div>
          <div class="emp-auth-field">
            <label>Mot de passe <span class="emp-auth-forgot" onclick="empShowForgot()">Mot de passe oublié ?</span></label>
            <input type="password" id="empLoginPassword" placeholder="••••••••" autocomplete="current-password" required/>
          </div>
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

        <p class="emp-auth-legal">En continuant, vous acceptez nos <a href="/legal">CGU</a> et notre <a href="/legal">politique de confidentialité</a></p>
      </div>

      <!-- ÉCRAN 2 : Mot de passe oublié -->
      <div id="empAuthForgot" style="display:none">
        <button class="emp-auth-back" onclick="empShowMain()">← Retour</button>
        <div class="emp-auth-logo" style="font-size:22px">🔑</div>
        <h2 class="emp-auth-title">Mot de passe oublié ?</h2>
        <p class="emp-auth-subtitle">Entrez votre email, on vous envoie un lien pour créer un nouveau mot de passe.</p>
        <form id="empForgotForm" onsubmit="empSubmitForgot(event)">
          <div class="emp-auth-field"><label>Email</label><input type="email" id="empForgotEmail" placeholder="vous@email.fr" autocomplete="email" required/></div>
          <div id="empForgotError" class="emp-auth-error" style="display:none"></div>
          <button type="submit" class="emp-auth-submit" id="empForgotBtn">Envoyer le lien de réinitialisation</button>
        </form>
      </div>

      <!-- ÉCRAN 3 : Email envoyé -->
      <div id="empAuthSent" style="display:none;text-align:center">
        <div class="emp-auth-sent-icon">✉️</div>
        <h2 class="emp-auth-title">Email envoyé !</h2>
        <p class="emp-auth-subtitle">Vérifiez votre boîte mail et cliquez sur le lien pour réinitialiser votre mot de passe.<br/><span style="font-size:11px;color:var(--t3)">Pensez à vérifier vos spams.</span></p>
        <button class="emp-auth-submit" style="margin-top:8px" onclick="empShowMain()">Retour à la connexion</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) empCloseModal('empAuthModal'); });

  const navLinks = document.querySelector('.emp-nav-links');
  const navCta = navLinks?.querySelector('.emp-nav-cta');
  if (navLinks && navCta) {
    const authDiv = document.createElement('div');
    authDiv.className = 'emp-nav-auth';
    authDiv.id = 'empNavAuth';
    authDiv.innerHTML = `<button class="emp-nav-login" onclick="empShowAuth('login')">Se connecter</button>`;
    navLinks.insertBefore(authDiv, navCta);
  }

  empAuthInit();
})();

window.empShowAuth = function(tab) {
  empShowMain();
  empSwitchAuthTab(tab || 'login');
  empOpenModal('empAuthModal');
};

window.empShowMain = function() {
  document.getElementById('empAuthMain').style.display = '';
  document.getElementById('empAuthForgot').style.display = 'none';
  document.getElementById('empAuthSent').style.display = 'none';
};

window.empShowForgot = function() {
  document.getElementById('empAuthMain').style.display = 'none';
  document.getElementById('empAuthForgot').style.display = '';
  document.getElementById('empAuthSent').style.display = 'none';
  document.getElementById('empForgotError').style.display = 'none';
  const loginEmail = document.getElementById('empLoginEmail')?.value;
  if (loginEmail) document.getElementById('empForgotEmail').value = loginEmail;
};

window.empSwitchAuthTab = function(tab) {
  document.querySelectorAll('.emp-auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('empLoginForm').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('empRegisterForm').style.display = tab === 'register' ? '' : 'none';
  document.getElementById('empLoginError').style.display = 'none';
  document.getElementById('empRegisterError').style.display = 'none';
};

window.empGoogleLogin = function() {
  window.location.href = '/api/auth/google';
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
    if (window.plausible) plausible('login');
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
    if (window.plausible) plausible('signup');
    window.empUser = data.user;
    empUpdateNav(data.user);
    window.dispatchEvent(new CustomEvent('empAuthChange', { detail: { user: data.user } }));
    window.location.href = '/onboarding';
  } catch (err) {
    errEl.textContent = err.message; errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Créer mon compte gratuit';
  }
};

window.empSubmitForgot = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('empForgotBtn');
  const errEl = document.getElementById('empForgotError');
  btn.disabled = true; btn.textContent = 'Envoi…'; errEl.style.display = 'none';
  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: document.getElementById('empForgotEmail').value.trim() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur');
    document.getElementById('empAuthForgot').style.display = 'none';
    document.getElementById('empAuthSent').style.display = '';
  } catch (err) {
    errEl.textContent = err.message; errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Envoyer le lien de réinitialisation';
  }
};

window.empLogout = async function() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.empUser = null;
  empUpdateNav(null);
  empToast('Déconnecté', 'info');
  window.dispatchEvent(new CustomEvent('empAuthChange', { detail: { user: null } }));
  const authPaths = ['/dashboard', '/profil', '/app', '/cv-builder', '/interview', '/alerts', '/apply-queue', '/onboarding'];
  if (authPaths.some(p => window.location.pathname.startsWith(p))) window.location.href = '/';
};

window.empUpdateNav = function(user) {
  const authDiv = document.getElementById('empNavAuth');
  if (!authDiv) return;
  if (!user) {
    authDiv.innerHTML = `<button class="emp-nav-login" onclick="empShowAuth('login')">Se connecter</button>`;
    return;
  }
  const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const avatarContent = user.avatar
    ? `<img src="${user.avatar}" alt="" referrerpolicy="no-referrer"/>`
    : initials;
  authDiv.innerHTML = `
    <div class="emp-user-menu" id="empUserMenu">
      <button class="emp-user-btn" onclick="empToggleUserMenu()">
        <div class="emp-user-avatar">${avatarContent}</div>
        <span class="emp-user-name">${user.name.split(' ')[0]}</span>
        <span class="emp-user-chevron">▾</span>
      </button>
      <div class="emp-user-dropdown" id="empUserDropdown">
        <a href="/dashboard">📊 Dashboard</a>
        <a href="/profil">👤 Mon profil</a>
        <div class="emp-user-sep"></div>
        <div class="emp-user-plan">Plan : <strong>${user.plan === 'pro' ? '⭐ Pro' : user.plan === 'intensif' ? '🚀 Intensif' : 'Gratuit'}</strong></div>
        <div class="emp-user-sep"></div>
        ${!user.provider || user.provider === 'email' ? `<button onclick="empShowChangePwd()">🔑 Changer le mot de passe</button>` : ''}
        <button class="emp-user-theme" onclick="empToggleTheme()" id="empThemeBtn">${document.body.classList.contains('light') ? '🌙 Mode sombre' : '☀️ Mode clair'}</button>
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

window.empToggleTheme = function() {
  const isLight = document.body.classList.toggle('light');
  localStorage.setItem('empTheme', isLight ? 'light' : 'dark');
  const btn = document.getElementById('empThemeBtn');
  if (btn) btn.textContent = isLight ? '🌙 Mode sombre' : '☀️ Mode clair';
};

(function empInitTheme() {
  if (localStorage.getItem('empTheme') === 'light') document.body.classList.add('light');
})();

async function empAuthInit() {
  // Handle OAuth redirect errors
  const urlParams = new URLSearchParams(window.location.search);
  const oauthError = urlParams.get('error');
  if (oauthError) {
    const msgs = {
      google_not_configured: 'Connexion Google non configurée pour le moment',
      google_denied: 'Connexion Google annulée',
      oauth_invalid: 'Session expirée, veuillez réessayer',
      oauth_failed: 'Erreur lors de la connexion Google, réessayez',
    };
    setTimeout(() => empToast(msgs[oauthError] || 'Erreur de connexion', 'error'), 300);
    // Clean URL
    const clean = window.location.pathname + (urlParams.toString().replace(`error=${oauthError}`, '').replace(/^&|&$/, '') ? '?' + urlParams.toString().replace(`error=${oauthError}`, '').replace(/^&|&$/, '') : '');
    history.replaceState(null, '', clean);
  }

  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.ok) {
      const data = await res.json();
      window.empUser = data.user;
      empUpdateNav(data.user);
      window.dispatchEvent(new CustomEvent('empUserLoaded', { detail: data.user }));
      // Inject auth link in mobile nav
      const mobileNav = document.getElementById('empMobileNav');
      if (mobileNav) {
        const sep = mobileNav.querySelector('.mn-div');
        const link = document.createElement('a');
        link.textContent = '👤 Mon compte';
        link.href = '/profil';
        if (sep) mobileNav.insertBefore(link, sep);
      }
    } else {
      // Not logged in — add login link to mobile nav
      const mobileNav = document.getElementById('empMobileNav');
      if (mobileNav) {
        const sep = mobileNav.querySelector('.mn-div') || mobileNav.querySelector('.mn-cta');
        const link = document.createElement('a');
        link.textContent = '🔑 Se connecter';
        link.href = '#';
        link.onclick = e => { e.preventDefault(); empShowAuth('login'); };
        if (sep) mobileNav.insertBefore(link, sep);
      }
    }
  } catch (e) {}
}


// ── CMD+K GLOBAL SEARCH SPOTLIGHT ────────────────────────────────────────────
(function () {
  let spotlightOpen = false;

  const style = document.createElement('style');
  style.textContent = `
    #empSpotlight { position:fixed;inset:0;z-index:99999;display:none;align-items:flex-start;justify-content:center;padding-top:15vh;background:rgba(0,0,0,.55);backdrop-filter:blur(6px); }
    #empSpotlight.open { display:flex; }
    #empSpotlightBox { background:var(--s2);border:1px solid var(--brd);border-radius:18px;width:100%;max-width:560px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.5); }
    #empSpotlightInput { width:100%;padding:18px 22px;background:transparent;border:none;outline:none;font-size:17px;color:var(--tx1);font-family:inherit;border-bottom:1px solid var(--brd); }
    #empSpotlightInput::placeholder { color:var(--tx3); }
    #empSpotlightResults { max-height:320px;overflow-y:auto; }
    .sp-result { display:flex;align-items:center;gap:12px;padding:12px 18px;cursor:pointer;transition:background .1s;text-decoration:none;color:var(--tx1); }
    .sp-result:hover,.sp-result.active { background:var(--s3); }
    .sp-result-icon { font-size:18px;width:32px;text-align:center; }
    .sp-result-text { flex:1; }
    .sp-result-title { font-size:14px;font-weight:600; }
    .sp-result-sub { font-size:11px;color:var(--tx3);margin-top:1px; }
    .sp-section { padding:8px 18px 4px;font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.6px;border-top:1px solid var(--brd); }
    #empSpotlightHint { padding:10px 18px;font-size:11px;color:var(--tx3);text-align:center;border-top:1px solid var(--brd); }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'empSpotlight';
  overlay.innerHTML = `
    <div id="empSpotlightBox">
      <input id="empSpotlightInput" placeholder="Rechercher offres, pages, actions…" autocomplete="off" spellcheck="false"/>
      <div id="empSpotlightResults"></div>
      <div id="empSpotlightHint">↑↓ Naviguer · Entrée Ouvrir · Échap Fermer</div>
    </div>`;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(overlay));
  overlay.addEventListener('click', e => { if (e.target === overlay) closeSpotlight(); });

  const PAGES = [
    { icon:'📋', title:'Offres d\'emploi', sub:'Trouver une offre', url:'/jobs' },
    { icon:'📊', title:'Dashboard', sub:'Voir mes candidatures', url:'/dashboard' },
    { icon:'✨', title:'Générer un CV', sub:'CV ATS-optimisé en 30s', url:'/app' },
    { icon:'✉️', title:'Générer une lettre', sub:'Lettre de motivation IA', url:'/app?mode=cover' },
    { icon:'🎤', title:'Simuler un entretien', sub:'Coach IA en temps réel', url:'/interview' },
    { icon:'📬', title:'File de candidatures', sub:'Auto-apply en batch', url:'/apply-queue' },
    { icon:'🔔', title:'Alertes emploi', sub:'Mes alertes et notifications', url:'/alerts' },
    { icon:'👤', title:'Mon Profil', sub:'Compétences, expériences', url:'/profil' },
    { icon:'🏗', title:'CV Builder', sub:'Éditeur visuel de CV', url:'/cv-builder' },
    { icon:'📝', title:'Mon Profil de candidat', sub:'Éditer mon profil IA', url:'/app' },
    { icon:'🔗', title:'Optimiser LinkedIn', sub:'Résumé et compétences IA', url:'/tools' },
    { icon:'💰', title:'Négociation salariale', sub:'Email + script + arguments Pro', url:'/tools' },
    { icon:'📧', title:'Email de relance', sub:'Relancer une candidature en 30s', url:'/tools' },
    { icon:'💬', title:'Message LinkedIn', sub:'Outreach recruteur personnalisé', url:'/tools' },
    { icon:'🎯', title:'Bilan post-entretien', sub:'Analyse IA après entretien (Pro)', url:'/tools' },
  ];

  let activeIdx = -1;
  let currentResults = [];

  function openSpotlight() {
    spotlightOpen = true;
    overlay.classList.add('open');
    setTimeout(() => {
      const inp = document.getElementById('empSpotlightInput');
      if (inp) { inp.value = ''; inp.focus(); renderSpotlightResults(''); }
    }, 30);
  }

  function closeSpotlight() {
    spotlightOpen = false;
    overlay.classList.remove('open');
    activeIdx = -1;
  }

  function renderSpotlightResults(q) {
    const container = document.getElementById('empSpotlightResults');
    if (!container) return;
    const lower = q.toLowerCase().trim();
    activeIdx = -1;

    const pages = lower ? PAGES.filter(p => p.title.toLowerCase().includes(lower) || p.sub.toLowerCase().includes(lower)) : PAGES;
    currentResults = [...pages];

    let html = '';
    if (pages.length) {
      html += `<div class="sp-section">Navigation</div>`;
      html += pages.map((p, i) => `<a class="sp-result" href="${p.url}" onclick="closeSpotlight()" data-idx="${i}">
        <div class="sp-result-icon">${p.icon}</div>
        <div class="sp-result-text"><div class="sp-result-title">${p.title}</div><div class="sp-result-sub">${p.sub}</div></div>
      </a>`).join('');
    }

    if (lower) {
      html += `<div class="sp-section">Recherche offres</div>
        <a class="sp-result" href="/jobs?q=${encodeURIComponent(lower)}" onclick="closeSpotlight()">
          <div class="sp-result-icon">🔍</div>
          <div class="sp-result-text"><div class="sp-result-title">Offres "${q}"</div><div class="sp-result-sub">Rechercher sur Emploia</div></div>
        </a>`;
    }

    if (!html) html = `<div style="padding:24px;text-align:center;font-size:13px;color:var(--tx3)">Aucun résultat</div>`;
    container.innerHTML = html;
  }

  // Expose for onclick
  window.closeSpotlight = closeSpotlight;

  // Keyboard: Cmd+K or Ctrl+K
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (spotlightOpen) closeSpotlight(); else openSpotlight();
      return;
    }
    if (!spotlightOpen) return;
    if (e.key === 'Escape') { closeSpotlight(); return; }
    const results = document.querySelectorAll('#empSpotlightResults .sp-result');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, results.length - 1);
      results.forEach((r, i) => r.classList.toggle('active', i === activeIdx));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      results.forEach((r, i) => r.classList.toggle('active', i === activeIdx));
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && results[activeIdx]) results[activeIdx].click();
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    const inp = document.getElementById('empSpotlightInput');
    if (inp) inp.addEventListener('input', e => renderSpotlightResults(e.target.value));

    // Add Cmd+K button to nav if space allows
    const nav = document.querySelector('.emp-nav .nav-links') || document.querySelector('.emp-nav .emp-nav-links');
    if (nav) {
      const btn = document.createElement('button');
      btn.style.cssText = 'background:var(--s3);border:1px solid var(--brd);border-radius:8px;padding:5px 12px;font-size:12px;color:var(--tx2);cursor:pointer;display:flex;align-items:center;gap:6px;';
      btn.innerHTML = '🔍 <kbd style="font-size:10px;opacity:.6">⌘K</kbd>';
      btn.title = 'Recherche globale (Cmd+K)';
      btn.onclick = openSpotlight;
      nav.appendChild(btn);
    }
  });
})();

// ── SCORE SNAPSHOT ───────────────────────────────────────────────────────────
// Saves score history to localStorage for dashboard progression chart
// type: 'ats' | 'interview' | 'match'
window.saveScoreSnapshot = function(type, score, label) {
  if (typeof score !== 'number' || isNaN(score)) return;
  const KEY = 'emploia_scores_history';
  let history = [];
  try { history = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch {}
  history.push({ ts: Date.now(), type, score: Math.round(score), label: (label || '').slice(0, 60) });
  if (history.length > 50) history = history.slice(-50);
  try { localStorage.setItem(KEY, JSON.stringify(history)); } catch {}
};

// ── CHANGE PASSWORD MODAL ─────────────────────────────────────────────────────
(function () {
  const style = document.createElement('style');
  style.textContent = `
    #empChangePwdModal .emp-auth-modal { max-width: 400px; }
  `;
  document.head.appendChild(style);

  const modal = document.createElement('div');
  modal.id = 'empChangePwdModal';
  modal.className = 'emp-modal-backdrop';
  modal.innerHTML = `
    <div class="emp-auth-modal">
      <button class="emp-modal-close" onclick="empCloseModal('empChangePwdModal')" aria-label="Fermer">✕</button>
      <div class="emp-auth-logo" style="font-size:20px">🔑</div>
      <h2 class="emp-auth-title">Changer le mot de passe</h2>
      <p class="emp-auth-subtitle" style="margin-bottom:20px">Entrez votre mot de passe actuel puis choisissez un nouveau.</p>
      <form id="empChangePwdForm" onsubmit="empSubmitChangePwd(event)">
        <div class="emp-auth-field">
          <label>Mot de passe actuel</label>
          <input type="password" id="empCurPwd" placeholder="••••••••" autocomplete="current-password" required/>
        </div>
        <div class="emp-auth-field">
          <label>Nouveau mot de passe</label>
          <input type="password" id="empNewPwd" placeholder="8 car. min, 1 majuscule, 1 chiffre" autocomplete="new-password" required oninput="empPwdStrength(this.value)"/>
          <div class="emp-pwd-strength"><div class="emp-pwd-bar" id="empPwdBar2"></div></div>
        </div>
        <div class="emp-auth-field">
          <label>Confirmer le nouveau mot de passe</label>
          <input type="password" id="empConfirmPwd" placeholder="••••••••" autocomplete="new-password" required/>
        </div>
        <div id="empChangePwdError" class="emp-auth-error" style="display:none"></div>
        <div id="empChangePwdSuccess" class="emp-auth-success" style="display:none">Mot de passe modifié avec succès ✓</div>
        <button type="submit" class="emp-auth-submit" id="empChangePwdBtn">Modifier le mot de passe</button>
      </form>
    </div>`;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(modal));
  modal.addEventListener('click', e => { if (e.target === modal) empCloseModal('empChangePwdModal'); });

  // Reuse the same strength bar id logic
  const origStrength = window.empPwdStrength;
  window.empPwdStrength = function(pwd) {
    origStrength(pwd);
    const bar2 = document.getElementById('empPwdBar2');
    if (!bar2) return;
    const score = [pwd.length >= 8, /[A-Z]/.test(pwd), /[0-9]/.test(pwd), pwd.length >= 12, /[^a-zA-Z0-9]/.test(pwd)].filter(Boolean).length;
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];
    bar2.style.width = (score * 20) + '%';
    bar2.style.background = colors[score - 1] || '#ef4444';
  };
})();

window.empShowChangePwd = function() {
  document.getElementById('empChangePwdError').style.display = 'none';
  document.getElementById('empChangePwdSuccess').style.display = 'none';
  document.getElementById('empChangePwdForm').reset();
  document.getElementById('empUserDropdown')?.classList.remove('open');
  empOpenModal('empChangePwdModal');
};

window.empSubmitChangePwd = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('empChangePwdBtn');
  const errEl = document.getElementById('empChangePwdError');
  const okEl  = document.getElementById('empChangePwdSuccess');
  errEl.style.display = 'none';
  okEl.style.display = 'none';

  const newPwd  = document.getElementById('empNewPwd').value;
  const confirm = document.getElementById('empConfirmPwd').value;
  if (newPwd !== confirm) {
    errEl.textContent = 'Les deux nouveaux mots de passe ne correspondent pas.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true; btn.textContent = 'Modification…';
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: document.getElementById('empCurPwd').value,
        newPassword: newPwd,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur');
    okEl.style.display = 'block';
    document.getElementById('empChangePwdForm').reset();
    setTimeout(() => empCloseModal('empChangePwdModal'), 1800);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Modifier le mot de passe';
  }
};

// ── NATIVE IMAGE LAZY LOADING ─────────────────────────────────────────────────
// Applies loading="lazy" to all below-fold <img> that don't have an explicit attribute
(function () {
  if (!('loading' in HTMLImageElement.prototype)) return;
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('img:not([loading])').forEach((img, idx) => {
      if (idx > 1) img.loading = 'lazy';
    });
  });
})();
