# Prototype — collecteur Lever en direct

**Relevé du 2026-10-21.** Branche `proto/lever-ats`, coupée de `main` à
`4a24dbe` (la PR 99, qui a livré le collecteur Greenhouse).

Second collecteur de la famille « crawl direct de l'ATS » : il lit l'endpoint
JSON public de Lever, sans clé ni quota, et sert l'URL de la page de
candidature de l'employeur chez son ATS plutôt que celle d'un agrégateur.

**Les trois chiffres à retenir :**

1. **41,7 %** des offres françaises de Lever sont absentes de ce qu'emploia
   sert — pas 90,2 % comme le disait mon premier relevé. Celui-ci était faux,
   et le §5 explique pourquoi : c'est la partie la plus importante de ce
   rapport.
2. **Greenhouse, remesuré au même protocole, donne 59,8 %** — et non les
   76,9 % affichés par la PR 99, qui venaient d'une mesure sur une seule page.
   **Lever apporte donc moins que Greenhouse.**
3. **Lever n'apporte aucune entreprise nouvelle** : ses 16 employeurs sont déjà
   tous dans les résultats d'emploia. Greenhouse en apportait 9 sur 27. C'est
   ce chiffre qui doit choisir le prochain ATS, pas le compte d'offres.

---

## 1. Le gisement visé

Le relevé Greenhouse du 2026-10-19 a laissé un trou nommé. Greenhouse porte
6 484 offres mais seulement 334 en France — **5,2 %** — et les scale-ups
françaises les plus évidentes y répondaient toutes 404 : Qonto, Alan, Swile,
Payfit, Pennylane, Spendesk, Ledger, BlaBlaCar, Back Market, Leboncoin, Malt,
Mistral, OVHcloud. Greenhouse est un ATS surtout anglophone.

L'hypothèse testée ici : ces entreprises sont ailleurs, et Lever est le
candidat suivant.

**Vérifié sur les treize :**

| Entreprise | Board Lever |
|---|---|
| Qonto | **vivant — 27 offres FR** |
| Swile | **vivant — 15 offres FR** |
| Malt | **vivant — 15 offres FR** |
| BlaBlaCar | **vivant — 8 offres FR** |
| Mistral | vivant, **0 offre** — non inscrit |
| Alan, Payfit, Pennylane, Spendesk, Ledger, Back Market, Leboncoin, OVHcloud | HTTP 404 |

Quatre sur treize. L'hypothèse est donc partiellement vraie : Lever récupère
une partie du gisement, pas la totalité. Les neuf autres sont sur un troisième
ATS — voir la recommandation du §8.

---

## 2. Le catalogue, board par board

**401 candidats sondés un par un** par `scripts/lever/verifier-boards.mjs`,
même doctrine que les 319 candidats Greenhouse : un slug Lever est choisi par
l'employeur, il se devine, et un slug deviné qui renvoie 404 est pire qu'un
board absent — il inscrit au catalogue une entreprise qu'on ne collectera
jamais, et le silence de sa collecte se lira comme « cette entreprise ne
recrute pas ».

| | Lever | Greenhouse (2026-10-19) |
|---|---|---|
| Candidats sondés | 401 | 319 |
| Boards vivants | **31 (7,7 %)** | 63 (19,7 %) |
| dont ≥ 1 offre FR | **17** | 28 |
| Offres totales | 2 044 | 6 484 |
| Offres FR | **358 (17,5 %)** | 334 (5,2 %) |
| Timeouts / erreurs réseau | **0** | — |

**Lever porte moins d'entreprises et trois fois plus de France.** C'est
exactement le gisement que Greenhouse avait laissé ouvert.

Les 370 autres candidats ont répondu 404, et **aucun n'a expiré ni échoué en
réseau** : le relevé ne porte donc pas de faux négatif qu'un second passage
viendrait rattraper. Ils restent inscrits dans `scripts/lever/candidats.mjs` à
dessein — ce fichier est la trace de ce qui a été essayé, et sans elle le
prochain curateur retesterait les mêmes slugs morts en croyant les découvrir.

