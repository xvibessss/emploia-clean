# Prototype — collecteur Ashby en direct

**Relevé du 2026-10-26, intégration du 2026-10-27.** Branche
`proto/ashby-ats`, coupée de `main` puis remise à jour (`0813c4c`).

Quatrième collecteur de la famille « crawl direct de l'ATS », après Greenhouse
(PR 99), Lever (PR 100) et Teamtailor (PR 108, **encore en revue**). Ashby
publie pour chaque board un endpoint JSON sans clé ni quota :
`api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true`.

**Les quatre chiffres à retenir, et le deuxième corrige le premier.**

1. **628 offres françaises**, plus que chacun des trois autres ATS
   (336 Greenhouse, 331 Lever, 228 Teamtailor), et **57,5 % absentes**
   d'emploia après pagination jusqu'à épuisement.
2. **Mais seulement 5 entreprises sur 33 (15,2 %) sont inconnues d'emploia** —
   contre 10 sur 19 chez Teamtailor. **Sur le critère de tête, Ashby fait moins
   bien que Teamtailor**, et il faut le dire avant tout le reste.
3. **J'avais écrit que les quatre scale-ups retrouvées étaient des employeurs
   qu'emploia ne servait pas. C'est FAUX, et la mesure l'a corrigé** : seule
   **Pennylane** l'était. Alan, Back Market et Ledger sont déjà dans les
   résultats, servis par les sources tierces. Le §5 détaille la correction.
4. Pennylane seule porte **153 offres françaises dont emploia sert ZÉRO** — la
   plus grosse contribution d'un employeur unique des quatre relevés.

> **Indépendance vis-à-vis de la PR 108.** Cette branche est coupée de `main`,
> pas de `proto/teamtailor-ats` : Ashby ne dépend pas de Teamtailor, seulement
> du registre, qui est sur `main` depuis la PR 100. Les deux PR peuvent donc
> être mergées dans n'importe quel ordre.
>
> **Et le conflit a été MESURÉ, pas supposé** — `git merge-tree` à blanc entre
> les deux branches. J'avais prévu trois endroits ; la réalité est meilleure :
> `api/jobs.js`, `api/_lib/ats.js`, `api/_lib/contrat.js` et
> `.github/workflows/ci.yml` fusionnent **tous proprement**. **Seul
> `package.json` conflicte**, sur des lignes voisines, et il se résout en
> gardant les deux entrées. Le placement des lecteurs en FIN de
> `_lib/contrat.js` — là où la PR 108 écrit dans la section SALAIRE plus haut
> — a donc fait son travail.

---

## 1. Ce n'est pas une intuition

Les trois relevés précédents ont convergé sur la même liste : huit scale-ups
françaises qu'aucun ATS crawlé n'avait — Alan, Pennylane, Spendesk, Ledger,
Back Market, Leboncoin, Mistral, OVHcloud. Le sondage de clôture du relevé
Teamtailor les a cherchées ailleurs et en a trouvé quatre chez Ashby.

Le relevé complet le confirme :

| Entreprise | Offres FR chez Ashby |
|---|---|
| **Pennylane** | **153** |
| **Alan** | **69** |
| **Back Market** | **29** |
| **Ledger** | **13** |
| Spendesk | board réel, **0 offre** |
| Leboncoin, Mistral, OVHcloud | HTTP 404 — sur aucun des six ATS sondés |

**264 offres françaises** pour ces quatre employeurs seuls — mais attention au
sens de ce chiffre. « Introuvable » voulait dire *sur les ATS crawlés*, pas
*absente d'emploia* : Alan, Back Market et Ledger sont déjà servies par les
sources tierces. **Seule Pennylane était réellement inconnue d'emploia, avec
153 offres.** Le §5 détaille la correction et ce qu'elle ne retire pas.

---

## 2. Le catalogue : le contenu décide, pas le code HTTP

