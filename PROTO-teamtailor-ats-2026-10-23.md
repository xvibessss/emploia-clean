# Prototype — collecteur Teamtailor en direct

**Relevé du 2026-10-23.** Branche `proto/teamtailor-ats`, coupée de `main` à
`ca51a27`.

Troisième collecteur de la famille « crawl direct de l'ATS », après Greenhouse
(PR 99) et Lever (PR 100). Chaque board sert un JSON Feed public à
`{board}.teamtailor.com/jobs.json`, sans clé ni quota, dont chaque entrée porte
un `_jobposting` en `schema.org/JobPosting`.

**Les trois chiffres à retenir :**

1. **10 des 19 entreprises Teamtailor (52,6 %) sont inconnues d'emploia** —
   Skello, sunday, Ornikar, Innovorder, MeiliSearch, Seedtag, SWEEP, Leocare,
   Welcome to the Jungle, Batch. Elles portent **105 des 228 offres
   françaises**. Lever en avait rendu **0 sur 16** ; Greenhouse 9 sur 27.
   C'est le chiffre que le relevé Lever avait appris à mettre en tête.
2. **83,3 % des offres FR sont absentes** d'emploia (190 sur 228), après
   pagination jusqu'à épuisement — et le contre-test le confirme au lieu de le
   démentir : sur onze pages de recherche « Skello », emploia rend **zéro**
   offre Skello.
3. **C'est le premier collecteur de la famille à publier un salaire** — 26
   offres — mais seulement après avoir écarté 17 montants MENSUELS qui se
   seraient affichés « 1k€/an », douze fois trop bas.

---

## 1. Le critère a changé, et c'est la leçon du relevé Lever

Lever avait rendu 331 offres françaises dont 41,7 % absentes d'emploia — un
résultat honorable — mais **zéro entreprise** qu'emploia ne servait pas déjà.
Il avait épaissi la liste sans l'élargir, et ce fait-là était enterré en bas du
rapport, après le compte d'offres.

Un ATS qui ajoute des offres d'employeurs déjà couverts rend la liste plus
profonde ; un ATS qui ajoute des **employeurs** rend le site utile à des
candidats qu'il ne servait pas. Le second vaut beaucoup plus.

**`scripts/teamtailor/recouvrement.mjs` met donc le recouvrement par entreprise
EN TÊTE**, avant le compte d'offres — pas en note de bas de rapport.

---

## 2. Le catalogue, board par board

**383 candidats sondés un par un** par
`scripts/teamtailor/verifier-boards.mjs`. Un board Teamtailor est un
sous-domaine que l'employeur choisit : il se devine, et un slug deviné qui
répond 404 inscrirait au catalogue une entreprise qu'on ne collectera jamais.

| | **Teamtailor** | Lever | Greenhouse |
|---|---|---|---|
| Candidats sondés | 383 | 401 | 319 |
| Boards vivants | 40 (10,4 %) | 31 (7,7 %) | **63 (19,7 %)** |
| dont ≥ 1 offre FR | 19 | 17 | **28** |
| Offres du catalogue | 322 | 1 905 | **6 484** |
| **Offres FR** | 228 | 331 | 336 |
| **Densité FR** | **70,8 %** | 17,4 % | 5,2 % |
| Durée de collecte | **5,1 s** | 20 – 31,5 s | 10,1 s |
| Boards en échec | **0** | 0 | 0 |

Teamtailor porte **beaucoup moins d'offres et beaucoup plus de France**. C'est
cohérent avec ce qu'il est : l'ATS d'entreprises plus petites, vendu en Europe
continentale plutôt qu'aux grandes tech américaines.

Les 343 autres candidats n'ont rien rendu : **342 en HTTP 404 et un seul échec
réseau** — `intercom`, dont le sous-domaine ne résout pas en DNS, vérifié
séparément. Ce n'est donc pas un faux négatif qu'un second passage
rattraperait.

Le catalogue retenu, 19 boards, 228 offres FR :