Le catalogue retenu (`api/_lib/lever-boards.js`), 17 boards, 358 offres FR :

```
Veepee 77 · Pigment 46 · Verkor 44 · Qonto 27 · Scaleway 27 · Veeva 21
360Learning 17 · Aircall 16 · Swile 15 · Malt 15 · Brevo 14
Vestiaire Collective 13 · Agicap 8 · BlaBlaCar 8 · Younited 7
Palantir 2 · Spotify 1
```

Contrôle : à la collecte suivante, le nombre constaté par entreprise
correspondait **exactement** au relevé du catalogue sur les 17 boards, écart
nul. (Deux jours plus tard, un troisième passage donne 331 au lieu de 358 :
des offres se pourvoient. `offresFR` est un relevé, pas une promesse.)

---

## 3. Ce que le collecteur rapporte, et ce qu'il n'invente pas

Mesuré par `scripts/lever/mesurer.mjs` sur les 17 boards :

```
Durée            20,0 s / 23,6 s / 31,5 s selon le passage
Offres           1 905 – 1 935
Boards en échec  0
Pays établi      INTL 63,4 %  ·  FR 18,5 %  ·  EU 17,9 %  ·  null 0,2 %
```

**Ce que le collecteur laisse à `null`, sur les 358 offres françaises :**

| Champ | `null` | Pourquoi |
|---|---|---|
| `salary` | **358 / 358 — 100 %** | L'API Lever ne porte **aucun** champ de salaire. Vérifié sur la totalité des clés rendues. |
| `type` (contrat) | **162 / 358 — 45,3 %** | `commitment` est du texte libre ; ce qui n'est pas du vocabulaire reconnu vaut `null`. |
| `country` | **3 / 1 935 — 0,2 %** | Lieu non reconnu **et** code pays absent ou mal formé. |
| `date` | **0** | `createdAt` est toujours présent. |

Contrats effectivement lus sur les offres françaises : CDI 117, Stage 66,
CDD 11, Freelance 1, Alternance 1. Soit **54,7 % de contrats lisibles**, contre
42,2 % chez Greenhouse — Lever est plus structuré, mais pas au point de
remplir le champ partout, et le dire est l'information.

---

## 4. Les deux pièges que la mesure a attrapés

### 4.1 « contrat à durée INdéterminée » contient « déterminée »

Le même piège que `unbefristet`/`befristet` et `unlimited`/`contract`, **une
troisième fois, en français**. Le mot long porte le mot court : un test par
sous-chaîne dans le mauvais ordre rend CDD pour les offres les plus clairement
CDI du lot. Ce n'est pas une imprécision, c'est une **inversion de sens**.

Le garde est posé dans `api/_lib/contrat.js`, au même endroit et dans le même
ordre que ses deux prédécesseurs — jamais en local dans le collecteur, sinon le
prochain collecteur retombe dedans.

`categories.commitment` porte **38 valeurs distinctes** sur les 31 boards
vivants. Sans ce bloc, « CDI » et « CDD » valaient tous les deux `null` : le
vocabulaire français n'était écrit nulle part, sur un site d'emploi français.
Quatre autres valeurs échappaient aussi aux bornes de mot existantes —
`Freelancer` (≠ `freelance`), `Contractor` (≠ `contract`), `Fixed term` et
`Fixed-Term` (sans le mot `contract`).

**Ce qui reste `null` à dessein**, et ce n'est pas une lacune :

- **`Remote`** — relevé **dans** le champ `commitment`. Ce n'est pas un
  contrat, c'est un lieu de travail. C'est exactement la faute que le
  collecteur Remotive commettait en écrivant « Remote » dans le champ contrat.
- **`Full Time`, `Part-Time`** — une durée de travail. Elles sortent par
  `tempsLever`, dans leur propre champ, qui ne touche jamais `type`.
- **`Interim`** — une mission d'intérim n'est aucun de nos cinq contrats. Le
  dépôt l'a déjà tranché pour France Travail (`MIS` → `null`) ; on ne décide
  pas l'inverse ici.
