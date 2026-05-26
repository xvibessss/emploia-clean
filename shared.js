/* ═══════════════════════════════════════════════════════════════════
   EMPLOIA — Notion-Style · Shared JS
═══════════════════════════════════════════════════════════════════ */

/* ── Global polish: scroll progress + nav scroll-aware + reveals ── */
(function(){
  // Inject scroll progress bar if not already present
  if(!document.getElementById('emp-scroll-prog')){
    const b=document.createElement('div');b.id='emp-scroll-prog';
    document.body.insertBefore(b,document.body.firstChild);
  }
  // Scroll progress
  window.addEventListener('scroll',function(){
    const h=document.documentElement.scrollHeight-window.innerHeight;
    const bar=document.getElementById('emp-scroll-prog');
    if(bar) bar.style.width=(h>0?window.scrollY/h*100:0)+'%';
    const nav=document.querySelector('.emp-nav');
    if(nav) nav.classList.toggle('scrolled',window.scrollY>80);
  },{passive:true});
  // Scroll reveal
  document.addEventListener('DOMContentLoaded',function(){
    const els=document.querySelectorAll('.reveal');
    if(!els.length) return;
    const io=new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target);}
      });
    },{threshold:0.08,rootMargin:'0px 0px -32px 0px'});
    els.forEach(function(el){io.observe(el);});
  });
})();

// ── HTML ESCAPE ─────────────────────────────────────────────────────
function esc(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── SCROLL PROGRESS ─────────────────────────────────────────────────
(() => {
  const bar = document.getElementById('emp-scroll-prog');
  if (!bar) return;
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = Math.min(max <= 0 ? 0 : (window.scrollY / max) * 100, 100) + '%';
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
})();

// ── MOBILE NAV ──────────────────────────────────────────────────────
function empToggleNav() {
  const nav = document.getElementById('empMobileNav');
  const btn = document.getElementById('empHamburger');
  nav?.classList.toggle('open');
  btn?.classList.toggle('open');
}
document.addEventListener('click', e => {
  const nav = document.getElementById('empMobileNav');
  const btn = document.getElementById('empHamburger');
  if (nav?.classList.contains('open') && !nav.contains(e.target) && !btn?.contains(e.target)) {
    nav.classList.remove('open');
    btn?.classList.remove('open');
  }
});
document.querySelectorAll('#empMobileNav a').forEach(a => {
  a.addEventListener('click', () => {
    document.getElementById('empMobileNav')?.classList.remove('open');
    document.getElementById('empHamburger')?.classList.remove('open');
  });
});

// ── REVEAL ON SCROLL ────────────────────────────────────────────────
(() => {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
    return;
  }
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
})();

// ── DATA-ACC ACCORDION ──────────────────────────────────────────────
document.querySelectorAll('[data-acc]').forEach(item => {
  const head = item.querySelector('[data-acc-head]');
  if (!head) return;
  head.addEventListener('click', () => {
    if (item.hasAttribute('data-open')) item.removeAttribute('data-open');
    else item.setAttribute('data-open', '');
  });
});

// ── YEAR FILL ───────────────────────────────────────────────────────
document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());