```
Skello 31 · Hublo 27 · sunday 25 · Deezer 24 · Foodles 20 · Spiko 18
Ornikar 16 · Shine 15 · Prophesee 11 · Innovorder 10 · MeiliSearch 9
Seedtag 7 · PayFit 3 · SWEEP 3 · Memo Bank 3 · Akeneo 2 · Leocare 2
Welcome to the Jungle 1 · Batch 1
```

Contrôle : à la collecte suivante, le nombre constaté par entreprise
correspondait **exactement** au relevé, écart nul sur les 19 boards.

### Les neuf que les trois ATS cherchaient

Des treize scale-ups françaises que Greenhouse n'avait pas, Lever en avait
rendu quatre. Des neuf restantes, Teamtailor en rend **une** :

| Entreprise | Teamtailor |
|---|---|
| **PayFit** | **vivant — 3 offres FR** |
| Alan, Pennylane, Spendesk, Ledger, Back Market, Leboncoin, Mistral, OVHcloud | HTTP 404 |

Ces huit-là répondent 404 sur **les trois ATS**. Elles sont ailleurs — site
carrière maison, Workday, ou Welcome to the Jungle en tant qu'agrégateur. Voir
la recommandation du §7.

---

## 3. Le premier salaire de la famille ATS, et son piège

Ni Greenhouse ni Lever n'ont de champ de salaire. Teamtailor sert `baseSalary`
sur **9,3 %** des offres (56 sur 602).

**Le piège est d'unité, donc du même genre que `unbefristet`/`befristet` : il
ne rend pas la valeur imprécise, il la rend fausse d'un facteur douze.**

`baseSalary.value.unitText` vaut `YEAR` **ou `MONTH`**, et
`formaterSalaireAnnuel` affiche des « k€/an ». Sur les 50 salaires relevés en
détail, **17 sont mensuels**, et ce sont des gratifications de stage ou des
temps partiels :

| Valeur servie | Ce qui s'afficherait sans garde |
|---|---|
| 640 €/mois | **« 1k€/an »** |
| 1 250 €/mois | **« 1k€/an »** |
| 1 327 €/mois | **« 1k€/an »** |
| 1 618,50 €/mois | **« 2k€/an »** |

Un candidat lirait qu'un poste paie mille euros **par an**.

**On ne les annualise pas pour autant.** Multiplier par douze serait de
l'arithmétique, pas une lecture : la source ne dit ni treize mois, ni brut, ni
la durée du contrat, et le dépôt n'a aucun affichage mensuel. Six salaires en
USD ou GBP et deux sans devise sont écartés pour la même raison — l'affichage
est en euros, en dur, et les publier attribuerait des euros à un montant qui
n'en est pas.

**Restent 25 salaires sur 50**, et 26 sur les offres françaises du catalogue.
C'est la première fois qu'un collecteur de cette famille en publie un.

Le garde est posé dans **`api/_lib/contrat.js`**, à côté de
`formaterSalaireAnnuel`, et **pas** dans le collecteur : `schema.org` est un
format standard, le prochain collecteur qui lira du JSON-LD rencontrera la
même forme, et un garde recopié est un garde qui diverge.

---

## 4. Ce qu'un standard promet n'est pas ce qu'il sert

`schema.org/JobPosting` **définit** `employmentType`, avec une énumération
fermée. C'est tentant de s'y fier.

**Mesuré : le champ est absent de 602 offres sur 602. Zéro.**

| Champ du standard | Servi |
|---|---|
| `datePosted` | **100 %** (602/602) |
| `baseSalary` | 9,3 % (56/602) |
| `validThrough` | 12,3 % (74/602) |
| `employmentType` | **0 %** |
| `jobLocationType` | **0 %** |

Conséquences, dites franchement :

- **Le contrat vaut `null` 75,9 % du temps** sur les offres françaises — le
  plus mauvais des trois ATS (45,3 % chez Lever, 57,8 % chez Greenhouse). Il
  retombe sur le titre, et un titre muet ne devient pas un CDI.
