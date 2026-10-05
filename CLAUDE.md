# Emploia — CLAUDE.md

## Project

- **Repo**: xvibessss/emploia-clean (public, GitHub)
- **Local dir**: `/Users/chapellehugo/emploia-clean`
- **Deploy**: Vercel, project `emploia-clean`, team `xvibessss-projects`
- **Prod URL**: emploia.eu (+ www, redirigé) + emploia-clean.vercel.app
- **Node**: 24.x on Vercel
- **Stack**: HTML/CSS/JS vanilla + Vercel Edge Functions + Upstash KV + Claude API
- **AI models**: Free → `claude-haiku-4-5-20251001` / Pro+Intensif → `claude-sonnet-4-6`

---

## How to work on this project

**Autonomy**: Work to full completion without stopping for confirmation. Ship all related changes in one pass. Only pause if a destructive irreversible action (delete prod data, reset --hard, drop KV keys) is required.

**Commits**: Group all related fixes into 1–2 dense commits. Never one commit per file or per fix. Use format: `feat:` / `fix:` / `chore:`.

**Deploy**: After committing, always `git push && vercel --prod --yes`. Don't wait to be asked.

**Session start**: Read `SESSION_STATE.md` (if it exists) to see the git state from last session — uncommitted files, last commits, branch.

**Context at 80%**: Run `/compact` proactively before running out of context.

---

## Human-only blockers — Claude cannot do these

These require manual action by Hugo. Do NOT clear these items unless Hugo explicitly confirms completion.

| Task | Status | Details |
|------|--------|---------|
| **Vercel production branch → `main`** | **FAIT — vérifié 2026-10-01** | La production sert `main` au bit près : md5 de `/` servi par `emploia-clean.vercel.app` = `9832a8b36ffd065dde8dd4e114dc3239` = `git show origin/main:index.html \| md5`. `/`, `/tools`, `/agents`, `/chat`, `/admin`, `/ecoles` répondent tous 200. `master` reste à archiver. |
| ~~DNS ionos.fr~~ → **domaine `emploia.eu`** | **FAIT — vérifié 2026-10-05** | `emploia.fr` n'a jamais appartenu à Hugo (enregistré chez IONOS le 2025-01-30 par un tiers) : il a été **abandonné, pas réparé**, et retiré du projet Vercel. Le domaine du projet est `emploia.eu`, enregistré chez Spaceship, A `@` → `76.76.21.21`, apex et `www` attachés et `verified: true` côté Vercel. `/`, `/tools`, `/ecoles`, `/legal`, `/sitemap.xml`, `/app`, `/dashboard` répondent 200 ; `NEXT_PUBLIC_URL` est sur `https://emploia.eu` (le sitemap servi publie 169 URLs sur ce host). **Ne pas suivre une instruction DNS IONOS** : elle viserait le domaine d'un tiers. |
| **Stripe — chaîne de livraison cassée** | **PENDING — urgent, encaissement ouvert** | `STRIPE_SECRET_KEY` est **déjà live** (la prod émet des `cs_live_…`), donc la vente est ouverte. Mais l'endpoint webhook live `we_1ULdeoE4KLTGNaJXYklyPY91` pointe encore sur `https://emploia.fr/api/stripe-webhook` — un domaine qui n'est pas celui du projet : **toute livraison échoue et la fenêtre de retry se referme en ~3 jours**. Vérifié par lecture de l'API le 2026-10-05. Reposer l'URL sur `https://emploia-clean.vercel.app/api/stripe-webhook` — pas sur `emploia.eu`, bien que les deux soient atteignables (testés le 2026-10-05 : 400 « signature invalide » sur les deux). Le webhook est un endpoint serveur, invisible du client ; le garder sur l'hôte Vercel le découple des bascules de domaine. Seul `checkout.session.completed` est coché alors que le handler traite 5 événements : ajouter `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`, sans quoi les renouvellements Pro ne prolongent pas l'accès et les résiliations ne le révoquent pas. |
| ~~Attribution créateurs inopérante~~ | **CORRIGÉ EN CODE — reste à créer les codes live** | Le checkout résout désormais le code côté serveur (`resolvePromotionCode`, insensible à la casse) et pose `discounts[0][promotion_code]` **et** `metadata[affiliate]`, donc le webhook attribue. Couvert par `probe-checkout.mjs` et `probe-affiliate.mjs`. Ce qui reste est une action Stripe : créer les codes promo en MAJUSCULES sur le coupon `tydPqNqe`, **sans** « first transaction only ». |
| Resend domain verify | **PENDING** | resend.com/domains → vérifier **emploia.eu** (SPF sur le sous-domaine `send`). Le DNS est en place, plus rien ne bloque. |
| Google OAuth | **PENDING** | GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET on console.cloud.google.com → Vercel |
| Crisp chat | **PENDING** | Replace 'VOTRE_CRISP_ID' in shared.js with real Website ID |
| Env vars for admin / growth console | **PENDING** | `ADMIN_SECRET`, `RESEND_WEBHOOK_SECRET`, `GSC_CLIENT_EMAIL`, `GSC_PRIVATE_KEY`, `GSC_SITE_URL` — referenced by code on `main`, absent from the configured list below |