// ── TOAST ────────────────────────────────────────────────────────────
function empToast(msg, type = 'success') {
  let c = document.getElementById('empToasts');
  if (!c) { c = document.createElement('div'); c.id = 'empToasts'; c.className = 'emp-toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = 'emp-toast ' + type;
  const icon = type === 'error' ? '✕' : type === 'info' ? 'ℹ' : '✓';
  t.innerHTML = `<span style="color:var(--${type==='error'?'error':'brand-green'});font-weight:700">${icon}</span><span>${esc(msg)}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.style.transition='opacity .25s,transform .25s'; t.style.opacity='0'; t.style.transform='translateX(20px)'; setTimeout(()=>t.remove(),300); }, 3200);
}

// ── ATS RING ANIMATION ──────────────────────────────────────────────
function empAnimateAts(el, target) {
  if (!el) return;
  const prog = el.querySelector('.emp-ats-prog');
  const num = el.querySelector('.emp-ats-num');
  const r = prog?.getAttribute('r') || 70;
  const C = 2 * Math.PI * r;
  if (prog) {
    prog.setAttribute('stroke-dasharray', C);
    prog.setAttribute('stroke-dashoffset', C);
    requestAnimationFrame(() => {
      prog.setAttribute('stroke-dashoffset', C * (1 - target / 100));
      prog.classList.remove('poor','fair','good','excellent');
      prog.classList.add(target < 50 ? 'poor' : target < 70 ? 'fair' : target < 85 ? 'good' : 'excellent');
    });
  }
  if (num) {
    const start = performance.now(), dur = 1200;
    const tick = t => {
      const p = Math.min((t - start) / dur, 1);
      num.innerHTML = Math.round(target * (1 - Math.pow(1 - p, 3))) + '<small>/100</small>';
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

// ── TYPEWRITER ──────────────────────────────────────────────────────
function empTypewriter(el, words, opts = {}) {
  if (!el || !words?.length) return;
  const speed = opts.speed ?? 70, pause = opts.pause ?? 1400, erase = opts.erase ?? 35;
  let w = 0, i = 0, dir = 1;
  const tick = () => {
    const word = words[w];
    el.textContent = word.slice(0, i);
    if (dir === 1) {
      if (i < word.length) { i++; setTimeout(tick, speed); }
      else { dir = -1; setTimeout(tick, pause); }
    } else {
      if (i > 0) { i--; setTimeout(tick, erase); }
      else { dir = 1; w = (w + 1) % words.length; setTimeout(tick, 200); }
    }
  };
  tick();
}

// ── COPY ────────────────────────────────────────────────────────────
function empCopy(text, msg = 'Copié !') {
  navigator.clipboard?.writeText(text).then(() => empToast(msg, 'success')).catch(() => empToast('Erreur de copie', 'error'));
}

// ── SCORE SNAPSHOT ──────────────────────────────────────────────────
window.saveScoreSnapshot = function(type, score, label) {
  if (typeof score !== 'number' || isNaN(score)) return;
  const KEY = 'emploia_scores_history';
  let history = [];
  try { history = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch {}
  history.push({ ts: Date.now(), type, score: Math.round(score), label: (label || '').slice(0, 60) });
  if (history.length > 50) history = history.slice(-50);
  try { localStorage.setItem(KEY, JSON.stringify(history)); } catch {}
};

// ── EVENT TRACKING ──────────────────────────────────────────────────
window.trackEvent = function(event, props) {
  if (window.plausible) plausible(event, props ? { props } : undefined);
  fetch('/api/track', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ event, props: props||{} }), keepalive:true }).catch(()=>{});
};

// ── PLAUSIBLE ───────────────────────────────────────────────────────
(() => {
  if (document.querySelector('script[data-domain="emploia.fr"]')) return;
  const s = document.createElement('script');
  s.defer = true; s.dataset.domain = 'emploia.fr';
  s.src = 'https://plausible.io/js/script.js';
  document.head.appendChild(s);
})();

// ── SERVICE WORKER ──────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// ── AUTH SYSTEM ─────────────────────────────────────────────────────
window.empUser = null;

const GOOGLE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`;

// Build and inject auth modal
(function empAuthSetup() {
  const modal = document.createElement('div');
  modal.id = 'empAuthModal';
  modal.className = 'emp-auth-overlay';
  modal.innerHTML = `
    <div class="emp-auth-box">
      <button class="emp-auth-close" onclick="empCloseAuth()" aria-label="Fermer">✕</button>
      <div id="empAuthMain">
        <div class="emp-auth-logo">E</div>
        <h2 class="emp-auth-title">Bienvenue sur Emploia</h2>
        <p class="emp-auth-subtitle">Votre copilote IA pour décrocher des entretiens</p>
        <button class="emp-social-btn" onclick="empGoogleLogin()">${GOOGLE_ICON} Continuer avec Google</button>
        <div class="emp-auth-divider">ou continuer avec un email</div>
        <div class="emp-auth-tabs">
          <button class="emp-auth-tab active" data-tab="login" onclick="empSwitchAuthTab('login')">Se connecter</button>
          <button class="emp-auth-tab" data-tab="register" onclick="empSwitchAuthTab('register')">S'inscrire</button>
        </div>
        <form id="empLoginForm" onsubmit="empSubmitLogin(event)">
          <div class="emp-auth-field"><label>Email</label><input type="email" id="empLoginEmail" placeholder="vous@email.fr" autocomplete="email" required/></div>
          <div class="emp-auth-field"><label>Mot de passe <span class="emp-auth-forgot" onclick="empShowForgot()">Mot de passe oublié ?</span></label><input type="password" id="empLoginPassword" placeholder="••••••••" autocomplete="current-password" required/></div>
          <div id="empLoginError" class="emp-auth-error" style="display:none"></div>
          <button type="submit" class="emp-auth-submit" id="empLoginBtn">Se connecter</button>
        </form>
        <form id="empRegisterForm" style="display:none" onsubmit="empSubmitRegister(event)">
          <div class="emp-auth-field"><label>Prénom et nom</label><input type="text" id="empRegisterName" placeholder="Marie Dupont" autocomplete="name" required/></div>
          <div class="emp-auth-field"><label>Email</label><input type="email" id="empRegisterEmail" placeholder="vous@email.fr" autocomplete="email" required/></div>
          <div class="emp-auth-field"><label>Mot de passe</label><input type="password" id="empRegisterPassword" placeholder="8 car. min, 1 majuscule, 1 chiffre" autocomplete="new-password" required oninput="empPwdStrength(this.value)"/><div class="emp-pwd-strength"><div class="emp-pwd-bar" id="empPwdBar"></div></div></div>
          <div id="empRegisterError" class="emp-auth-error" style="display:none"></div>
          <button type="submit" class="emp-auth-submit" id="empRegisterBtn">Créer mon compte gratuit</button>
        </form>
        <p class="emp-auth-legal">En continuant, vous acceptez nos <a href="/legal">CGU</a> et notre <a href="/legal">politique de confidentialité</a></p>
      </div>
      <div id="empAuthForgot" style="display:none">
        <button class="emp-auth-back" onclick="empShowMain()">← Retour</button>
        <div class="emp-auth-logo">🔑</div>
        <h2 class="emp-auth-title">Mot de passe oublié ?</h2>
        <p class="emp-auth-subtitle">Entrez votre email, on vous envoie un lien de réinitialisation.</p>
        <form id="empForgotForm" onsubmit="empSubmitForgot(event)">
          <div class="emp-auth-field"><label>Email</label><input type="email" id="empForgotEmail" placeholder="vous@email.fr" autocomplete="email" required/></div>
          <div id="empForgotError" class="emp-auth-error" style="display:none"></div>
          <button type="submit" class="emp-auth-submit" id="empForgotBtn">Envoyer le lien</button>
        </form>
      </div>
      <div id="empAuthSent" style="display:none;text-align:center">
        <div class="emp-auth-sent-icon">✉️</div>
        <h2 class="emp-auth-title">Email envoyé !</h2>
        <p class="emp-auth-subtitle">Vérifiez votre boîte mail et cliquez sur le lien.<br/><span style="font-size:12px;color:var(--steel)">Pensez à vérifier vos spams.</span></p>
        <button class="emp-auth-submit" style="margin-top:8px" onclick="empShowMain()">Retour à la connexion</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) empCloseAuth(); });

  // Nav auth area
  const navRight = document.querySelector('.emp-nav-right');
  if (navRight) {
    const authDiv = document.createElement('div');
    authDiv.className = 'emp-nav-auth';
    authDiv.id = 'empNavAuth';
    authDiv.innerHTML = `<button class="emp-login-btn" onclick="empShowAuth('login')">Se connecter</button><a href="/app" class="emp-btn emp-btn-primary emp-btn-sm">Commencer gratuit</a>`;
    navRight.prepend(authDiv);
  }

  empAuthInit();
})();

window.empShowAuth = function(tab) {
  empShowMain();
  empSwitchAuthTab(tab || 'login');
  document.getElementById('empAuthModal').classList.add('open');
  document.body.style.overflow = 'hidden';
};
window.empCloseAuth = function() {
  document.getElementById('empAuthModal')?.classList.remove('open');
  document.body.style.overflow = '';
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
  const e = document.getElementById('empLoginEmail')?.value;
  if (e) document.getElementById('empForgotEmail').value = e;
};
window.empSwitchAuthTab = function(tab) {
  document.querySelectorAll('.emp-auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('empLoginForm').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('empRegisterForm').style.display = tab === 'register' ? '' : 'none';
  document.getElementById('empLoginError').style.display = 'none';
  document.getElementById('empRegisterError').style.display = 'none';
};
window.empGoogleLogin = function() { window.location.href = '/api/auth/google'; };
window.empPwdStrength = function(pwd) {
  const bar = document.getElementById('empPwdBar');
  if (!bar) return;
  const score = [pwd.length >= 8, /[A-Z]/.test(pwd), /[0-9]/.test(pwd), pwd.length >= 12, /[^a-zA-Z0-9]/.test(pwd)].filter(Boolean).length;
  bar.style.width = (score * 20) + '%';
  bar.style.background = ['#ef4444','#f97316','#eab308','#22c55e','#16a34a'][score - 1] || '#ef4444';
};
window.empSubmitLogin = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('empLoginBtn'), errEl = document.getElementById('empLoginError');
  btn.disabled = true; btn.textContent = 'Connexion…'; errEl.style.display = 'none';
  try {
    const res = await fetch('/api/auth/login', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email:document.getElementById('empLoginEmail').value.trim(), password:document.getElementById('empLoginPassword').value }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur de connexion');
    if (window.plausible) plausible('login');
    empCloseAuth();
    window.empUser = data.user;
    empUpdateNav(data.user);
    empToast('Bienvenue ' + ((data.user.name || data.user.email || '').split(' ')[0] || 'vous') + ' !', 'success');
    window.dispatchEvent(new CustomEvent('empAuthChange', { detail:{ user:data.user } }));
  } catch (err) { errEl.textContent = err.message; errEl.style.display = 'block'; }
  finally { btn.disabled = false; btn.textContent = 'Se connecter'; }
};
window.empSubmitRegister = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('empRegisterBtn'), errEl = document.getElementById('empRegisterError');
  btn.disabled = true; btn.textContent = 'Création…'; errEl.style.display = 'none';
  try {
    const res = await fetch('/api/auth/register', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name:document.getElementById('empRegisterName').value.trim(), email:document.getElementById('empRegisterEmail').value.trim(), password:document.getElementById('empRegisterPassword').value, ref:sessionStorage.getItem('emploia_ref')||undefined }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur d'inscription");
    sessionStorage.removeItem('emploia_ref');
    if (window.plausible) plausible('signup');
    window.empUser = data.user;
    empUpdateNav(data.user);
    window.dispatchEvent(new CustomEvent('empAuthChange', { detail:{ user:data.user } }));
    window.location.href = '/onboarding';
  } catch (err) { errEl.textContent = err.message; errEl.style.display = 'block'; }
  finally { btn.disabled = false; btn.textContent = 'Créer mon compte gratuit'; }
};
window.empSubmitForgot = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('empForgotBtn'), errEl = document.getElementById('empForgotError');
  btn.disabled = true; btn.textContent = 'Envoi…'; errEl.style.display = 'none';
  try {
    const res = await fetch('/api/auth/forgot-password', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email:document.getElementById('empForgotEmail').value.trim() }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur');
    document.getElementById('empAuthForgot').style.display = 'none';
    document.getElementById('empAuthSent').style.display = '';
  } catch (err) { errEl.textContent = err.message; errEl.style.display = 'block'; }
  finally { btn.disabled = false; btn.textContent = 'Envoyer le lien'; }
};
window.empLogout = async function() {
  await fetch('/api/auth/logout', { method:'POST', credentials:'same-origin' });
  window.empUser = null;
  empUpdateNav(null);
  empToast('Déconnecté', 'info');
  window.dispatchEvent(new CustomEvent('empAuthChange', { detail:{ user:null } }));
  const authPaths = ['/dashboard','/profil','/app','/cv-builder','/interview','/alerts','/apply-queue','/onboarding'];
  if (authPaths.some(p => window.location.pathname.startsWith(p))) window.location.href = '/';
};
window.empUpdateNav = function(user) {
  const authDiv = document.getElementById('empNavAuth');
  if (!authDiv) return;
  if (!user) {
    authDiv.innerHTML = `<button class="emp-login-btn" onclick="empShowAuth('login')">Se connecter</button><a href="/app" class="emp-btn emp-btn-primary emp-btn-sm">Commencer gratuit</a>`;
    return;
  }
  const displayName = user.name || user.email?.split('@')[0] || 'Compte';
  const initials = esc(displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase());
  const avatarContent = user.avatar ? `<img src="${esc(user.avatar)}" alt="" referrerpolicy="no-referrer"/>` : initials;
  const planLabel = user.plan === 'pro' ? '⭐ Pro' : user.plan === 'intensif' ? '🚀 Intensif' : 'Gratuit';
  authDiv.innerHTML = `
    <div class="emp-user-menu" id="empUserMenu">
      <button class="emp-user-btn" onclick="empToggleUserMenu()">
        <div class="emp-user-avatar">${avatarContent}</div>
        <span class="emp-user-name">${esc(displayName.split(' ')[0])}</span>
        <span class="emp-user-chevron">▾</span>
      </button>
      <div class="emp-user-dropdown" id="empUserDropdown">
        <a href="/dashboard">📊 Dashboard</a>
        <a href="/profil">👤 Mon profil</a>
        <div class="emp-user-sep"></div>
        <div class="emp-user-plan">Plan : <strong>${planLabel}</strong></div>
        <div class="emp-user-sep"></div>
        ${!user.provider || user.provider === 'email' ? `<button onclick="empShowChangePwd()">🔑 Changer le mot de passe</button>` : ''}
        <div class="emp-user-sep"></div>
        <button class="emp-user-logout" onclick="empLogout()">Déconnexion</button>
      </div>
    </div>`;
  document.addEventListener('click', e => {
    const menu = document.getElementById('empUserMenu');
    if (menu && !menu.contains(e.target)) document.getElementById('empUserDropdown')?.classList.remove('open');
  });
};
window.empToggleUserMenu = function() { document.getElementById('empUserDropdown')?.classList.toggle('open'); };

// Upgrade modal
window.empShowUpgrade = function() {
  let m = document.getElementById('empUpgradeModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'empUpgradeModal';
    m.className = 'emp-auth-overlay';
    m.innerHTML = `<div class="emp-upgrade-box"><button class="emp-auth-close" onclick="document.getElementById('empUpgradeModal').classList.remove('open');document.body.style.overflow=''" aria-label="Fermer">✕</button><div style="font-size:36px;margin-bottom:8px">🚀</div><h2 style="font-size:20px;font-weight:600;margin:0 0 8px;color:var(--ink)">Limite gratuite atteinte</h2><p style="color:var(--slate);font-size:14px;line-height:1.6;margin:0 0 20px">Vous avez utilisé vos 5 générations gratuites. Passez Pro pour des générations illimitées.</p><a href="/#pricing" onclick="document.getElementById('empUpgradeModal').classList.remove('open');document.body.style.overflow=''" class="emp-btn emp-btn-primary w-full" style="justify-content:center;margin-bottom:10px">Voir les offres Pro →</a><button onclick="document.getElementById('empUpgradeModal').classList.remove('open');document.body.style.overflow=''" style="background:none;border:0;color:var(--steel);font-size:13px;cursor:pointer;margin-top:4px">Plus tard</button></div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) { m.classList.remove('open'); document.body.style.overflow = ''; } });
  }
  m.classList.add('open');
  document.body.style.overflow = 'hidden';
};