- **`Working Student`, `CLT`, `GE Employee`, `FR Executive/Cadre`,
  `Short term`** — un statut étudiant allemand, un régime brésilien, deux
  catégories internes et une durée vague.

Une imprécision assumée et signalée : `internship or apprenticeship` sort
« Stage ». L'employeur écrit « ou » ; trancher est un choix par défaut. Une
seule valeur sur 38, pinnée par la sonde plutôt que corrigée par une règle
taillée pour elle.

### 4.2 Un bureau français listé en second ne rend pas une offre française

`categories.allLocations` liste plusieurs villes. Mesuré : **6 offres non
françaises listent la France dans `allLocations`** — par exemple
`country: "DE"`, `location: "Berlin"`,
`allLocations: ["Berlin","Barcelona","Milan","Paris","Madrid"]`.

S'en servir pour établir « France » rendrait française toute offre ouverte à
plusieurs bureaux dont l'un est à Paris. C'est le piège d'`offices` chez
Greenhouse, à l'identique. **`allLocations` n'entre donc pas dans le calcul du
pays.**

### 4.3 Le champ `country`, lui, tient — et c'est mesuré

Chez Greenhouse, le champ pays déclaré **mentait** : « Job Posting Country =
France » portait un poste à Berlin, parce qu'il nommait l'entité qui publie.
La tentation était donc de traiter le `country` de Lever avec la même méfiance.
La sonde a compté ses désaccords avec le lieu :

- **63 offres** `country: "FR"` sur un lieu absent de la liste de villes —
  Saint-Denis, Le Thillay, Mitry-Mory, Saint Vulbas, Blanc-Mesnil. Ce sont de
  **vraies communes françaises**, et le code ISO est le seul champ qui le dise.
  Il ne contredit pas le lieu : il **rattrape** ce que la liste de villes ignore.
- **1 seule offre** dans l'autre sens, et `country` y est **vide** :
  `location: "London, Paris, Toronto, New York"`.

D'où l'ordre retenu dans `paysLever` : le lieu quand il nomme la France ou une
ville reconnue, le lieu quand il nomme explicitement un autre pays, **puis** le
code ISO pour tout ce que le lieu ne permet pas de conclure. Un lieu étranger
explicite l'emporte toujours sur un code contraire — la leçon Greenhouse est
conservée — mais le code fait le travail que le texte libre ne peut pas faire.

---

## 5. Le recouvrement — et le chiffre qu'il a fallu corriger

**C'est la partie la plus importante de ce rapport, parce que le premier
chiffre était faux dans le sens flatteur.**

### Le premier relevé, sur `page=0` seulement

```
Offres distinctes rendues par emploia : 188
Offres Lever en France                : 358
  déjà rendues                        :  35  ( 9,8 %)
  ABSENTES                            : 323  (90,2 %)
```

90,2 %. Spectaculaire, et faux.

### Le contre-test l'a démenti dans l'heure

`scripts/lever/contre-test-pagination.mjs` repagine les plus gros boards
jusqu'à épuisement :

| Entreprise | emploia, 11 pages | dont de l'entreprise | Lever en France |
|---|---|---|---|
| Veepee | 95 offres | **61** | 77 |
| Pigment | 73 | **15** | 46 |
| Verkor | 75 | **43** | 44 |
| Qonto | 72 | **41** | **27** |

Qonto : emploia rend **41** offres Qonto distinctes là où Lever n'en porte que
27. Verkor : 43 sur 44. La production **borne chaque source par page**
(Greenhouse à 10, les offres employeurs à 5, France Travail à 8) ; mesurer sur
une seule page ne mesure donc pas la couverture, elle mesure **la taille d'une
page**.

### Le relevé refait, pagination remontée DANS le protocole

```
25 requêtes, 251 pages, entreprise par entreprise par le nom exact
Offres distinctes rendues par emploia : 1 512
Offres Lever en France                :   331
  déjà rendues                        :   193  (58,3 %)
  ABSENTES                            :   138  (41,7 %)

Entreprises Lever avec offres FR : 16 — dont 16 déjà présentes chez emploia
```

