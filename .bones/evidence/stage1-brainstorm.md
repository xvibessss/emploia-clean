# Stage 1 — Brainstorm / interrogation du prompt

## Le brief de départ était partiellement faux

Le prompt de lancement (rédigé par Claude à partir d'un crawl LibreCrawl)
affirmait : *« 27 pages sans aucun JSON-LD, dont toutes les pages métiers
et les ~85 pages villes/métiers »*.

**Vérifié dans le repo, c'est inexact.** Mesures (`grep -F`, 2026-10-10) :

| Périmètre | Fichiers | Avec JSON-LD |
|---|---:|---:|
| `emploi/*.html` (villes) | 48 | **48** |
| `metier/*.html` | 37 | **32** |
| Pages hub (`emploi.html`, `metier.html`, `cv-builder.html`, `contact.html`, `sous-traitants.html`) | 5 | **0** |

Les pages villes sont **toutes** équipées (`CollectionPage`, `FAQPage`,
`Place`, `PostalAddress`, `WebSite`). 158 fichiers du repo contiennent déjà
du JSON-LD.

Une première vérification avait conclu « 0 partout » : erreur de pattern
(`ld\+json`, où `\+` n'est pas littéral en grep BSD). Corrigée avec
`grep -F`.

## Ce qui manque réellement

1. **5 pages métiers sans aucun JSON-LD** : `metier/btp.html`,
   `communication`, `ingenieur`, `logistique`, `sante`. Incohérence pure
   avec les 32 autres.
2. **5 pages hub sans JSON-LD** : les points d'entrée `/emploi` et
   `/metier`, plus `/cv-builder`, `/contact`, `/sous-traitants`.
3. **`JobPosting` et `Occupation` n'existent nulle part** — 0 fichier sur
   tout le repo. Aucune page n'est éligible à Google Jobs ni à
   l'affichage enrichi métier, y compris les 32 pages métiers déjà
   équipées en `FAQPage`/`CollectionPage`.

Les 14 pages signalées en `noindex` par LibreCrawl (`/legal/*`,
`/dashboard`, `/profil`, `/chat`, `/alerts`, `/cv-vault`, `/interview`)
sont des **faux positifs légitimes** : hors périmètre, à ne pas toucher.

## Contexte technique

- **Aucun générateur.** Les 85 pages sont écrites à la main et versionnées
  (37 + 48 fichiers suivis par git). `vercel.json` :
  `buildCommand: "echo ok"`, `outputDirectory: "."` — Vercel sert les
  fichiers tels quels. Il n'y a pas de template à patcher : toute
  modification touche N fichiers HTML, donc doit être **scriptée** pour
  être cohérente et rejouable.
- Sondes déjà en place, réutilisables pour le gate automatique du stage 5 :
  `scripts/smoke/surface.mjs`, `scripts/ci-guards.mjs`,
  `npm run smoke:prod`.
- Production live : Vercel + Stripe réel. Tout changement est visible
  immédiatement par Google et par les clients.

## Deux slices possibles — elles ne se valent pas

**A. Combler les trous** (10 fichiers : 5 métiers + 5 hub)
Aligner sur le JSON-LD déjà en place ailleurs. Petit, sûr, mécanique.
Supprime l'incohérence et les 42 « erreurs » de LibreCrawl.
Levier SEO : **faible** — ces schémas (`CollectionPage`, `FAQPage`) ne
donnent pas d'affichage enrichi pour de l'emploi.

**B. Introduire `Occupation` sur les 37 pages métiers**
Le type que Google lit pour les pages de fiche métier. N'existe nulle
part. Levier : **réel**, c'est ce qui conditionne l'affichage enrichi.
Mais : 37 fichiers, un schéma nouveau à modéliser, et un risque de
données structurées invalides sur de la production si c'est bâclé.

À noter sur `JobPosting` : il décrit **une offre d'emploi précise**
(employeur, salaire, date de clôture). Les pages `/metier/*` sont des
pages de *catégorie*, pas des offres. Y mettre `JobPosting` serait du
balisage trompeur, sanctionnable par Google. `Occupation` est le type
correct pour ces pages. Le constat « éligibilité Google Jobs » du brief
initial était donc une approximation : Google Jobs exige de vraies offres.

## Recommandation

**A puis B, dans cette run A seulement.**

Raison : A est mécanique et vérifiable, et sa valeur est la cohérence —
pas le SEO. B demande une décision de modélisation (quels champs
`Occupation`, avec quelles données réelles) qui mérite sa propre spec et
son propre passage au stage 4. Les mélanger dans une run, c'est se
retrouver à écrire du schéma à la main sur 37 fichiers de production sans
avoir tranché le modèle.

**Signal connexe non traité ici** : les 45 détections de contenu dupliqué
sur ces mêmes pages. C'est un problème de contenu, pas de balisage, et
l'ajouter à cette run la ferait dériver.

## Décision attendue de Hugo (stage 2)

Slice A (10 fichiers, cohérence), slice B (37 fichiers, levier SEO),
les deux, ou arrêt.