// Change password modal
(function() {
  const modal = document.createElement('div');
  modal.id = 'empChangePwdModal';
  modal.className = 'emp-auth-overlay';
  modal.innerHTML = `<div class="emp-auth-box"><button class="emp-auth-close" onclick="document.getElementById('empChangePwdModal').classList.remove('open');document.body.style.overflow=''" aria-label="Fermer">✕</button><div class="emp-auth-logo">🔑</div><h2 class="emp-auth-title">Changer le mot de passe</h2><p class="emp-auth-subtitle">Entrez votre mot de passe actuel puis choisissez un nouveau.</p><form id="empChangePwdForm" onsubmit="empSubmitChangePwd(event)"><div class="emp-auth-field"><label>Mot de passe actuel</label><input type="password" id="empCurPwd" placeholder="••••••••" autocomplete="current-password" required/></div><div class="emp-auth-field"><label>Nouveau mot de passe</label><input type="password" id="empNewPwd" placeholder="8 car. min, 1 majuscule, 1 chiffre" autocomplete="new-password" required oninput="empPwdStrength(this.value)"/><div class="emp-pwd-strength"><div class="emp-pwd-bar" id="empPwdBar2"></div></div></div><div class="emp-auth-field"><label>Confirmer le nouveau mot de passe</label><input type="password" id="empConfirmPwd" placeholder="••••••••" autocomplete="new-password" required/></div><div id="empChangePwdError" class="emp-auth-error" style="display:none"></div><div id="empChangePwdSuccess" class="emp-auth-success" style="display:none">Mot de passe modifié avec succès ✓</div><button type="submit" class="emp-auth-submit" id="empChangePwdBtn">Modifier le mot de passe</button></form></div>`;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(modal));
  modal.addEventListener('click', e => { if (e.target === modal) { modal.classList.remove('open'); document.body.style.overflow = ''; } });
})();

