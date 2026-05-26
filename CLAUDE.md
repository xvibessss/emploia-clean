# Emploia — CLAUDE.md

- **Repo**: xvibessss/emploia-clean (public, GitHub)
- **Deploy**: Vercel, project `emploia-clean`, team `xvibessss-projects`
- **Local dir**: `/Users/chapellehugo/emploia-clean`
- **Prod URL**: emploia.fr + emploia-clean.vercel.app
- **Node**: 24.x on Vercel
- **AI models**: Free → `claude-haiku-4-5-20251001` / Pro+Intensif → `claude-sonnet-4-6`

---

## Current Task (Session 24 — 2026-05-25)

**Design migration: old dark theme (Sora font) → new Notion-style light theme (Inter font)**

All pages migrated from old dark CSS design system to new `shared.css` (Notion-style light, purple accent `#6E48BE`).

---

## What's Done

### Design system (shared.css + shared.js)
- New `shared.css`: Notion-style light design, Inter font, CSS variables (`--primary`, `--ink`, `--surface`, `--hairline`, etc.)
- New `shared.js`: nav injection, auth modal, toast system — all shared components
- Compat aliases at end of `shared.css` map old dark vars (`--bg3`, `--s2`, `--brd`, `--t1`, etc.) to new light equivalents

### Pages migrated
- `index.html` ✅
- `app.html` ✅
- `jobs.html` ✅
- `dashboard.html` ✅
- `cv-builder.html` ✅
- `profil.html` ✅
- `interview.html` ✅
- `alerts.html` ✅
- `apply-queue.html` ✅
- `tools.html` ✅
- `offre.html` ✅
- `onboarding.html` ✅
- `recherche.html` ✅
- `about.html` ✅ (+ new footer)
- `contact.html` ✅ (+ new footer)
- `legal.html` ✅
- `referral.html` ✅ (+ new footer)
- `404.html` ✅
- `reset-password.html` ✅
- `nps.html` ✅
- `score.html` ✅
- `blog.html` ✅ (+ new footer)
- `employeurs.html` ✅ (+ new footer)

### Backend / Security (committed, tag: `0122d85`)
- Full security audit (CAC40-level): timing-safe login, PBKDF2 upgrade, idempotent Stripe webhooks, atomic free-gen claim, cryptographic referral codes, admin rate limiting, CSP hardened
- Model tiering: Free → Haiku, Pro/Intensif → Sonnet on all generate endpoints
- Trial drip emails (J3/J5/J7/J14/J30), NPS system, share-score page, admin stats endpoint, event tracking

### Blog
- `blog/augmentation-salaire.html` — new article (not yet committed)

---

## What's Next

1. **Commit** all design migration changes (1 grouped commit)
2. **Commit** new blog article `blog/augmentation-salaire.html` + wire into blog.html ARTICLES array, sitemap.js, rss.js, vercel.json rewrite
3. **DNS** (blocking for emploia.fr): update 5 records on ionos.fr → Vercel
4. **Env vars** to add on Vercel: `CRON_SECRET`, `HEALTH_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `ADMIN_EMAIL`, `ADMIN_SECRET`
5. **Stripe**: switch from test → live mode
6. **Resend**: verify emploia.fr domain after DNS

---

## Known Issues / Decisions

### Design migration
- **JS template literals NOT modified** — pages have old CSS vars inside JS-generated HTML strings. Left as-is intentionally.
- **Compat alias layer** in `shared.css` (end of file): maps `--bg3 → --surface`, `--s2 → --surface`, `--brd → --hairline`, `--t1 → --ink`, `--grad-primary → linear-gradient(...)`, etc.
- **Bottom nav removed** from all app pages (`emp-bottom-nav` not in new shared.css).
- **Font**: Sora removed → Inter via `@import` in shared.css.
- **Old button classes** updated in HTML bodies (not in script blocks).

### Architecture decisions
- `claimFreeGeneration()` pre-increment atomic pattern in `_lib/auth.js` — prevents race condition on 5-gen free limit
- `getCurrentUser()` rejects tokens issued before `passwordChangedAt` — session invalidation on password change
- Stripe webhook idempotence via `kvSetNX('webhook:{event.id}')` TTL 24h
- All crons secured with `CRON_SECRET` header check

### DNS records for emploia.fr (add on ionos.fr)
| Type | Host | Value |
|------|------|-------|
| A | @ | 76.76.21.21 |
| CNAME | www | cname.vercel-dns.com |
| TXT | resend._domainkey | p=MIGfMA0GCSq... |
| MX | send | feedback-smtp.us-east-1.amazonses.com (priority 10) |
| TXT | send | v=spf1 include:amazonses.com ~all |

---

## Env Vars Status

| Var | Status |
|-----|--------|
| `ANTHROPIC_API_KEY` | ✅ Vercel |
| `JWT_SECRET` | ✅ Vercel (64-char hex) |
| `RAPIDAPI_KEY` | ✅ Vercel |
| `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` | ✅ Vercel |
| `NEXT_PUBLIC_URL` | ✅ https://emploia.fr |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` + others | ✅ Vercel |
| `STRIPE_SECRET_KEY` | ✅ test mode |
| `STRIPE_PRICE_*` (4 prices) | ✅ Vercel |
| `STRIPE_WEBHOOK_SECRET` | ✅ Vercel |
| `RESEND_API_KEY` | ✅ Vercel |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | ❌ Not configured |
| `FRANCE_TRAVAIL_CLIENT_ID` + `FRANCE_TRAVAIL_CLIENT_SECRET` | ❌ Not configured |
| `CRON_SECRET` | ❌ Missing |
| `HEALTH_SECRET` | ❌ Missing |
| `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` | ❌ Missing |
| `ADMIN_SECRET` | ❌ Missing |
| `ADMIN_EMAIL` | ❌ Missing (fallback: contact@emploia.fr) |