- **Le distanciel n'a aucun signal structuré.** `jobLocationType:
  TELECOMMUTE` est dans le standard et servi zéro fois. Il se lit donc sur le
  texte du lieu, comme chez Greenhouse, et vaut `false` quand rien ne le dit.

Le lecteur d'`employmentType` est quand même branché, et il ne coûte rien :
`contratDepuisTexte` couvre **déjà toute l'énumération**, parce que le travail
fait pour Lever l'avait élargie. `CONTRACTOR` et `TEMPORARY` rendent CDD,
`INTERN` rend Stage, `FULL_TIME` et `PART_TIME` ne rendent aucun contrat mais
une durée de travail, dans son propre champ. **Aucun vocabulaire nouveau n'a
été nécessaire** — c'est le dividende de la PR 100.

---

## 5. Le tableau de lieux n'est pas le piège de Lever

Chez Lever, `allLocations` **doublait** un champ `location` principal : une
offre disait `location: Berlin` et listait Paris à côté, donc le tableau
nommait des bureaux et non le lieu du poste. Six offres non françaises y
nommaient la France, et le champ a été écarté du calcul.

Chez Teamtailor il n'y a pas de principal et de secondaire : **`jobLocation`
EST le champ de lieu**, et schema.org le définit pluriel pour les postes
réellement ouverts à plusieurs sites. Mesuré : 81 offres sur 602 portent
plusieurs lieux, dont **24 mêlent la France à un autre pays** :

```
FR/Paris + GB/London                              (×10)
FR/Paris + DK/Copenhagen + DE/Berlin + NL/Amsterdam
ES/Madrid + FR/Paris + PT/Porto
FR/Paris + IT/Milan
```

Un candidat qui cherche à Paris peut postuler à ces postes-là. **Une offre est
donc française dès qu'un de ses lieux l'est** — l'inverse de la décision prise
pour Lever, et c'est la forme du champ qui l'impose, pas une préférence.

Le **code ISO passe avant la liste de villes**, comme chez Lever et pour la
même raison mesurée : 18 offres portent `FR` sur une commune absente de la
liste — Clichy, Marignane, Neuilly-sur-Seine, Wissous, Eaubonne,
Gennevilliers, Vélizy-Villacoublay, Cesson-Sévigné — et **zéro offre va dans
l'autre sens**.

Enfin, l'URL servie est souvent le **propre domaine de l'employeur** —
`careers.payfit.com`, `careers.akeneo.com`, `careers.ornikar.com`,
`careers.sundayapp.com` — et pas celui de l'ATS. Un cran de mieux que
Greenhouse et Lever, qui servaient toujours `greenhouse.io` et
`jobs.lever.co`.

---

## 6. Le recouvrement

Protocole identique à celui de Lever, et délibérément défavorable au
prototype : l'API de production est interrogée **entreprise par entreprise par
le nom exact, et paginée jusqu'à épuisement** — 27 requêtes, 222 pages. La clé
de comparaison est celle de `deduplicate()`, extraite du vrai `api/jobs.js` et
exécutée telle quelle, avec un garde qui fait échouer la mesure si cette clé
change.

### Ce que le catalogue ÉLARGIT — le chiffre qui décide

```
Entreprises Teamtailor avec offres FR : 19
  INCONNUES d'emploia aujourd'hui     : 10  (52,6 %)
  déjà présentes                      :  9
Offres portées par les entreprises nouvelles : 105 / 228
```

| Entreprise inconnue d'emploia | Offres FR |
|---|---|
| Skello | 31 |
| sunday | 25 |
| Ornikar | 16 |
| Innovorder | 10 |
| MeiliSearch | 9 |
| Seedtag | 7 |
| SWEEP | 3 |
| Leocare | 2 |
| Welcome to the Jungle | 1 |
| Batch | 1 |

| | Greenhouse | Lever | **Teamtailor** |
|---|---|---|---|
| Entreprises FR | 27 | 16 | 19 |
| **dont inconnues d'emploia** | 9 (33 %) | **0** | **10 (52,6 %)** |

### Ce que le catalogue APPROFONDIT — offre par offre

```
Offres distinctes rendues par emploia : 1 314
Offres Teamtailor en France           :   228
  déjà rendues                        :    38  (16,7 %)
  ABSENTES                            :   190  (83,3 %)
  dont portant un salaire publié      :    26
