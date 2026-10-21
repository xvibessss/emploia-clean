# Les trois sources tierces en panne — ce qui était cassé, ce qui est fait

Relevé du 2026-10-21. Périmètre : Internships (`http_404`), JSearch et French
Job Market (`http_429`). France Travail (`cle_absente`) est hors périmètre.

---

## En une ligne par source

| Source | Cause réelle | Décision | Reste à la main de Hugo |
|---|---|---|---|
| Internships | API **retirée par son fournisseur** le 2026-08-03 | retirée du dépôt | rien |
| JSearch | plafond **mensuel** du plan gratuit : 200 requêtes, « Hard Limit » | passée en cron + KV, 186 requêtes/mois au pire cas | rien — ou 25 $/mois si la couverture ne suffit pas |
| French Job Market | plafond **mensuel** : 30 requêtes, « Hard Limit » | passée en cron + KV, **hebdomadaire** (25/mois) | 10 $/mois pour revenir au quotidien |

Les trois étaient en échec pour trois raisons différentes, et aucune n'était
celle qu'on aurait supposée depuis le code.

---

## 1. Établir les faits avant de corriger

Trois hypothèses étaient ouvertes sur les `429` : quota mensuel épuisé, throttle
par seconde, ou clé invalide que l'API déguise en 429. Elles n'appellent pas la
même correction, donc elles ont été départagées par la mesure.

**Un appel sans clé sur les trois hôtes rend `401`.**

```
jsearch.p.rapidapi.com/search                 → 401 {"message":"Invalid API key..."}
french-job-market.p.rapidapi.com/v1/jobs/...  → 401 {"message":"Invalid API key..."}
internships-api.p.rapidapi.com/active-jb-7d   → 401 {"message":"Invalid API key..."}
```

La passerelle RapidAPI vérifie donc la clé **avant** de router. Deux conclusions
tombent de là, sans rien deviner :

- un `429` prouve que la clé est **valide** et que l'abonnement **existe** (un
  abonnement absent rendrait `403`) → l'hypothèse « clé invalide déguisée en
  429 » est **écartée** ;
- un `404` est rendu **après** l'authentification → ce n'est pas un problème de
  clé, c'est le chemin ou l'API qui n'existe plus.

**Trois requêtes isolées en production, hors cache, espacées de 100 s :**

```
19:40:29  total  6  JSearch http_429  French Job Market http_429  Internships http_404
19:42:11  total  6  JSearch http_429  French Job Market http_429  Internships http_404
19:43:52  total 11  JSearch http_429  French Job Market http_429  Internships http_404
```

Chaque requête ne déclenche **qu'un seul appel par API**. Trois appels isolés sur
3,5 minutes, tous refusés, avec un débit publié de **1000 requêtes/heure** sur
les deux plans — hors d'atteinte pour le trafic d'emploia. L'hypothèse du
throttle par seconde est **écartée**. Reste le plafond mensuel.

**Plafonds relevés sur les grilles publiques RapidAPI le 2026-10-21 :**

| | gratuit | payant |
|---|---|---|
| JSearch | **200 req/mois**, « Hard Limit », 1000/h | Pro 25 $ → 10 000 · Ultra 75 $ → 50 000 |
| French job market | **30 req/mois**, « Hard Limit », 1000/h | Pro 10 $ → 300 · Ultra 20 $ → 800 |

### Correction à une prémisse de la mission

La mission supposait que les deux sources « se mangent mutuellement le quota »
parce qu'elles partagent `RAPIDAPI_KEY`. **Ce n'est pas le cas.** Sur RapidAPI
le quota est attaché à l'**abonnement par API**, pas à la clé : chaque fiche a
sa propre grille et son propre compteur mensuel. Les deux sources sont chacune
au-delà du sien, indépendamment. C'est pourquoi les budgets ci-dessous sont
calculés séparément et non partagés.

---

## 2. Internships — API retirée, source supprimée

Ce n'était ni un chemin mal construit ni un abonnement à renouveler. La fiche
RapidAPI de l'API porte, relevée le 2026-10-21 :

> This API is no longer available
>
> This API is deprecated and will no longer serve jobs starting August 3rd 2026.

L'API ne sert plus d'offres depuis **deux mois et demi**. Aucune correction de
code ne la ramène. Fantastic.jobs redirige vers deux remplaçantes payantes.

**Elles n'ont pas été reprises, et le chiffre le dit mieux qu'un argument :** le
collecteur était borné à `.slice(0, 10)`, soit **dix offres de stage au
maximum**, là où le collecteur Greenhouse de la PR #99 ramène **6 484 offres**
crawlées en direct sur les ATS d'employeurs, sans clé et sans quota. C'est la
**même nature de donnée** — des pages carrière — et elle est déjà gratuite.
Rouvrir un abonnement pour dix offres aurait ajouté de la pression sur le quota
qui fait précisément tomber les deux autres sources.