---

## Current state — reconciled 2026-10-01

Latest commit: `8bf0a7d` (Merge pull request #34, 2026-10-01). Branch `main`,
default branch on GitHub, up to date with `origin/main`. 34 PR merged.

### `main` is in production — the remaining gap is the domain

**The Vercel project's production branch was repointed from `master` to `main`**
and verified on 2026-10-01: the index served by `emploia-clean.vercel.app` has
the exact md5 of `origin/main:index.html`
(`9832a8b36ffd065dde8dd4e114dc3239`), and `/`, `/tools`, `/agents`, `/chat`,
`/admin`, `/ecoles` all return 200. A merge on `main` now promotes.

History, kept because it explains the shape of the repo: `main` was in
production until ~2026-06-06 (`f2a3dae`), then two deployments from `master`
(`ad764cf`) around 2026-09-08 rolled production back to 2026-05-09, and every
merge on `main` between then and the repoint produced only an unpromoted
preview. `main` and `master` have **disjoint histories** (no common ancestor —
`git merge-base` exits 1). **Do not try to merge them**; `master` is to be
archived, not merged.

The custom domain is live since 2026-10-05, but it is **not** the one this file
used to name. `emploia.fr` never belonged to Hugo — registered at IONOS on
2025-01-30 by a third party, fourteen months before this project — so it was
abandoned rather than recovered, and removed from the Vercel project. The
project's domain is **`emploia.eu`** (registrar Spaceship, A `@` →
`76.76.21.21`, apex and `www` both attached and verified). `NEXT_PUBLIC_URL` is
set to `https://emploia.eu`, and `scripts/smoke/prod.mjs` reports 29/29 against
it.

One thing keyed on the old domain is still broken: the **Stripe live webhook**
still posts to `emploia.fr`, so a real payment is taken and never fulfilled.
That is a live Stripe write, which `AGENTS.md` reserves to Hugo — see the
human-only blockers table.

### Features merged on `main` — live in production since 2026-10-01

PR #7 → #26, merged between 2026-09-04 and 2026-09-29:

- **Security** — `passwordChangedAt` invalidates JWTs issued before a password
  reset; Google OAuth rejects unverified emails; credentialed CORS narrowed to
  `emploia-clean[a-z0-9-]*.vercel.app`
- **Billing** — pricing cards wired to `/api/stripe-checkout` (Pro/Intensif,
  monthly & annual); paywall 2.0 modal with monthly/annual toggle
- **Free credits** — `refundGeneration()` on every error path of the 7
  `api/generate/*` endpoints: a failed AI call no longer burns a credit
- **Referral** — real reward via internal `proUntil` grant (+30d per referee for
  the referrer, capped at 6; +14d for the referee); `?ref=` captured site-wide
- **Follow-ups** — `lastFollowUpAt`, "Relance envoyée" button, 7d mute, "Relancé
  il y a Xj" badge
- **SEO** — `JobPosting` → `CollectionPage` on 30 pages; 25 new `/emploi/<city>`
  and 20 `/metier/<job>` pages; unique content (local employers, salaries, FAQ +
  JSON-LD FAQPage) on all 48 city pages
- **Analytics** — `paywall_viewed` / `checkout_started` events, daily buckets
  `track:{event}:{date}` TTL 120d, full funnel + 14d series in
  `api/admin/stats.js`
- **Admin / growth console** — `admin.html` behind `ADMIN_SECRET`;
  `api/resend-webhook.js` (Svix signature, open/click rates);
  `api/seo-metrics.js` (Google Search Console via service-account JWT)
- **Anti-hallucination** — `cv.js` / `cover-letter.js` / `linkedin-summary.js`
  prompts forbid inventing employer/degree/figures (`[à compléter]` marker);
  `temperature: 0` on `ats-score.js` and `match-score.js`; `scripts/bench/*`
  fabrication detector wired into CI; review-mode panel in `app.html`
  (**not** in `tools.html` — incomplete UI coverage)