C'est la règle que le relevé Teamtailor a ramenée. SmartRecruiters répond
HTTP 200 à tout, y compris au slug `zzz-entreprise-inexistante-xyz`, avec zéro
offre partout : un sondage sur le code y aurait inscrit huit entreprises
fantômes. Ashby se comporte bien — 404 pour un slug inconnu, 200 avec
`{"jobs":[]}` pour un board réel mais vide — **raison de plus pour ne pas s'y
fier par habitude**.

**428 candidats sondés un par un :**

```
130 lisibles
    116 portant au moins une offre
     14 RÉELS MAIS VIDES (200, zéro offre)
         spendesk, comet, alma, nickel, deel, stytch, launchdarkly,
         axiom, langfuse, figma, vercel, mercury, raycast, bolt
298 en HTTP 404
  0 timeout, 0 erreur réseau  → aucun faux négatif à rattraper
 33 portant au moins une offre FRANÇAISE → les seuls inscrits
```

Les 14 boards réels mais vides sont la raison d'être de la règle : ils
existent, ils répondent, et ils ne recrutent pas aujourd'hui. Le critère est de
porter une offre française, pas d'exister.

| | **Ashby** | Teamtailor | Lever | Greenhouse |
|---|---|---|---|---|
| Candidats sondés | 428 | 383 | 401 | 319 |
| Boards lisibles | 130 (30,4 %) | 40 (10,4 %) | 31 (7,7 %) | **63 (19,7 %)** |
| dont ≥ 1 offre FR | **33** | 19 | 17 | 28 |
| Offres du catalogue | 2 918 | 322 | 1 905 | 6 484 |
| **Offres FR** | **628** | 228 | 331 | 336 |
| Densité FR | 21,5 % | **70,8 %** | 17,4 % | 5,2 % |
| Durée de collecte | **5,9 s** | 5,1 s | 20–31,5 s | 10,1 s |
| Boards en échec | **0** | 0 | 0 | 0 |

**Ashby rend plus d'offres françaises que chacun des trois autres**, et son
taux de boards lisibles est le meilleur du lot — 30,4 % contre 7,7 % chez
Lever. Le catalogue porte 33 entreprises, le plus large des quatre.

Contrôle : à la collecte suivante, le nombre constaté par entreprise
correspondait au relevé sur les 33 boards (628 constatées contre 603 au
sondage de la veille — les boards bougent d'un jour à l'autre, et `offresFR`
est un relevé, pas une promesse).

---

## 3. Trois pièges, tous mesurés

C'est le plus riche des quatre en données, donc le plus piégeux.

### 3.1 `isRemote` contredit `workplaceType` — et inonderait toutes les pages ville

| | Offres |
|---|---|
| `isRemote: true` | **3 590** |
| dont `workplaceType` ≠ « Remote » | **2 253** |
| `workplaceType: "Remote"` | 1 344 |

Les 2 253 sont des postes **hybrides**, à Paris ou à Madrid. `isRemote` ne dit
pas « distanciel », il dit « pas strictement sur site ».

**La conséquence n'est pas cosmétique.** Dans `api/jobs.js`, le filtre de lieu
s'écrit :

```js
jobs.filter(j => !j.location || j.location.toLowerCase().includes(ll) || j.remote)
```

Une offre `remote: true` matche donc **tous** les filtres de lieu. Marquer ces
2 253 offres comme distancielles les ferait remonter sur chaque page ville —
exactement le « bloc fixe de 11 offres identique sur /emploi/limoges,
/emploi/amiens et /metier/coiffeur » que `filtrerPertinence` a été écrit pour
retirer, et à une échelle deux cents fois supérieure.

**On lit `workplaceType`, jamais `isRemote`.** Les trois valeurs constatées
sont « Remote », « Hybrid », « OnSite ». Sans `workplaceType`, le texte du lieu
décide — et `isRemote` n'est toujours pas consulté.

### 3.2 La rémunération se heurte à un choix de l'employeur

Ashby est le seul des quatre ATS à poser un **drapeau de consentement** :
`shouldDisplayCompensationOnJobPostings`. L'employeur y déclare s'il veut que
la rémunération paraisse sur l'annonce.