window.empShowChangePwd = function() {
  document.getElementById('empChangePwdError').style.display = 'none';
  document.getElementById('empChangePwdSuccess').style.display = 'none';
  document.getElementById('empChangePwdForm').reset();
  document.getElementById('empUserDropdown')?.classList.remove('open');
  document.getElementById('empChangePwdModal').classList.add('open');
  document.body.style.overflow = 'hidden';
};
window.empSubmitChangePwd = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('empChangePwdBtn'), errEl = document.getElementById('empChangePwdError'), okEl = document.getElementById('empChangePwdSuccess');
  errEl.style.display = 'none'; okEl.style.display = 'none';
  const newPwd = document.getElementById('empNewPwd').value, confirm = document.getElementById('empConfirmPwd').value;
  if (newPwd !== confirm) { errEl.textContent = 'Les deux mots de passe ne correspondent pas.'; errEl.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Modification…';
  try {
    const res = await fetch('/api/auth/change-password', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ currentPassword:document.getElementById('empCurPwd').value, newPassword:newPwd }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur');
    okEl.style.display = 'block';
    document.getElementById('empChangePwdForm').reset();
    setTimeout(() => { document.getElementById('empChangePwdModal').classList.remove('open'); document.body.style.overflow = ''; }, 1800);
  } catch (err) { errEl.textContent = err.message; errEl.style.display = 'block'; }
  finally { btn.disabled = false; btn.textContent = 'Modifier le mot de passe'; }
};

