# Stage 8 — Promote + smoke de production

## Promotion effective
- PR #65 `feat/jsonld-pages-manquantes` → `main`
- Merge commit `8d2e410`, mergée le 2026-10-12T20:36:29Z
- Contenue dans `origin/main` (vérifié via `git branch -r --contains`)
- Décision owner : Hugo a mergé lui-même. Mots exacts : « parfait je viens de merger »

## Acceptance en production (10/10)
Sonde lecture seule sur `https://emploia.eu`, 5 assertions par page :
HTTP 200 · bloc `ld+json` présent · `JSON.parse` valide · `@type` attendu ·
`url` === URL canonique · `name`/`description` non vides · `isPartOf` → `WebSite`.

| URL | @type | Verdict |
|---|---|---|
| /contact | ContactPage | ✓ |
| /cv-builder | WebApplication | ✓ |
| /emploi | CollectionPage | ✓ |
| /metier | CollectionPage | ✓ |
| /metier/btp | CollectionPage | ✓ |
| /metier/communication | CollectionPage | ✓ |
| /metier/ingenieur | CollectionPage | ✓ |
| /metier/logistique | CollectionPage | ✓ |
| /metier/sante | CollectionPage | ✓ |
| /sous-traitants | WebPage | ✓ |

**10 OK · 0 échec.**

Ceci FERME l'item de test-plan laissé ouvert au stage 7 : « le routing des URLs
propres n'a pas pu être validé » — la preview Vercel renvoyait 302 vers
`vercel.com/sso-api` (Deployment Protection), et je n'ai pas contourné cette
authentification. Les 10 URLs propres sont maintenant vérifiées en production.

## Smoke global : 28 OK · 1 échec · 2 ignorés

L'échec est un FAUX POSITIF ANTÉRIEUR, hors périmètre de cette slice :

    ✗ /ecoles contient « 9 € » — absent de la page servie

Preuve que ce n'est pas une régression de la PR #65 :
1. `ecoles.html` n'est PAS dans le diff (13 fichiers, aucun n'est /ecoles).
2. `git log -S'9 €' -- ecoles.html` → le prix a disparu le **2026-10-06**
   (commit `451847a`, « barème B2B par tranches »), soit 6 jours AVANT le merge.
3. `scripts/smoke/prod.mjs` n'a jamais été mis à jour : le commit `814e211`
   (« …et la sonde doit le dire ») a bien ajouté `scripts/pricing/ecoles.test.mjs`
   mais n'a pas touché `prod.mjs`.
4. Le fichier local et la page servie affichent les mêmes montants (22/17/12 €) :
   la production sert donc bien le contenu voulu. C'est l'assertion qui est périmée.

Correctif proposé (NON appliqué — hors slice A, décision de Hugo) :
dans `scripts/smoke/prod.mjs:74`, remplacer `'9 €'` par `'22 €'`.
Tant que ce n'est pas fait, la sonde criera au loup à chaque déploiement.

## Sondes volontairement non exécutées
- `--checkout` : crée une vraie session Checkout en mode live chez Stripe. Écriture
  externe → je ne la déclenche pas sans demande explicite.
- `ADMIN_SECRET` absent de l'environnement → console créateurs non sondée.