**41,7 %, pas 90,2 %.** La pagination est désormais dans
`scripts/lever/recouvrement.mjs` et non dans un contre-test à côté : un
protocole ne se cite pas, il se rejoue.

### Ce que cela change, et ce que cela ne change pas

**Lever apporte moins que Greenhouse ne semblait apporter.** Il faut le dire
franchement, et il faut dire aussi pourquoi la comparaison est piégée : **le
76,9 % de Greenhouse a été mesuré sur `page=0`**, par un script qui ne pagine
pas. Sur ce même protocole, Lever donne 90,2 % — donc *meilleur* que
Greenhouse. Sur le protocole paginé, Lever donne 41,7 %. Le §6 remesure
Greenhouse à la même règle pour que la comparaison existe.

Ce que le recouvrement ne retire pas, même à 100 % :

1. **L'URL.** Lever est placé **avant** les sources tierces, et
   `deduplicate()` garde la **première** occurrence. Les 193 offres en
   recouvrement sortent donc avec l'URL de la page de candidature de
   l'employeur au lieu de celle du republicateur. C'est l'apport qui subsiste
   là où le compte d'offres ne dit plus rien.
2. **La fiabilité.** `causesEnEchec` relevé en production le 2026-10-21 :
   `France Travail: cle_absente`, `Greenhouse: collecte_absente`,
   `French Job Market: http_429`, `Internships: http_404`,
   `JSearch: http_429`. **Cinq sources sur dix sont muettes**, et emploia sert
   sur Adzuna seule. Un collecteur sans clé, sans quota et à 0 échec de board
   sur trois passages n'est pas un complément : c'est de la redondance là où
   il n'y en a plus.
3. **Les 138 offres réellement absentes** restent 138 offres françaises
   d'entreprises que les candidats connaissent.

---

## 6. Lever contre Greenhouse, au même protocole