| | Offres |
|---|---|
| drapeau à `true` | 3 114 |
| **données présentes avec le drapeau à `false`** | **0** |

Ashby caviarde donc lui-même. **On vérifie le drapeau quand même** : s'en
remettre au caviardage de l'API pour respecter une décision humaine serait s'en
remettre à un détail d'implémentation, et le jour où il changerait, emploia
publierait un montant qu'un employeur avait refusé de montrer.

**Deux autres filtres, et le premier est une faute de catégorie.**
`compensationTierSummary` est une chaîne toute faite qui mélange les genres :

```
"€46K – €53K • €18K – €27K Equity"
```

La publier comme salaire présenterait 27 k€ d'actions comme de la paie. On
descend donc dans les composants typés, et on ne retient que `Salary`. Les cinq
types relevés : **Salary, Bonus, Commission, EquityCashValue,
EquityPercentage**.

Puis l'intervalle et la devise, comme chez Teamtailor mais en bien plus large :

| Champ | Valeurs relevées |
|---|---|
| `interval` | **1 HOUR, 1 WEEK, 1 MONTH, 1 YEAR, NONE** |
| `currencyCode` | AED, AUD, BRL, CAD, **EUR**, GBP, INR, JPY, KRW, MXN, PLN, RON, SEK, SGD, USD, et 2× `null` |

L'affichage du dépôt est en « k€/an », écrit en dur. Seuls `1 YEAR` + `EUR`
passent. **Restent 76 salaires publiés** sur les offres françaises — trois fois
ce que Teamtailor avait rendu, et le premier volume réel de la famille.

### 3.3 Le pays et le texte se contredisent dans les DEUX sens

Une première dans cette famille.

| Désaccord | Offres | Exemples |
|---|---|---|
| pays = France, texte muet | **87** | Aix-en-Provence, Brest, Annecy, Saint-Etienne, Chambéry, Bourg en Bresse |
| texte français, pays ≠ France | **41** | `European Union` / « Paris, France; Bordeaux, France; Lyon, France » |

Chez Lever et Teamtailor, le code pays **rattrapait** le texte et passait donc
devant. Ici il se trompe aussi, et dans l'autre sens. La règle est donc
l'**union** des deux signaux : une offre est française si le texte le dit **ou**
si le pays le dit.

Ce n'est pas un relâchement. Deux champs partiellement faux dans des directions
opposées se complètent, là où un seul perdrait des offres réelles — 87 d'un
côté, 41 de l'autre.

**« European Union » mérite sa ligne** : ce n'est pas un pays, c'est une
région, et Ashby l'écrit dans le champ pays, sur 13 offres d'Alan à elles
seules. Il vaut EU et **jamais FR**, sans quoi toute offre européenne
deviendrait française.

Et une règle de Greenhouse ne transfère pas : là-bas, un segment nommant un
pays de l'Union n'était pas français. Ashby écrit « Anywhere in France,
Belgium, Spain », qui nomme la France **et** deux autres pays et désigne bel et
bien un poste faisable en France. La France nommée gagne donc toujours ; une
ville française seule ne gagne que si aucun autre pays n'est nommé — ce qui
écarte « Paris, Texas, United States ».

### 3.4 Et une offre dépubliée n'est pas servie

`isListed: false` est une annonce que l'employeur a **retirée** de son site
carrière. La servir serait publier ce qu'il a dépublié. Deux offres écartées à
ce titre au relevé.

---

## 4. Ce que le collecteur n'invente pas

Sur les 628 offres françaises :

| Champ | `null` | Pourquoi |
|---|---|---|
| `type` (contrat) | **493 — 78,5 %** | `employmentType` vaut « FullTime » sur la majorité, ce qui est une DURÉE et non un contrat |
| `salary` | **552 — 87,9 %** | Refusé par l'employeur, equity, mensuel, ou hors EUR |
| `country` (toutes offres) | 44 — 1,5 % | Ni texte ni pays reconnaissables |
| `date` | **0** | `publishedAt` est servi partout, déjà en ISO |

