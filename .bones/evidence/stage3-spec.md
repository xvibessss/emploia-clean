# Spec — Slice A : combler le JSON-LD manquant sur 10 pages

## Périmètre : exactement 10 fichiers

| Fichier | `@type` retenu | Pourquoi ce type |
|---|---|---|
| `metier/btp.html` | `CollectionPage` | identique aux **32** autres pages métiers déjà équipées |
| `metier/communication.html` | `CollectionPage` | idem |
| `metier/ingenieur.html` | `CollectionPage` | idem |
| `metier/logistique.html` | `CollectionPage` | idem |
| `metier/sante.html` | `CollectionPage` | idem |
| `emploi.html` | `CollectionPage` | index des 48 villes |
| `metier.html` | `CollectionPage` | index des 37 métiers |
| `cv-builder.html` | `WebApplication` | outil interactif, pas une collection |
| `contact.html` | `ContactPage` | type standard schema.org pour une page contact |
| `sous-traitants.html` | `WebPage` | type déjà utilisé sur 48 fichiers du repo |

**Hors périmètre, explicitement** : les 32 pages métiers déjà équipées, les
48 pages villes, les 14 pages en `noindex` (`/legal/*`, `/dashboard`,
`/profil`, `/chat`, `/alerts`, `/cv-vault`, `/interview`), l'introduction
d'`Occupation` (slice B), et les 45 contenus dupliqués.

## Forme exacte du bloc, calquée sur l'existant

Modèle relevé dans `metier/chef-projet.html`, reproduit à l'identique :

```json
{
  "@context": "https://schema.org",
  "@type": "<type du tableau>",
  "name": "<title nettoyé de son suffixe de marque>",
  "description": "<meta description de la page, mot pour mot>",
  "url": "<canonical de la page, mot pour mot>",
  "isPartOf": { "@type": "WebSite", "name": "Emploia", "url": "https://emploia.eu" }
}
```

Inséré dans un `<script type="application/ld+json">` **juste avant
`</head>`**, comme ailleurs dans le repo.

**Aucune donnée inventée.** `description` et `url` sont recopiées depuis la
page ; `name` est dérivé du `<title>` en retirant le suffixe de marque
(` — Emploia`, ` · Emploia`). Les 10 pages ont bien une meta description et
un canonical — vérifié.

## Mise en œuvre

Un script `scripts/seo/add-jsonld.mjs`, idempotent :

1. liste codée en dur des 10 fichiers et de leur `@type` (pas de découverte
   automatique : le périmètre doit rester celui que Hugo a validé) ;
2. **ne touche pas** un fichier qui contient déjà `application/ld+json` ;
3. extrait `title`, `description`, `canonical` en respectant le délimiteur
   de quote (le piège qui m'a tronqué les descriptions à `Offres d` lors de
   la recon) ;
4. refuse d'écrire si l'une des trois valeurs manque — échec visible plutôt
   que balisage incomplet ;
5. insère le bloc avant `</head>` et réécrit le fichier.

Script scripté et non manuel pour trois raisons : 10 fichiers, cohérence
garantie, et rejouabilité si le périmètre s'étend à la slice B.

## Acceptance — le gate automatique du stage 5

`./check-jsonld.sh`, exit 0 exigé. Assertions :

1. chacun des **10** fichiers contient exactement **un** bloc
   `application/ld+json` ;
2. chaque bloc **parse** comme du JSON valide ;
3. `@context` vaut `https://schema.org` et `@type` est celui du tableau ;
4. `url` est **identique** au `<link rel="canonical">` de la page ;
5. `name` et `description` sont non vides et sans retour à la ligne ;
6. `description` est identique à la meta description de la page ;
7. **aucun autre fichier `.html` du repo n'a été modifié** —
   `git diff --name-only` ne doit retourner que les 10 cibles plus le
   script et le check ;
8. les 32 pages métiers déjà équipées comptent toujours **un seul** bloc
   (pas de doublon introduit) ;
9. `node scripts/ci-guards.mjs` passe toujours.

Une assertion qui passerait sur un répertoire vide ne prouve rien : le
check compte les fichiers attendus et échoue si le compte n'est pas 10.

## Risques et ce qui les couvre

| Risque | Couverture |
|---|---|
| JSON invalide servi en production | assertion 2, parsing réel |
| `url` ne correspondant pas au canonical → signal contradictoire pour Google | assertion 4 |
| Doublon de bloc sur une page déjà équipée | garde d'idempotence + assertion 8 |
| Dérive du périmètre (fichier touché par erreur) | assertion 7 sur `git diff` |
| Description tronquée par le bug de délimiteur | assertion 6, comparaison stricte |
| Casse d'une page de production | `npm run smoke:prod` au stage 7, sur l'URL de preview Vercel avant promotion |

## Ce que cette slice n'apporte pas

À dire clairement : **`CollectionPage` et `ContactPage` ne donnent aucun
affichage enrichi dans Google pour de l'emploi.** La valeur de cette run est
la **cohérence** du balisage et la disparition de 42 « erreurs » au crawl.
Le levier SEO réel reste la slice B (`Occupation`), hors périmètre ici.