Retiré : le collecteur, sa déclaration dans la liste, son entrée dans les
absences connues de `smoke:sources`, et la ligne de `causes.test.mjs` qui le
citait. Le handler interroge **huit** collecteurs au lieu de neuf. Un test
vérifie qu'il n'en reste aucune trace exécutable.

Une source morte laissée déclarée figure en échec **perpétuel**, et c'est ce qui
finit par rendre la liste des pannes illisible : elle dilue les pannes réelles
jusqu'à ce que plus personne ne la lise.

---

## 3. JSearch et French Job Market — l'appel en ligne était impossible

Le point n'est pas que le quota était serré. C'est qu'il était dépassé **par
construction**, de une à deux puissances de dix.

Chaque requête `/api/jobs` non mise en cache coûtait **un appel à chaque
source**. emploia sert 86 pages SEO plus le trafic utilisateur. Un **seul**
passage de crawler sur ces 86 pages consomme 86 requêtes, soit :

- **2,9 fois** le quota mensuel **entier** de French Job Market,
- **43 %** de celui de JSearch.

Aucun TTL de cache par requête ne rattrape ça : la clé de cache porte `q` et
`location`, donc 86 pages font 86 entrées, donc 86 appels par fenêtre de TTL.
**La mise en cache par requête ne peut pas tenir dans ces quotas** — c'est
arithmétique, pas une question de réglage.

La seule forme qui tienne est un **réservoir indépendant de la requête**, rempli
par un cron et lu en KV : le schéma de la PR #99. Le nombre d'appels devient
fonction du **calendrier** et non du trafic, donc borné à l'avance.

### Ce qui a été construit

- `api/_lib/rapidapi.js` — les deux collecteurs, `fetch` injectable, appels par
  lots de 3.
- `api/cron/collect-rapidapi.js` — cron quotidien à **3 h UTC** (avant
  Greenhouse à 4 h et les alertes à 7 h), écrit la clé `rapidapi_jobs`.
- `api/jobs.js` — les deux collecteurs deviennent des **lectures KV**, comme
  Greenhouse. La clé est lue **une seule fois** par requête et passée aux deux.

**Les budgets, et pourquoi ces nombres :**

| | fréquence | requêtes/collecte | pire cas mensuel | plafond |
|---|---|---|---|---|
| JSearch | quotidienne | 6 | 6 × **31** = **186** | 200 |
| French Job Market | **hebdomadaire** (lundi) | 5 | 5 × **5 lundis** = **25** | 30 |

31 et 5 sont les pires cas du calendrier, pas des moyennes : un budget calculé
sur 30 jours déborderait sept mois par an.

**French Job Market ne peut pas être collectée quotidiennement.** 30 requêtes
pour 31 jours : le mois déborde avant de finir. Ce n'est pas une marge serrée,
c'est une impossibilité arithmétique. L'hebdomadaire est le seul rythme que son
plan gratuit autorise, et il coûte une fraîcheur de sept jours.

Le cron est **quotidien** et non plus fréquent parce que le plan Vercel est
Hobby, où `0 */6 * * *` a fait **échouer le déploiement** de la PR #99 avant le
build.

**Six familles de métiers plutôt que six pages d'une même requête** — tech,
commerce, santé, industrie, gestion, logistique. Le réservoir est filtré à la
lecture par la requête de l'utilisateur, donc c'est la *largeur* du catalogue qui
compte, pas la profondeur dans un seul classement.

**La limite de ce choix, dite franchement :** emploia publie 37 pages `/metier`.
Un candidat qui cherche « coiffeur » ne trouvera **rien** venant de ces deux
sources, parce que le réservoir ne contient pas sa famille. Avec 200 requêtes par
mois, il n'existe aucune version de ce choix qui couvre 37 métiers.

### Les gardes

Repris de Greenhouse : refus d'écrire une clé vide, borne de taille journalisée,
`CRON_SECRET` obligatoire, TTL de 72 h pour que trois collectes manquées fassent
**apparaître** la panne au lieu de la masquer.

**Un garde qui n'existait pas pour Greenhouse, et qu'il fallait ajouter.** La clé
porte **deux** sources et le cron la réécrit chaque jour : son TTL resterait donc
neuf même si French Job Market était refusée depuis six semaines, et le réservoir
servirait des offres périmées sans jamais le dire — exactement le silence que
`causesEnEchec` est venu retirer. La fraîcheur se vérifie donc **par source**, à
la lecture, sur son propre `collecteLe` : 72 h pour JSearch, 16 jours pour French
Job Market (deux lundis manqués plus deux jours de marge).

Le coût est réel et doit être dit : **une offre APEC peut être servie seize jours
après sa collecte.** Chaque offre porte sa propre date et la liste est triée
dessus, donc l'âge reste visible — mais il est là. Passer la source en Pro
ramènerait cette tolérance à 72 h comme les autres.

---

## 4. Garder les pannes visibles — `quota_epuise`