Contrats lus : Stage 62, CDD 57, Freelance 15, CDI 1. Le CDI quasi absent est
une conséquence directe du point précédent — Ashby ne dit pas « CDI », il dit
« FullTime », et les confondre serait la faute que `_lib/contrat.js` existe
pour interdire.

Le vocabulaire de contrat n'a eu besoin d'**aucune ligne nouvelle**, troisième
fois d'affilée : l'énumération d'Ashby passe entière par `contratDepuisTexte`.

---

## 5. Le recouvrement

Protocole identique aux trois relevés précédents, et délibérément défavorable
au prototype : l'API de production est interrogée **entreprise par entreprise
par le nom exact, et paginée jusqu'à épuisement** — 41 requêtes. La clé de
comparaison est celle de `deduplicate()`, extraite du vrai `api/jobs.js` et
exécutée telle quelle, avec un garde qui fait échouer la mesure si cette clé
change.

### Ce que le catalogue ÉLARGIT — le chiffre de tête

```
Entreprises Ashby avec offres FR : 33
  INCONNUES d'emploia             :  5  (15,2 %)
  déjà présentes                  : 28
Offres portées par les entreprises nouvelles : 169 / 628
```

| Entreprise inconnue d'emploia | Offres FR |
|---|---|
| **Pennylane** | **153** |
| Notion | 7 |
| Lifen | 6 |
| Temporal | 2 |
| Mollie | 1 |

| | Greenhouse | Lever | **Teamtailor** | Ashby |
|---|---|---|---|---|
| Entreprises FR | 27 | 16 | 19 | **33** |
| dont inconnues | 9 (33 %) | 0 | **10 (52,6 %)** | 5 (15,2 %) |

**Sur ce critère, Ashby fait moins bien que Teamtailor.** 15,2 % contre 52,6 %.
Il faut le dire dans cet ordre.

### La correction que la mesure m'a imposée

J'avais écrit, dans le commit de mesure et dans le §1 de ce rapport, que les
quatre scale-ups retrouvées chez Ashby représentaient « 264 offres d'employeurs
qu'emploia ne servait pas ». **C'est faux.**

Les huit « introuvables » étaient introuvables **sur les ATS crawlés** — pas
absentes d'emploia. Alan, Back Market et Ledger sont déjà dans les résultats,
servies par les sources tierces. Seule **Pennylane** était réellement inconnue.
Le chiffre juste est **153**, pas 264.

### Mais « déjà présente » ne veut pas dire « bien servie »

Et c'est là que le compte binaire par entreprise montre sa limite. Le
contre-test de pagination :

| Entreprise | emploia, 11 pages | dont de l'entreprise | Ashby en FR |
|---|---|---|---|
| **Pennylane** | 43 offres | **0** | **153** |
| **Alan** | 41 | **5** | **69** |
| Back Market | 73 | 27 | 29 |
| Voodoo | 101 | 64 | 80 |

**Alan est comptée « déjà présente » alors qu'emploia ne sert que 5 de ses 69
offres.** Back Market et Voodoo, en revanche, sont bien couvertes — 27 sur 29
et 64 sur 80.

Le critère « entreprise connue / inconnue » est donc un instrument plus
grossier que je ne l'ai présenté au relevé Teamtailor. Il répond bien à « ce
catalogue élargit-il la liste des employeurs ? », mal à « ces employeurs
sont-ils servis ? ». Les deux chiffres se lisent ensemble, et le contre-test
est celui qui tranche.

### Ce que le catalogue APPROFONDIT — offre par offre

```
Offres Ashby en France : 628
  déjà rendues         : 267  (42,5 %)
  ABSENTES             : 361  (57,5 %)
  dont avec salaire    :  76
```

| | Greenhouse | Lever | Teamtailor | **Ashby** |
|---|---|---|---|---|
| Absentes (paginé) | 59,8 % | 41,7 % | **83,3 %** | 57,5 % |
| Offres absentes, en nombre | 201 | 138 | 190 | **361** |

**361 offres françaises réelles**, le plus gros apport brut des quatre.