- **Employer offer lifecycle** — `api/_lib/employer.js` (45-day expiry, opaque
  manage token), `api/employer/manage-job.js` (token self-service close/renew
  without an account), `jobs.js` filters via `isJobLive()`

Earlier work still on `main`: ATS score tab, 12 AI agents at `/agents`, 70 blog
articles, Orion chat at `/chat`, CV Vault, dashboard widgets, trial drip emails,
NPS, push notifications.

### Tests — real commands, all green on `8bf0a7d` (2026-10-01)

`npm run check`, `npm test`, `npm run smoke`, `check.sh`, `smoke-test.mjs`,
`npm run dev` and `dev-server.mjs` **do not exist** — not here, not on `main`,
not on `master`. Ignore any doc that mentions them. The real ones:

```bash
node scripts/ci-guards.mjs             # 220 rewrites OK, 77 api/ handlers OK, security invariants OK
npm run bench                          # prompt guard + detector self-test OK
npm run test:employer                  # 7 tests OK
npm run test:billing                   # Stripe probes, offline stubs — run it on any payment change
find api -name '*.js' -exec node --check {} \;
```

`package.json` declares `bench`, `bench:live`, `test:employer`, `test:billing`
and `smoke:prod`. CI (`.github/workflows/ci.yml`) runs gitleaks, `node --check`
on `api/`, htmlhint, then ci-guards, bench and test:employer. CI is green on
`main`. Lighthouse Audit and Link Check audit `emploia-clean.vercel.app`
(`.github/workflows/lighthouse.yml`, `link-check.yml`), which since the
production-branch repoint serves `main` — so the old explanation for their
repeated failures ("they test pages absent from the branch under test") no
longer applies, and any remaining red there is a real finding to read rather
than a known artefact.

### Env vars

Configured on Vercel: `ANTHROPIC_API_KEY`, `JWT_SECRET`, `RAPIDAPI_KEY`,
`ADZUNA_*`, `NEXT_PUBLIC_URL`, `KV_*`, `STRIPE_*`, `RESEND_API_KEY`,
`CRON_SECRET`, `HEALTH_SECRET`, `VAPID_*`, `ADMIN_SECRET`, `ADMIN_EMAIL`.

Required by code on `main`, **status unverified** — `main` is already in
production, so an absence here is a live failure rather than a future risk:
`RESEND_WEBHOOK_SECRET`, `GSC_CLIENT_EMAIL`, `GSC_PRIVATE_KEY`, `GSC_SITE_URL`,
`STRIPE_PRICE_PRO_ANNUAL`, `STRIPE_PRICE_INTENSIF_ANNUAL`.

### Deploy rule — overrides "How to work" above

The production-branch decision is made: `main` is the production branch, so a
merge on `main` promotes by itself. The `git push && vercel --prod --yes`
instruction earlier in this file still does **not** apply to unattended runs —
per `AGENTS.md`, any production deployment needs Hugo's explicit go. Pushing and
opening a PR are free; promoting is his call.

---

## Architecture decisions (do not change without discussion)

- `claimFreeGeneration()` — pre-increment atomic, prevents race condition on 5 free generations
- `getCurrentUser()` — rejects tokens issued before `passwordChangedAt` (session invalidation on pwd change)
- Stripe webhook — idempotent via `kvSetNX('webhook:{event.id}')` TTL 24h
- Crons — secured by `Authorization: Bearer CRON_SECRET` header
- JS template literals in HTML pages — old CSS vars in script blocks intentionally not modified (compat alias layer in shared.css handles them)
- Agents — all in `api/agent/*.js`, Edge Runtime, rate limit 5/h (free) / 20/h (Pro), Haiku/Sonnet tiering

---

## Design system

- `shared.css` + `shared.js` — all nav, auth modal, toasts, shared components
- Primary color: `--primary: #6E48BE` (violet)
- Variables: `--canvas:#FAFAFA`, `--surface:#FFFFFF`, `--ink:#0F172A`, `--slate:#64748B`, `--hairline:rgba(0,0,0,.06)`
- Font: Inter (via @import in shared.css)
- Compat aliases at end of shared.css: `--bg → --canvas`, `--s2 → --surface`, `--brd → --hairline`, `--t1 → --ink`

---

## KV keys (Upstash)
`user:{email}`, `userid:{id}`, `profile:{email}`, `apps:{email}`, `saved:{email}`, `alerts:{email}`, `gen:{email}`, `rl:{endpoint}:{identifier}`, `stripe:{customerId}`, `ref:{code}`, `cvversions:{email}`, `trial_j3/j5/j7/j14/j30:{email}`, `nps:scores`, `track:{event}`, `all_users`, `push:{email}`, `feedback:entry:{email}:{ts}`