Une nouvelle façon d'échouer est apparue, donc elle a son jeton, distinct des
autres. Un réservoir vide a désormais **trois** lectures, et elles appellent
trois actions différentes :

| cause | ce qu'elle dit | où chercher |
|---|---|---|
| `collecte_absente` | le cron n'a pas tourné | les crons Vercel |
| **`quota_epuise`** | il a tourné, le fournisseur a **refusé** faute de quota | **décision d'abonnement** |
| `cle_absente` | `RAPIDAPI_KEY` n'est pas posée | poser la variable |

Avant, le symptôme public était `http_429` : exact, mais rendu une fois par
requête utilisateur, et **sans dire** que la cause était un plafond *mensuel*
plutôt qu'un pic de trafic. Établir cette différence a demandé une sonde dédiée ;
`quota_epuise` la dit en un mot. Le vocabulaire reste fermé — un test vérifie
qu'un message libre est toujours réduit à `inconnue`.

---

## 5. Tests

`scripts/smoke/rapidapi.test.mjs` — **59 vérifications**, hors ligne, réseau
injecté. Déclaré `test:rapidapi` dans `package.json` et rattaché au job `guards`
de `.github/workflows/ci.yml`.

Le garde central ne vérifie pas qu'un nombre est « raisonnable » : il **refait le
calcul** du pire cas mensuel depuis les constantes du dépôt et le compare au
plafond du fournisseur. Monter `pagesParCollecte` sans monter le plan fait donc
rougir la CI, au lieu de faire rougir la production trois semaines plus tard.

Également vérifié : un `429` arrête la collecte après le premier lot ; une
collecte vide conserve les offres précédentes **sans rajeunir leur date** ; un
âge de 8 jours est une panne pour JSearch et un cycle normal pour French Job
Market ; le pire cas de durée (32 s) tient sous `maxDuration: 60`.

Deux sondes existantes ont dû être mises à jour, et une l'a été à son avantage :
`greenhouse.test.mjs` exécute désormais le filtre de lecture **partagé** par les
trois réservoirs, donc ses 94 vérifications valent pour les trois et non plus
pour Greenhouse seule.

Suite complète locale : **16 scripts verts**, 85 handlers sans erreur de syntaxe.

---

## 6. Ce qui reste à la main de Hugo

**Rien n'est bloquant.** Mais trois points sont des décisions, pas du code.

1. **Le quota est déjà épuisé pour le mois en cours.** Le cron respectera le
   plafond, mais il sera **refusé jusqu'à la remise à zéro du compteur**, qui
   tombe à la date anniversaire de l'abonnement — visible seulement dans le
   tableau de bord RapidAPI. D'ici là, les deux sources rendront `quota_epuise`,
   et **c'est le comportement correct, pas une panne**. Ne pas lire ça comme un
   échec du correctif.

2. **L'abonnement, si la couverture ne suffit pas.** Le plan gratuit de JSearch
   plafonne la valeur ajoutée à ~60 offres/jour sur 6 familles de métiers. Pro à
   **25 $/mois** (10 000 requêtes) permettrait 37 familles par jour, soit la
   couverture réelle des pages `/metier`. Pour French Job Market, Pro à
   **10 $/mois** (300 requêtes) ramènerait le quotidien et une fraîcheur de 72 h
   au lieu de 16 jours. C'est le seul arbitrage où du code ne peut rien.

3. **France Travail** reste en `cle_absente`, hors périmètre comme demandé.
   Le code du collecteur a été **relu** et il n'est pas cassé au-delà de la
   variable manquante : il lit `FRANCE_TRAVAIL_CLIENT_ID` / `_SECRET`, garde
   l'absence, obtient son jeton OAuth avec une cause `jeton_refuse` distincte,
   déclare son statut HTTP explicitement et mappe le contrat depuis le code du
   référentiel et non depuis le libellé libre. Il n'attend que les identifiants
   à créer sur francetravail.io et à poser dans Vercel.

   Une nuance repérée à la relecture, **non modifiée** parce qu'elle est hors
   périmètre : `if (type === 'stage') return [];` sort sans rien journaliser.
   Sous le filtre « stage », France Travail rend donc zéro offre **sans
   apparaître dans `sourcesEnEchec`** — c'est délibéré (« stages not well
   represented ») mais c'est la forme même du `return []` nu que `causesEnEchec`
   est venu retirer partout ailleurs. À trancher quand les identifiants
   existeront : soit une cause dédiée, soit un commentaire qui assume le choix.

### Un constat hors périmètre, signalé sans y toucher

Au relevé de production, `sources` ne contenait que `["Arbeitnow","Remotive"]` et
`sourcesEnEchec` cinq entrées — **sept sur huit**. **Adzuna n'apparaissait dans
aucune des deux listes.** Une source qui rend zéro offre sans être déclarée en
échec est exactement le genre de silence que `causesEnEchec` a été écrit pour
retirer. Ça n'a pas été modifié ici : c'est un autre défaut, dans un autre
collecteur, et il mérite sa propre mesure.
