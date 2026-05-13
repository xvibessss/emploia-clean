/* ───────────────────────────────────────────
   EMPLOIA — Service Worker
   Handles: push notifications, offline cache
─────────────────────────────────────────── */

const CACHE_STATIC  = 'emploia-static-v3';
const CACHE_PAGES   = 'emploia-pages-v3';
const STATIC_ASSETS = ['/shared.css', '/shared.js'];

// ── INSTALL ──────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_STATIC).then(c => c.addAll(STATIC_ASSETS).catch(() => {}))
  );
});

// ── ACTIVATE ─────────────────────────────────────
self.addEventListener('activate', e => {
  const keep = [CACHE_STATIC, CACHE_PAGES];
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k))))
      .then(() => clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;

  // Never intercept API calls, auth flows, or third-party fonts
  if (
    url.includes('/api/') ||
    url.includes('fonts.googleapis') ||
    url.includes('fonts.gstatic') ||
    url.includes('stripe.com') ||
    url.includes('resend.com')
  ) return;

  const isStatic = url.endsWith('.css') || url.endsWith('.js') || url.endsWith('.svg') || url.endsWith('.png') || url.endsWith('.jpg') || url.endsWith('.webp') || url.endsWith('.ico');
  const isPage   = url.endsWith('.html') || /\/(dashboard|app|jobs|interview|profil|cv-builder|alerts|blog|recherche|onboarding|referral)\/?$/.test(url);

  if (isStatic) {
    // Cache-first for static assets — they're versioned via CACHE_STATIC bump
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_STATIC).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => cached || new Response('', { status: 503 }));
      })
    );
    return;
  }

  if (isPage) {
    // Network-first for HTML pages (always fresh), fall back to cache if offline
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_PAGES).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
});

// ── PUSH NOTIFICATIONS ────────────────────────────
self.addEventListener('push', e => {
  let payload = { title: '🔔 Emploia', body: 'De nouvelles offres correspondent à vos alertes.' };
  try { if (e.data) payload = { ...payload, ...e.data.json() }; } catch {}

  e.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon192.png',
      badge: '/icons/icon72.png',
      vibrate: [100, 50, 100],
      tag: payload.tag || 'emploia-alert',
      data: { url: payload.url || '/alerts' },
      actions: [
        { action: 'open',  title: 'Voir les offres' },
        { action: 'close', title: 'Ignorer' },
      ],
    })
  );
});

// ── NOTIFICATION CLICK ────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'close') return;
  const target = e.notification.data?.url || '/alerts';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing && 'focus' in existing) {
        existing.navigate(target);
        return existing.focus();
      }
      return clients.openWindow(target);
    })
  );
});