### L'état de la production au moment de la mesure

```
France Travail      cle_absente
French Job Market   quota_epuise
JSearch             quota_epuise
```

Trois sources muettes sur onze.

---

## 6. Un défaut trouvé en chemin, et réparé

**`scripts/smoke/greenhouse.test.mjs` était ROUGE sur `main`**, et il l'était
devenu sans qu'une ligne de code change.

L'heure de passage de la balise y était figée à `2026-10-23T04:00:00.000Z`.
L'assertion de bout en bout appelle le vrai `fetchGreenhouse`, qui appelle
`causeDepuisBalise(balise, 'Greenhouse')` **sans troisième argument**, donc avec
`Date.now()`. Passé le TTL des clés d'offres — 72 h — la balise cesse
d'expliquer quoi que ce soit et la cause retombe à `collecte_absente`. C'est le
comportement **voulu** du module ; c'était le test qui vieillissait.

La sonde était donc verte le 23 octobre, jour de son écriture, et fausse le 26
au matin. Vérifié sur `main` sans aucune de mes modifications : même échec.

Le correctif tient en une ligne — `Date.now() - 3600 * 1000` — et il est dans
son propre commit, parce que ce n'est pas mon défaut.

**Une sonde qui pourrit au calendrier est pire qu'une sonde absente** : elle
occupe la place, puis elle accuse la première branche qui passe. Celle-ci
aurait accusé la mienne.

---

## 7. L'intégration livrée

### Le quatrième ATS n'a coûté aucun cron

`api/_lib/ats.js` gagne **quatorze lignes**, `api/cron/collect-ats.js`
**zéro**. C'est la troisième fois que la promesse du registre tient, et le coût
ne monte pas.

Les collectes enchaînées font **~40 s** (Greenhouse 10,1 + Lever 20–31,5 +
Ashby 5,9), loin sous les 300 s réservées à ce chemin dans `vercel.json`. Le
cron reste en runtime Node : une fonction Edge doit répondre en 25 s.

La sonde ne compte pas les crons du dépôt — un autre peut légitimement en
ajouter, et `collect-rapidapi` l'a fait — elle vérifie qu'**aucun cron ne porte
le nom d'un ATS**.

### Les gardes, hérités sans être recopiés

Une collecte vide n'écrase jamais une clé valide ; le TTL de 72 h fait
apparaître une panne de cron ; un fournisseur qui explose n'emporte pas les
autres ; le collecteur passe avant les sources tierces pour que
`deduplicate()` garde l'URL de l'employeur. Tous vivent dans
`collecterFournisseur`, écrits une fois.

**Une clé KV par fournisseur** — `ashby_jobs` s'ajoute à `greenhouse_jobs` et
`lever_jobs` — pour que `causesEnEchec` les nomme séparément, et la balise de
passage distingue « cron jamais passé » de « passé, crawl mort », fournisseur
par fournisseur.

### Le diff

**Purement additif, zéro suppression, sur tous les fichiers partagés :**

| Fichier | Diff |
|---|---|
| `api/jobs.js` | **+56 / −0** |
| `api/_lib/contrat.js` | **+69 / −0** |
| `api/_lib/ats.js` | **+14 / −0** |
| `scripts/smoke/sources.mjs` | **+1 / −0** |
| `.github/workflows/ci.yml` | **+2 / −0** |
| `package.json` | **+5 / −0** |

Plus six fichiers neufs : le collecteur, le catalogue, la sonde (**126
vérifications**) et les quatre scripts de mesure. Et le correctif d'une ligne
du §6, dans son commit séparé.

**23/23 gardes de `ci.yml` verts en local**, le correctif compris.

---

## 8. Recommandation

**Arrêter d'ajouter des ATS, et s'attaquer au goulot : la découverte des
boards.**

### Pourquoi le quatrième ATS est le dernier qui vaille

Le rendement par entreprise NOUVELLE, sur les quatre relevés :