async function empAuthInit() {
  const urlParams = new URLSearchParams(window.location.search);
  const oauthError = urlParams.get('error');
  if (oauthError) {
    const msgs = { google_not_configured:'Connexion Google non configurée', google_denied:'Connexion Google annulée', oauth_invalid:'Session expirée, veuillez réessayer', oauth_failed:'Erreur lors de la connexion Google' };
    setTimeout(() => empToast(msgs[oauthError] || 'Erreur de connexion', 'error'), 300);
    urlParams.delete('error');
    const q = urlParams.toString();
    history.replaceState(null, '', window.location.pathname + (q ? '?' + q : ''));
  }
  try {
    const res = await fetch('/api/auth/me', { credentials:'same-origin' });
    if (res.ok) {
      const data = await res.json();
      window.empUser = data.user;
      empUpdateNav(data.user);
      window.dispatchEvent(new CustomEvent('empUserLoaded', { detail:data.user }));
      const mobileNav = document.getElementById('empMobileNav');
      if (mobileNav) {
        const link = document.createElement('a');
        link.textContent = '👤 Mon compte'; link.href = '/profil';
        mobileNav.prepend(link);
      }
    } else {
      const mobileNav = document.getElementById('empMobileNav');
      if (mobileNav) {
        const link = document.createElement('a');
        link.textContent = '🔑 Se connecter'; link.href = '#';
        link.onclick = e => { e.preventDefault(); empShowAuth('login'); };
        mobileNav.prepend(link);
      }
    }
  } catch {}
}
