/* ═══════════════════════════════════════════════════
   EMPLOIA — Shared JavaScript utilities
═══════════════════════════════════════════════════ */

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
  toast.innerHTML = `
    <span style="color:${colors[type]};font-size:16px;flex-shrink:0">${icons[type]}</span>
    <span style="flex:1;line-height:1.4">${msg}</span>
    <span onclick="this.closest('.emp-toast').remove()" style="cursor:pointer;color:var(--t3);font-size:13px">✕</span>
  `;
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

// ── PAGE TRANSITION ───────────────────────────────────
document.querySelectorAll('a[href]').forEach(a => {
  const href = a.getAttribute('href');
  if (href && !href.startsWith('#') && !href.startsWith('http') && !href.startsWith('mailto')) {
    a.addEventListener('click', e => {
      // Let browser handle normally for now
    });
  }
});