| | Greenhouse | Lever | Teamtailor | Ashby |
|---|---|---|---|---|
| Entreprises nouvelles | 9 | **0** | 10 | 5 |
| Candidats sondés | 319 | 401 | 383 | 428 |
| **Entreprises nouvelles par 100 candidats** | 2,8 | **0** | 2,6 | 1,2 |

Mille cinq cent trente et un slugs devinés, pour vingt-quatre entreprises
nouvelles. **Le coût n'est pas dans le collecteur — il est dans la liste de
candidats.** Chaque relevé a deviné 400 noms pour en garder 20 à 33, et les
mêmes entreprises reviennent d'un ATS à l'autre parce que c'est moi qui les
retape.

### Ce qu'il faut construire à la place

Le vrai levier est de **savoir quelle entreprise utilise quel ATS**, au lieu de
le deviner. Deux voies, par ordre de coût :

1. **Sonder une liste d'entreprises françaises contre les QUATRE ATS d'un
   coup.** Le registre rend ça presque gratuit : un script qui prend un nom et
   essaie les quatre endpoints. Il n'y a plus de collecteur à écrire — il n'y a
   qu'à élargir l'entrée. Une liste publique d'entreprises tech françaises
   (annuaire French Tech, Societe.com, Crunchbase export) remplacerait mes
   quatre listes manuscrites de 400 noms.
2. **Lire le `Link`/`meta` des sites carrière.** Une page carrière qui tourne
   sur Ashby, Lever ou Teamtailor le dit dans son HTML. Partir des entreprises
   plutôt que des slugs inverse le problème.

### Et les trois qui restent hors de portée

Leboncoin, Mistral et OVHcloud répondent 404 sur les **six** ATS sondés. Ce
sont des sites carrière maison ou des Workday à tenant privé. Un scraper HTML
par entreprise les atteindrait, au prix d'une fragilité par site — à ne pas
tenter tant que le point 1 ci-dessus n'est pas fait, parce qu'il coûte moins et
rapporte plus.

### Les quatre règles de mesure, maintenant stabilisées

1. **Paginer dès le premier relevé** (Lever : 90,2 % → 41,7 %).
2. **Compter les entreprises, en tête du rapport** (Lever : 0 sur 16).
3. **Vérifier le CONTENU d'un board, jamais son code HTTP** (SmartRecruiters
   répond 200 à tout).
4. **NOUVELLE — « entreprise déjà présente » ne veut pas dire « bien
   servie ».** Le contre-test par entreprise doit accompagner le compte, sinon
   Alan passe pour couverte avec 5 offres sur 69.

---

## 9. Ce qui ne peut être levé que par Hugo

1. **Le merge et le déploiement.** Rien n'est mergé, rien n'est déployé. Et
   **la PR 108 (Teamtailor) est toujours ouverte** : les deux sont
   indépendantes et mergeables dans n'importe quel ordre, au prix du petit
   conflit textuel décrit en tête de ce rapport.
2. **Le correctif du §6 vaut d'être mergé même si le reste ne l'est pas.**
   `main` est rouge sur `scripts/smoke/greenhouse.test.mjs` aujourd'hui, et
   toute branche qui en part le sera.
3. **La première exécution de `collect-ats`.** Après déploiement, `ashby_jobs`
   est vide jusqu'à 4 h du matin : la cause déduite de la balise d'ici là.
   Normal — au-delà de 72 h, c'est une panne de cron.
4. **Deux dates figées subsistent dans `scripts/smoke/rapidapi.test.mjs`**
   (`2026-10-19`, `2026-10-21`, `2026-10-26`). Elles sont vertes aujourd'hui,
   et je ne les ai pas touchées — c'est la sonde d'une autre session. Mais le
   motif est le même que celui du §6, et il mérite un coup d'œil de qui l'a
   écrite.
5. **La dette de commentaires**, signalée au relevé Teamtailor et toujours là :
   plusieurs fichiers parlent de « neuf collecteurs » quand le dépôt en a onze.
   La vraie correction est de cesser d'écrire le compte en prose, puisque
   `FOURNISSEURS.length` le connaît.