```

### Le contre-test, qui cette fois CONFIRME

Pour Lever, le contre-test de pagination avait démenti le relevé : emploia
rendait déjà 41 offres Qonto quand Lever n'en portait que 27. Ici il va dans
l'autre sens :

| Entreprise | emploia, 11 pages | dont de l'entreprise | Teamtailor en FR |
|---|---|---|---|
| **Skello** | 48 offres | **0** | 31 |
| **Hublo** | 66 | **2** | 27 |
| **Deezer** | 68 | **2** | 24 |
| Foodles | 71 | 23 | 20 |

Sur onze pages de recherche « Skello », emploia ne rend **aucune** offre
Skello. Le trou n'est pas un artefact de pagination : ces employeurs ne sont
pas dans le flux.

Foodles est l'exception instructive — emploia en connaît déjà 23 sur 20, donc
l'apport y est nul en nombre. Il reste l'URL : Foodles sort désormais avec sa
propre page carrière plutôt qu'avec celle d'un republicateur.

### L'état de la production au moment de la mesure

```
France Travail      cle_absente
French Job Market   collecte_absente
JSearch             quota_epuise
```

Trois sources muettes sur onze, contre cinq sur dix lors du relevé Lever : les
PR 101, 102, 105 et 106 ont réparé entre-temps.

---

## 7. L'intégration livrée

### Le troisième ATS n'a coûté aucun cron

C'était la promesse du registre introduit par la PR 100, et elle tient :
`api/_lib/ats.js` gagne **quatorze lignes**, et `api/cron/collect-ats.js`
**zéro**. Pas d'heure à choisir, pas de garde à recopier.

Le dépôt compte onze crons — `collect-rapidapi` a été ajouté entre-temps par la
PR 101 — et **aucun ne porte le nom d'un ATS**. La sonde le vérifie désormais
ainsi plutôt qu'en comptant les crons : le jour où quelqu'un écrit
`collect-teamtailor`, le registre a été contourné et le test rougit.

Les trois collectes enchaînées font **~40 s** (Greenhouse 10,1 + Lever 20–31,5
+ Teamtailor 5,1), loin sous les 300 s réservées à ce chemin dans
`vercel.json`, et le cron reste en runtime Node — une fonction Edge doit
répondre en 25 s.

### Les gardes, hérités sans être recopiés

Une collecte vide n'écrase jamais une clé valide ; le TTL de 72 h fait
apparaître une panne de cron ; un fournisseur qui explose n'emporte pas les
autres ; le collecteur passe avant les sources tierces pour que
`deduplicate()` garde l'URL de l'employeur. Tous vivent dans
`collecterFournisseur`, écrits une fois.

**Une clé KV par fournisseur** — `teamtailor_jobs` s'ajoute à
`greenhouse_jobs` et `lever_jobs` — pour que `causesEnEchec` nomme les trois
séparément, et la balise de passage de la PR 106 distingue déjà « cron jamais
passé » de « passé, crawl mort », fournisseur par fournisseur.

### Le diff

**Purement additif, zéro suppression, sur tous les fichiers partagés :**

| Fichier | Diff |
|---|---|
| `api/jobs.js` | **+62 / −0** |
| `api/_lib/contrat.js` | **+71 / −0** |
| `api/_lib/ats.js` | **+14 / −0** |
| `scripts/smoke/sources.mjs` | **+1 / −0** |
| `.github/workflows/ci.yml` | **+2 / −0** |
| `package.json` | **+5 / −0** |

Plus cinq fichiers neufs : le collecteur, le catalogue, la sonde (**118
vérifications**) et les quatre scripts de mesure.

---

## 8. Recommandation : Ashby, et c'est mesuré

**Ashby**, et le relevé qui le dit a pris quatre minutes.

### Où sont les huit introuvables

Alan, Pennylane, Spendesk, Ledger, Back Market, Leboncoin, Mistral et
OVHcloud répondent 404 sur les trois ATS crawlés. Plutôt que de deviner, je
les ai sondées sur trois autres ATS à endpoint public :

| Entreprise | Recruitee | SmartRecruiters | **Ashby** |
|---|---|---|---|
| Alan | 404 | 200 / **0 offre** | **130 offres** |
| Pennylane | 404 | 200 / **0 offre** | **169 offres** |
| Back Market | 404 | 200 / **0 offre** | **33 offres** |
| Ledger | 404 | 200 / **0 offre** | **13 offres** |
| Spendesk | 404 | 200 / 0 offre | 0 offre |
| Leboncoin, Mistral, OVHcloud | 404 | 200 / 0 offre | 404 |

**Quatre des huit sont sur Ashby**, dont les deux plus grosses — Alan 130
offres, Pennylane 169. À elles seules, elles portent plus d'offres que tout le
catalogue Teamtailor.

### Le piège que ce sondage a attrapé, et il vaut d'être écrit

**SmartRecruiters répond HTTP 200 à tout**, y compris au slug
`zzz-entreprise-inexistante-xyz`, et rend zéro offre dans tous les cas. Un
sondage qui n'aurait regardé que le code HTTP aurait inscrit **huit
entreprises fantômes** au catalogue — exactement la faute que
`verifier-boards.mjs` existe pour éviter, et elle serait passée parce que
« 200 » a l'air d'une bonne nouvelle.

Ashby, lui, discrimine : le slug inventé rend une réponse illisible, les vrais
clients rendent des comptes réels. **Le critère d'un board vivant n'est pas
son code HTTP, c'est ce qu'il porte.**

### Pourquoi Ashby plutôt qu'un quatrième tour de table

1. **Le rendement par entreprise nouvelle ne s'épuise pas.** Greenhouse 9/27,
   Lever 0/16, Teamtailor 10/19. Il n'y a pas de décroissance : il y a des ATS
   qui portent le marché français et d'autres non. Ashby porte Alan et
   Pennylane, donc il le porte.
2. **Le registre rend le quatrième moins cher que le troisième.** Celui-ci a
   coûté 14 lignes dans `ats.js` et **zéro** dans le cron. Le prochain coûtera
   la même chose.
3. **Ashby publie un endpoint JSON documenté et sans clé**
   (`api.ashbyhq.com/posting-api/job-board/{slug}`), comme les trois autres.

### Les deux mesures à exiger, et une troisième

Les deux de la PR 100 tiennent : **recouvrement paginé dès le premier relevé**,
et **recouvrement par entreprise en tête**. Ce relevé en ajoute une :

**Vérifier le CONTENU d'un board, jamais son code HTTP.** Un 200 avec zéro
offre n'est pas un board vivant, et au moins un ATS majeur répond 200 à
n'importe quoi.

### Ce qui reste hors de portée des ATS

Leboncoin, Mistral et OVHcloud ne sont sur aucun des six ATS sondés. Ce sont
des sites carrière maison ou des Workday à tenant privé. Les atteindre
demanderait un scraper HTML par entreprise — une autre nature de travail, bien
plus fragile, et qui ne devrait pas être tentée avant qu'Ashby soit fait.

---

## 9. Ce qui ne peut être levé que par Hugo

1. **Le merge et le déploiement.** Rien n'est mergé, rien n'est déployé.
2. **La première exécution de `collect-ats`.** Après déploiement,
   `teamtailor_jobs` est vide jusqu'à 4 h du matin : `causesEnEchec` affichera
   la cause déduite de la balise d'ici là. Normal — au-delà de 72 h, c'est une
   panne de cron.
3. **Une dette de commentaires, signalée non réglée.** Plusieurs fichiers
   parlent encore de « neuf collecteurs » ou « huit collecteurs »
   (`scripts/smoke/sources.mjs`, `api/jobs.js`, `api/_lib/contrat.js`,
   `scripts/greenhouse/recouvrement.mjs`). Ces comptes étaient déjà faux avant
   cette branche — le dépôt en avait dix — et mon onzième les éloigne d'un
   cran de plus. Je ne les ai pas corrigés : ce sont des fichiers que d'autres
   sessions éditent, et remplacer « neuf » par « onze » ne fait que repousser
   la prochaine dérive. La vraie correction est de cesser d'écrire le compte
   en prose, puisque `FOURNISSEURS.length` le connaît.