Pour que la comparaison tienne, le recouvrement Greenhouse a été **rejoué
paginé** (copie jetable du script, le fichier du dépôt n'est pas touché ;
Greenhouse étant en `collecte_absente` en production, il est mesuré contre la
même base qu'avant son branchement).

```
34 requêtes, paginées jusqu'à épuisement
Offres distinctes rendues par emploia : 1 555
Offres Greenhouse en France           :   336
  déjà rendues                        :   135  (40,2 %)
  ABSENTES                            :   201  (59,8 %)

Entreprises Greenhouse avec offres FR : 27 — dont 18 déjà présentes chez emploia
```

**Le 76,9 % annoncé par la PR 99 vaut 59,8 % au protocole paginé.** L'écart
n'est pas un reproche : le contre-test de cette PR montrait bien un trou réel
(11 pages sur « Doctolib » rendaient 10 offres quand l'ATS en portait 76). Mais
le POURCENTAGE global était mesuré sur une page, et il était gonflé d'un tiers.

### La comparaison, au même protocole

| | **Greenhouse** | **Lever** |
|---|---|---|
| Offres FR collectées | 336 | 331 |
| **Absentes d'emploia (paginé)** | **201 — 59,8 %** | **138 — 41,7 %** |
| Entreprises avec offres FR | 27 | 16 |
| **dont inconnues d'emploia** | **9** | **0** |
| Densité FR de la collecte | 5,2 % | **17,4 %** |
| Contrat lisible | 42,2 % | **54,7 %** |
| Durée de collecte | **10,1 s** | 20 – 31,5 s |
| Boards vivants / candidats | **19,7 %** | 7,7 % |

**Lever apporte moins que Greenhouse, et il faut le dire sans détour.** Moins
d'offres absentes (41,7 % contre 59,8 %), deux fois moins d'entreprises, un
taux de boards vivants deux fois et demie plus faible, et une collecte trois
fois plus lente.

**Et surtout : Lever n'apporte AUCUNE entreprise nouvelle.** Les 16 sont déjà
dans les résultats d'emploia. Greenhouse en apportait 9 sur 27. C'est le
chiffre le plus instructif du rapport, parce qu'il réoriente la suite : ce
qu'emploia gagne chez Lever, ce sont des offres supplémentaires d'employeurs
qu'il connaît déjà — utile, mais ce n'est pas élargir le catalogue.

Ce que Lever gagne en revanche, et qui n'est pas rien : il est **trois fois
plus dense en France**, il lit **le contrat sur une offre de plus sur huit**,
et il est **la seule source du lot à 0 échec sur trois passages** quand cinq
des dix collecteurs sont muets en production.

**Verdict : oui, mais comme un renfort, pas comme une découverte.** 138 offres
françaises réelles, 193 URL d'employeur reconquises sur les agrégateurs, et une
source qui ne tombe pas. À ce prix — un fichier collecteur, un catalogue, et
zéro cron supplémentaire — ça se garde.

---

## 7. L'intégration livrée

### Un seul cron pour tous les ATS

Le dépôt comptait dix crons, dont `collect-greenhouse`. Il en compte toujours
**dix** : `collect-greenhouse` est devenu `collect-ats`, qui parcourt le
registre de `api/_lib/ats.js`.

**Il faut retirer une mauvaise raison avant de donner la bonne.** « Le plan
Hobby plafonne le nombre de crons » : **il ne le fait pas.** Vérifié sur la
page de tarification des crons de Vercel — Hobby autorise **100 crons par
projet**, autant que Pro et Enterprise. Ce que Hobby interdit est la
**fréquence** : une exécution par jour au plus, précision à l'heure près
(±59 min) — et c'est cette contrainte-là, pas le nombre, qui avait fait
échouer le déploiement de la PR 99 avec `0 */6 * * *`. Un onzième cron aurait
été permis. Justifier l'architecture par une limite inexistante serait
exactement la devinette que `_lib/contrat.js` interdit pour la donnée.

La bonne raison : **un ATS de plus ne doit coûter qu'une ligne.** Un
fournisseur déclare son nom, sa clé KV, son catalogue et sa fonction de
collecte ; le cron applique les trois mêmes gardes à tous. Quand Teamtailor
viendra, il n'y aura ni cron à écrire, ni heure à choisir, ni garde à recopier
— et c'est le recopiage qui fait diverger les gardes.

**Une clé KV par fournisseur, pas une clé partagée.** C'est ce qui permet à
`causesEnEchec` de nommer Greenhouse et Lever séparément. Une clé commune
rendrait les deux pannes indiscernables — précisément le silence que
`causesEnEchec` est venu retirer.

### La contrainte qui casse un déploiement, deuxième édition

Greenhouse 10,1 s + Lever 20,0 à 31,5 s ≈ **34 s**, et **Lever seul a dépassé
25 s sur un passage**. Or une fonction en runtime Edge « must begin sending a
response within 25 seconds ».

Un cron Edge serait donc **tué en pleine collecte Lever**, et le pire est la
forme de la panne : la clé `lever_jobs` ne serait **jamais** écrite, la source
lirait `collecte_absente` à perpétuité, et rien n'en nommerait la cause réelle.

`collect-ats` tourne donc en **runtime Node** — seule déviation des neuf autres
crons du dépôt, et elle est mesurée, pas stylistique. Node plafonne à 300 s sur
Hobby, et `vercel.json` réserve 300 s à ce seul chemin pour que l'ajout d'un
troisième ATS ne découvre pas la borne par un 504.

**Le garde n°8 du dépôt a attrapé la faute avant le déploiement**, et il l'a
attrapée deux fois : une fois dans le code (handler de style Web sur runtime
Node), une fois dans le commentaire qui l'expliquait — il lit le fichier entier
sans exempter les commentaires, ce qui est la bonne façon de le faire.

### Les trois gardes, repris mot pour mot

1. **Une collecte vide n'écrase jamais une clé valide.** Si tous les boards
   tombent ensemble, écrire `offres: []` remplacerait un relevé valide par du
   vide, et la page afficherait zéro offre en répondant 200.
2. **Le TTL de 72 h fait apparaître une panne de cron** au lieu de la masquer,
   via la cause dédiée `collecte_absente`. Trois exécutions quotidiennes
   manquées avant que la clé disparaisse.
3. **Le collecteur est placé avant les sources tierces**, pour que
   `deduplicate()` conserve l'URL de l'employeur.

Un quatrième, propre au cron unique : **un fournisseur qui explose n'emporte
pas les autres.** Sans ce garde, une exception dans Lever laisserait la clé de
Greenhouse non écrite, et deux sources mourraient pour le prix d'une.

### Ce qui a été écrit

| Fichier | Rôle |
|---|---|
| `api/_lib/lever.js` | Le collecteur : lieux, pays, contrat, date, normalisation, isolation par board |
| `api/_lib/lever-boards.js` | Le catalogue mesuré — 17 boards, relevé chiffré |
| `api/_lib/ats.js` | Le registre des fournisseurs + les trois gardes, écrits une fois |
| `api/cron/collect-ats.js` | Le cron unique, runtime Node, remplace `collect-greenhouse` |
| `api/_lib/contrat.js` | +59 lignes : vocabulaire Lever, piège `indéterminée`/`déterminée` |
| `api/jobs.js` | +63 lignes, **0 suppression** : `fetchLever`, placé avant les tiers |
| `scripts/lever/candidats.mjs` | 401 candidats, 404 compris, à dessein |
| `scripts/lever/verifier-boards.mjs` | Le sondage board par board + l'audit du champ `country` |
| `scripts/lever/mesurer.mjs` | Durée, densité FR, ce qui reste `null` |
| `scripts/lever/recouvrement.mjs` | Le recouvrement, **paginé**, clé extraite du vrai handler |
| `scripts/lever/contre-test-pagination.mjs` | Le contre-test qui a corrigé le chiffre |
| `scripts/smoke/lever.test.mjs` | **121 vérifications**, hors ligne, réseau injecté |
| `scripts/smoke/greenhouse.test.mjs` | Suit le cron généralisé — **97 vérifications** |
| `scripts/smoke/sources.mjs` | Entrée `Lever` séparée dans les absences connues |
| `vercel.json` | Cron → `collect-ats`, `maxDuration: 300` sur ce chemin |
| `package.json`, `ci.yml` | `test:lever` + 4 scripts de mesure, rattachés au job `guards` |

Le garde sur la clé de dédoublonnage a été **vérifié en le faisant échouer** :
une clé altérée dans une copie jetable fait sortir `recouvrement.mjs` en
code 1 avec « cette mesure est caduque », au lieu de publier un chiffre qui
aurait l'air juste.

**Une dette signalée, pas réglée.** `api/jobs.js` passe de 923 à **986
lignes**, au-delà du plafond souple de 800 du dépôt. Mes 63 lignes ne font
qu'étendre un dépassement préexistant, et je ne l'ai pas corrigé : extraire
les dix collecteurs dans `api/_lib/collecteurs/` est un refactor qui touche
tout le fichier, donc exactement ce qu'il ne faut pas glisser dans une PR
qu'une session parallèle doit pouvoir merger. À faire séparément, et après
elle.

---

## 8. Recommandation : le prochain ATS à viser

**Teamtailor** — mais le critère de décision a changé, et c'est le vrai apport
de ce rapport.

### Le critère : des entreprises nouvelles, pas plus d'offres

Lever a rendu **0 entreprise** qu'emploia ne connaissait pas. Greenhouse en
avait rendu **9 sur 27**. Un ATS qui ajoute des offres d'employeurs déjà
couverts rend la liste plus profonde ; un ATS qui ajoute des employeurs rend le
site utile à des candidats qu'il ne servait pas. **Le second vaut beaucoup plus
que le premier**, et c'est sur lui qu'il faut mesurer le prochain.

Le trou qui reste est nommé. Sur les treize scale-ups françaises que Greenhouse
n'avait pas, Lever en a rendu **quatre** (Qonto, Swile, Malt, BlaBlaCar). Les
neuf autres — Alan, Payfit, Pennylane, Spendesk, Ledger, Back Market,
Leboncoin, Mistral, OVHcloud — sont ailleurs, et ce sont précisément les
employeurs que les candidats français cherchent par leur nom.

### Pourquoi Teamtailor

1. **C'est l'ATS européen des entreprises de cette taille.** Greenhouse et
   Lever sont américains, et leur densité française le dit : 5,2 % et 17,4 %.
   Teamtailor est nordique et vend en Europe continentale. L'hypothèse à
   tester est une densité FR encore supérieure — **et surtout un recouvrement
   d'entreprises plus faible**, puisque ses clients sont rarement ceux des deux
   ATS américains que les agrégateurs republient déjà.
2. **Le registre est déjà prêt.** Ajouter un fournisseur coûte un
   `api/_lib/teamtailor.js`, un catalogue mesuré, et une entrée dans
   `FOURNISSEURS`. Ni cron, ni heure, ni garde à recopier. C'est le seul
   bénéfice d'architecture que cette PR laisse derrière elle, et il est réel :
   **le troisième ATS coûtera la moitié du second.**
3. **Chaque board Teamtailor est un sous-domaine nommé**
   (`entreprise.teamtailor.com`), ce qui rend le sondage des candidats plus
   fiable que le slug deviné de Lever. **7,7 % de boards vivants sur 401
   candidats** est un taux coûteux : 370 requêtes pour rien.

### Les deux mesures à exiger avant d'écrire une ligne

1. **Le recouvrement PAGINÉ dès le premier relevé.** Le chiffre sur `page=0`
   est flatteur et faux — 90,2 % au lieu de 41,7 % pour Lever, 76,9 % au lieu
   de 59,8 % pour Greenhouse. Un chiffre faux dans le bon sens est le plus
   dangereux de tous, parce que personne ne le conteste.
2. **Le recouvrement par ENTREPRISE, mis en avant et non en note.** C'est lui
   qui dit si l'ATS élargit le catalogue ou l'épaissit. S'il rend 0 entreprise
   nouvelle, le collecteur reste défendable — Lever l'est — mais il ne faut pas
   le vendre comme une découverte.

### Les pistes écartées, et pourquoi

- **Welcome to the Jungle** : son API publique couvre le marché français mieux
  qu'aucun ATS américain, mais **c'est un agrégateur**. L'URL servie ne serait
  plus celle de l'employeur, donc l'un des deux apports de toute cette famille
  de collecteurs disparaît. À considérer comme une neuvième source tierce, pas
  comme un troisième ATS.
- **Workday** : les gros employeurs français en dépendent, mais il faut un
  endpoint par tenant, la forme des données est bien moins propre, et rien n'y
  est public sans négociation. Après Teamtailor, si le besoin reste.

---

## 9. Ce qui ne peut être levé que par Hugo

1. **Le merge et le déploiement.** Rien n'est mergé, rien n'est déployé.
2. **`FRANCE_TRAVAIL_CLIENT_ID` / `_SECRET` sont lus par le code et absents de
   Vercel.** Hors du périmètre de cette branche, mais c'est la source la plus
   légitime du lot pour un site d'emploi français, et elle est morte faute d'un
   compte à ouvrir sur francetravail.io. Une session parallèle traite les deux
   `http_429` et le `http_404`.
3. **Le passage en plan Pro lèverait deux contraintes mesurées** : la fréquence
   quotidienne des crons (donc des offres rafraîchies plus d'une fois par jour)
   et la précision à l'heure près. À 23 € / mois, à mettre en face du fait que
   cinq sources sur dix sont actuellement muettes.
4. **La première exécution de `collect-ats`.** Après déploiement, les deux
   clés KV sont vides jusqu'à 4 h du matin : `causesEnEchec` affichera
   `collecte_absente` pour Greenhouse **et** Lever d'ici là. C'est normal et
   attendu — au-delà de 72 h, c'est une panne de cron.
