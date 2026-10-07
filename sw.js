/* ───────────────────────────────────────────
   EMPLOIA — Service Worker
   Handles: push notifications, offline cache
─────────────────────────────────────────── */

// Empreintes des feuilles partagées. Stampées par scripts/assets/version.mjs
// à partir du contenu des fichiers : ne pas éditer à la main, ci-guards
// vérifie qu'elles sont à jour.
const ASSETS = { '/shared.css': 'e5499748', '/shared.js': 'bd13709d' };

// Le nom du cache statique dérive des empreintes. Une feuille qui change
// renomme donc le cache, et l'éviction à l'activation (plus bas) jette
// l'ancien sans que personne ait à y penser. C'est ce « penser à bumper v3 »
// que personne ne faisait, et qui laissait traîner d'anciennes feuilles.
const CACHE_STATIC  = `emploia-static-${Object.values(ASSETS).join('-')}`;
const CACHE_PAGES   = 'emploia-pages-v3';
const STATIC_ASSETS = Object.entries(ASSETS).map(([p, v]) => `${p}?v=${v}`);

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

  // Le classement se fait sur le chemin, jamais sur l'URL entière : depuis que
  // les feuilles partagées portent `?v=<empreinte>`, leur URL ne se termine
  // plus par .css ni .js, et les tester en l'état reviendrait à ne plus rien
  // reconnaître — donc à perdre le mode hors ligne sans que ça se voie.
  let pathname;
  try { pathname = new URL(url).pathname; } catch { return; }

  const isStatic = ['.css', '.js', '.svg', '.png', '.jpg', '.webp', '.ico'].some(ext => pathname.endsWith(ext));
  const isPage   = pathname.endsWith('.html') || /\/(dashboard|app|jobs|interview|profil|cv-builder|alerts|blog|recherche|onboarding|referral)\/?$/.test(pathname);

  if (isStatic) {
    // Cache-first : sûr maintenant que l'URL porte l'empreinte du contenu.
    // Une feuille modifiée arrive sous une URL jamais vue, donc en échec de
    // cache, donc par le réseau.
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
