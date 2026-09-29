# Emploia — CLAUDE.md

## Project

- **Repo**: xvibessss/emploia-clean (public, GitHub)
- **Local dir**: `/Users/chapellehugo/emploia-clean`
- **Deploy**: Vercel, project `emploia-clean`, team `xvibessss-projects`
- **Prod URL**: emploia.fr + emploia-clean.vercel.app
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
| **Vercel production branch → `main`** | **PENDING — blocks all shipping** | The project's production branch is set to `master`. Since September every merge on `main` only produces a **preview, never promoted** — PR #26 included. Fix the setting; do NOT merge the branches (histories are disjoint). Check the env vars `main` needs and `master` ignored first: `ADMIN_SECRET`, `RESEND_WEBHOOK_SECRET`, `GSC_CLIENT_EMAIL`, `GSC_PRIVATE_KEY`, `GSC_SITE_URL`, `STRIPE_PRICE_PRO_ANNUAL`, `STRIPE_PRICE_INTENSIF_ANNUAL`. Then archive `master`. |
| DNS ionos.fr | **PENDING** — verified 2026-09-29: `emploia.fr` resolves to `217.160.0.93`, the IONOS parking page (HTTP 200, HTTPS fails the TLS handshake). `www.emploia.fr` has no record at all. NS are at IONOS (`ui-dns.*`), so the zone is editable from Hugo's IONOS account. | **Modify** existing A @ `217.160.0.93` → `76.76.21.21` (record exists, don't create it) / **create** CNAME www → cname.vercel-dns.com / TXT resend._domainkey / MX send → feedback-smtp.us-east-1.amazonses.com |
| Stripe live mode | **PENDING** | Change STRIPE_SECRET_KEY (sk_test_ → sk_live_) + STRIPE_WEBHOOK_SECRET on Vercel dashboard |
| Resend domain verify | **PENDING** | After DNS: resend.com/domains → verify emploia.fr |
| Google OAuth | **PENDING** | GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET on console.cloud.google.com → Vercel |
| Crisp chat | **PENDING** | Replace 'VOTRE_CRISP_ID' in shared.js with real Website ID |
| Env vars for admin / growth console | **PENDING** | `ADMIN_SECRET`, `RESEND_WEBHOOK_SECRET`, `GSC_CLIENT_EMAIL`, `GSC_PRIVATE_KEY`, `GSC_SITE_URL` — referenced by code on `main`, absent from the configured list below |

---

## Current state — reconciled 2026-09-29

Latest commit: `ace6533` (Merge pull request #26, 2026-09-29). Branch `main`,
default branch on GitHub, up to date with `origin/main`. 26 PR merged.

### ⚠️ Nothing recent is actually in production

**The Vercel project's production branch is set to `master`, not `main`.**

- `main` *was* in production until ~2026-06-06 (commit `f2a3dae`).
- Two production deployments were then made from `master` (`ad764cf`) around
  2026-09-08, which rolled production back to the state of 2026-05-09.
- Since then **every merge on `main` only produces a preview deployment, never
  promoted** — including PR #26, merged today.

Verified 2026-09-29: the index served by `emploia-clean.vercel.app` has the
exact md5 of `origin/master:index.html`; `/agents`, `/chat`, `/tools`, `/admin`
all return 404. `emploia.fr` resolves to `217.160.0.93` — the IONOS parking page
(HTTP 200, TLS handshake fails on HTTPS), so the domain serves nothing of ours;
`www.emploia.fr` has no record at all. The only reachable production is
`emploia-clean.vercel.app`, SSO-protected outside the custom domain.

`main` and `master` have **disjoint histories** (no common ancestor —
`git merge-base` exits 1). **Do not try to merge them.** The root cause is a
production-branch setting, not a history divergence. The fix: point the
production branch at `main` after checking the env vars `main` requires and
`master` ignored, then archive `master`. See the human-only blockers table.

### Features merged on `main` — NOT live in production

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

### Tests — real commands, all green on `ace6533` (2026-09-29)

`npm run check`, `npm test`, `npm run smoke`, `check.sh`, `smoke-test.mjs`,
`npm run dev` and `dev-server.mjs` **do not exist** — not here, not on `main`,
not on `master`. Ignore any doc that mentions them. The real ones:

```bash
node scripts/ci-guards.mjs             # 219 rewrites OK, 76 api/ handlers OK, security invariants OK
node scripts/bench/run.mjs             # prompt guard + detector self-test OK
node scripts/employer/expiry.test.mjs  # 7 tests OK
find api -name '*.js' -exec node --check {} \;
```

`package.json` declares only `bench`, `bench:live`, `test:employer`. CI
(`.github/workflows/ci.yml`) runs gitleaks, `node --check` on `api/`, htmlhint,
then the three scripts above. CI is green on `main`; **Lighthouse Audit and Link
Check fail repeatedly** — they audit `emploia-clean.vercel.app`, which serves
`master`, so they test pages absent from the branch under test.

### Env vars

Configured on Vercel: `ANTHROPIC_API_KEY`, `JWT_SECRET`, `RAPIDAPI_KEY`,
`ADZUNA_*`, `NEXT_PUBLIC_URL`, `KV_*`, `STRIPE_*`, `RESEND_API_KEY`,
`CRON_SECRET`, `HEALTH_SECRET`, `VAPID_*`, `ADMIN_SECRET`, `ADMIN_EMAIL`.

Required by code on `main`, **status unverified** — check before promoting
`main`: `RESEND_WEBHOOK_SECRET`, `GSC_CLIENT_EMAIL`, `GSC_PRIVATE_KEY`,
`GSC_SITE_URL`, `STRIPE_PRICE_PRO_ANNUAL`, `STRIPE_PRICE_INTENSIF_ANNUAL`.

### Deploy rule — overrides "How to work" above

The `git push && vercel --prod --yes` instruction in this file is **suspended**
until the production-branch decision is made. Pushing is fine; promoting is not.

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
