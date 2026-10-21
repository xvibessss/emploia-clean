# Prototype — collecteur Greenhouse en direct

**Relevé du 2026-10-19.** Branche `proto/greenhouse-ats`. **Mise à jour :** le
collecteur est désormais intégré — cron d'ingest, clé KV, lecture dans
`api/jobs.js` — voir la section 8. Rien n'est déployé ni poussé ; la condition
bloquante de la section 6 est levée par cette intégration.

**Question posée :** un collecteur qui crawle l'ATS Greenhouse à la source
apporte-t-il à emploia des offres françaises que les huit API tierces
actuelles ne rendent pas ?

**Réponse : oui, et largement — mais le collecteur n'est pas le goulot.**
257 des 334 offres françaises trouvées (**76,9 %**) ne sont pas servies par
emploia aujourd'hui, y compris quand on lui demande l'entreprise par son nom
exact et qu'on paginate jusqu'au bout. Le facteur limitant n'est pas la
qualité du collecteur, c'est la taille du catalogue de boards — et la mesure
dit précisément quel travail le rendrait rentable.

---

## 1. Ce qu'on a miné chez freehire

`strelov1/freehire` (MIT, Go) porte ~300 adaptateurs pour 92 plateformes. On
n'en a porté aucune ligne : on a lu le CONTRAT.

**L'interface `Source` tient en deux méthodes** (`internal/ingest/sources/source.go`) :

```go
type Source interface {
    Provider() string                                        // la clé de plateforme
    Fetch(ctx, e CompanyEntry) ([]Job, error)                // toutes les offres d'UN board
}
```

Un adaptateur reçoit une `CompanyEntry{Company, Provider, Board, Region}` et
rend des `Job` bruts. Quatre interfaces optionnelles se greffent dessus
(`StreamingSource`, `HydratingSource`, `CoverageGated`, `CompanyDescriber`) —
aucune n'est nécessaire pour Greenhouse, dont la liste rend tout en une requête.

**La règle qui compte, et c'est la même que la nôtre.** Les commentaires de
`Job` la répètent champ par champ : un adaptateur ne remplit `WorkMode`,
`Seniority`, `EmploymentType`, `Countries`, `SalaryMin` que si la plateforme
l'énonce dans un **champ structuré** — *« never a heuristic inferred from free
text »* — et laisse vide sinon, pour que le pipeline décide. C'est mot pour mot
la doctrine de `api/_lib/contrat.js` : ce qu'on reconnaît, on le cartographie ;
tout le reste vaut `null`.

Freehire distingue même trois absences là où nous en avons une : `Removed`
(la plateforme dit que l'offre est retirée), `Unreadable` (on n'a pas su lire)
et l'offre simplement non rendue. La différence décide si « je ne l'ai pas vue »
vaut preuve de retrait. Notre collecteur reprend cette distinction en petit :
un board qui répond 200 sans tableau `jobs` est **illisible**, pas vide.

**L'adaptateur Greenhouse est trivial** (`greenhouse.go`, ~130 lignes) : une
requête `GET /v1/boards/<board>/jobs?content=true`, sans clé, sans pagination,
la description incluse. C'est ce qui le rendait portable en une après-midi.

**Le catalogue n'est pas dans le dépôt.** `internal/boardcatalog` n'existe plus
en fichiers : les boards vivent en base Postgres, alimentés par
`cmd/add-board`, et les anciens `sources/*.yml` sont explicitement décrits
comme remplacés. Donc **aucune liste de boards français à récupérer** — il a
fallu la constituer, et c'est le vrai coût du prototype.

---

## 2. Le catalogue, board par board

319 slugs plausibles sondés (`scripts/greenhouse/candidats.mjs`), chacun
vérifié par une requête réelle :

| | |
|---|---|
| Candidats sondés | 319 |
| Boards qui répondent | **63** |
| Boards qui répondent 404 | 256 |
| Boards portant ≥ 1 offre en France | **28** |

Les 256 échecs restent dans le fichier à dessein : sans la trace de ce qui a
été essayé, le prochain curateur retestera les mêmes slugs morts en croyant
les découvrir.

Ce que le 404 nous apprend : **aucune des ETI et scale-ups françaises les plus
évidentes n'est sur Greenhouse.** Qonto, Alan, Swile, Payfit, Pennylane,
Spendesk, Ledger, BlaBlaCar, Back Market, Leboncoin, ManoMano, Veepee, Malt,
Mistral, Hugging Face, OVHcloud, Scaleway, Capgemini, Thales, Safran, L'Oréal,
LVMH — tous 404. Greenhouse est un ATS surtout anglophone ; les boîtes
françaises sont majoritairement ailleurs (Welcome to the Jungle, Lever,
Teamtailor, Workday, Taleo).

---

## 3. Ce que le collecteur rapporte

Mesuré par `npm run greenhouse:mesure`, avec le code qui tournerait en prod :

| | |
|---|---|
| Boards collectés | 28 |
| Durée totale | **10,1 s** |
| Clés d'API requises | **0** |
| Boards en échec | 0 |
| Offres rapportées | 6 484 |
| **dont localisées en France** | **334 (5,2 %)** |

Répartition par pays établi : `FR 334` · `EU 753` · `INTL 2 361` ·
`REMOTE 223` · **`non établi 2 813`**.

Les 2 813 « non établi » sont des lieux réels que la cartographie ne reconnaît
pas (« Žilina », « Bengaluru » hors liste, villes mineures). Ils valent `null`
et tombent en fin de tri — ils ne sont **pas** baptisés INTL par défaut, et
surtout pas FR parce que l'entreprise aurait un bureau à Paris.

Les quatre plus gros contributeurs portent 58 % des offres FR : Doctolib (76),
Datadog (50), SumUp (37), Mirakl (27). La queue est longue et fine : 12 boards
rendent 1 à 4 offres chacun.

**Couverture du contrat : 141 / 334 (42,2 %).** Greenhouse ne publie aucun
champ de contrat ; ce qui s'en approche est `metadata["Employment Type"]`, un
champ que l'employeur configure lui-même. Mesuré sur 747 offres de huit
boards : présent sur 19,4 % des offres, et **toutes venaient d'un seul board**.
Les 57,8 % restants sortent avec `type: null`, et c'est l'information exacte.

---

## 4. Le piège que la mesure a attrapé

Les quatre valeurs relevées du champ `Employment Type` :

| valeur | n | lu comme |
|---|---|---|
| `Unlimited Contract` | 108 | **CDI** |
| `Intern` | 33 | Stage |
| `Unbefristeter Vertrag` | 2 | CDI |
| `Working Student` | 2 | `null` |

**« Unlimited Contract » — contrat à durée *illimitée*, donc un CDI — contient
le mot `contract`.** C'est la valeur la plus fréquente du champ. La table de
correspondance de freehire (`greenhouseEmploymentType`) teste
`strings.Contains(v, "contract")` et la classerait **`contract`**, donc CDD
chez nous : une inversion de sens sur les 108 offres les plus clairement CDI du
lot, pas une imprécision.

C'est exactement le piège `unbefristeter` / `befristeter` que `contrat.js`
documente déjà, dans une autre langue. Le garde est donc posé au même endroit
et dans le même ordre — `unlimited` testé **avant** `contract` — dans
`contratDepuisTexte`, la source unique, et non dans le collecteur. Un garde
local aurait laissé le prochain collecteur retomber dedans.

C'est le seul changement apporté à un fichier existant : six lignes dans
`api/_lib/contrat.js`, plus `contratGreenhouse` / `tempsGreenhouse` /
`champMetadata`.

Deuxième correction venue de la mesure : l'offre Doctolib « Engineering Manager
— Observability » déclare `Job Posting Country = France` avec
`location = "Berlin, Berlin, Germany"`, et liste Aix-en-Provence, Nantes et
Paris dans ses `offices`. Le champ nomme **l'entité qui publie**, pas le lieu
du poste ; `offices` nomme **les bureaux rattachés**, pas celui où l'on
travaille. S'en servir pour établir « France » aurait rendu française toute
offre d'une entreprise ayant un bureau en France. Le lieu prime donc, et le
champ déclaré ne décide que là où il n'y a aucun lieu.

---

## 5. Le recouvrement — le chiffre qui décide

Protocole (`npm run greenhouse:recouvrement`), délibérément **défavorable au
prototype** : on n'interroge pas l'API de production sur des requêtes vagues,
mais **entreprise par entreprise, par son nom exact**, plus six requêtes
génériques. La clé de comparaison n'est pas inventée pour l'occasion : c'est
celle de `deduplicate()`, extraite du vrai `api/jobs.js` et exécutée telle
quelle, avec un garde qui fait échouer la mesure si cette clé change.

34 requêtes, 0 en repli démo, 0 en erreur, 393 offres distinctes rendues.

| | |
|---|---|
| Offres Greenhouse en France | 334 |
| **déjà servies par emploia** | **77 (23,1 %)** |
| **absentes de ce qu'emploia sert** | **257 (76,9 %)** |

**Le contre-test, parce que ce chiffre pouvait être un artefact.** L'API borne
chaque source (France Travail à 8 résultats, offres employeurs à 5…). Si
emploia connaissait les 76 offres Doctolib mais n'en rendait que 17 par page,
l'apport mesuré serait de la pagination, pas un trou. On a donc repaginé
jusqu'à épuisement :

| requête | offres distinctes sur 11 pages | dont de l'entreprise | Greenhouse en FR |
|---|---|---|---|
| Doctolib | 71 | **10** | **76** |
| Datadog | 68 | **4** | **50** |
| SumUp | 59 | **17** | **37** |

**Le trou est réel.** Onze pages de résultats sur « Doctolib » rendent dix
offres Doctolib. Le collecteur direct en trouve soixante-seize. Ce n'est pas
un plafond de pagination, c'est une absence de couverture.

**Et ce ne sont pas les entreprises qui manquent — ce sont leurs offres.**
26 des 28 entreprises apparaissent déjà dans les résultats d'emploia. Les API
tierces connaissent Doctolib ; elles en republient une poignée d'annonces.
L'ATS en porte dix fois plus.

### Les deux réserves, énoncées franchement

**La mesure surestime le recouvrement**, donc l'apport réel est supérieur à
76,9 %. La clé `title+company` écrase les quasi-doublons : les ~20 offres
SumUp « Conseiller(ère) commercial(e) terrain expérimenté(e) » comptent pour
une poignée de clés, et chacune marque « déjà vue » plusieurs offres distinctes.
Vingt des 77 recouvrements sont ce seul cas. C'est le sens conservateur, on le
garde tel quel.

**Ce qui est mesuré est ce qu'emploia SERT, pas ce que les tiers CONTIENNENT.**
Il est possible qu'Adzuna ou JSearch aient ces offres dans leur catalogue sans
les rendre pour ces requêtes. Pour le produit, la distinction ne change rien —
une offre non servie n'existe pas pour le candidat — mais elle interdit
d'écrire « les API tierces n'ont pas ces offres ». Elles ne les rendent pas.

---

## 6. Recommandation : oui, sous trois conditions

**Ça vaut le coup.** 257 offres françaises de plus, sans clé, sans quota, sans
coût marginal, en 10 secondes, avec un lien vers la page carrière de
l'employeur au lieu d'un agrégateur. Sur une surface où l'audit du 10 octobre
mesurait 10 à 19 offres pertinentes par page SEO, c'est un ordre de grandeur.

Mais trois conditions, et la première est bloquante.

### Condition 1 — ne jamais l'appeler dans le chemin de la requête *(bloquante — levée, voir §8)*

`api/jobs.js` tourne en runtime Edge avec des `withTimeout(…, 10000)` par
source. La collecte des 28 boards prend **10,1 s** à elle seule. Branchée comme
un neuvième collecteur en ligne, elle ferait expirer la requête — et à 60
boards elle serait trois fois pire.

Le dépôt a déjà la bonne forme : un cron (`api/cron/`) qui collecte et écrit
une clé KV, et `jobs.js` qui la lit comme il lit déjà `employer_jobs` via
`kvGet`. C'est une lecture KV, pas 28 requêtes HTTP. Le collecteur est déjà
écrit pour ça — `collecterGreenhouse` ne dépend de rien d'autre que `fetch`.

### Condition 2 — le catalogue est le livrable, pas le collecteur

334 offres, c'est une page de résultats bien remplie, pas une transformation.
Le collecteur est fini ; ce qui manque est la curation. Les 63 boards vivants
trouvés sur 319 candidats devinés disent le rendement : **une entreprise
inscrite ≈ 5 offres FR**, et il faut sonder dix slugs pour en trouver un
vivant.

Deux pistes avant d'élargir à l'aveugle :
- **Les autres ATS valent probablement plus pour la France.** Greenhouse rend
  5,2 % d'offres françaises — il brûle 6 484 offres pour en trouver 334. Les
  404 de ce relevé (Qonto, Alan, Swile, Payfit, Malt, Leboncoin…) sont sur
  Lever, Teamtailor, Recruitee, Welcome to the Jungle. Le même travail sur
  **Lever** rendrait sans doute un bien meilleur taux français, et le
  collecteur serait le frère jumeau de celui-ci.
- **Découvrir les boards au lieu de les deviner.** Freehire a
  `cmd/harvest-boards` et une spec `linkedin-board-discovery` pour cette raison
  exacte. Deviner 319 slugs pour en valider 63 ne monte pas en charge.

### Condition 3 — garder les deux gardes

`unlimited` avant `contract` dans `contratDepuisTexte`, et le lieu qui prime
sur le pays déclaré. Les deux sont verrouillés par la sonde ; les deux
viennent d'un cas réel observé, pas d'une précaution théorique. 57,8 % des
offres sortiront avec `type: null` et doivent continuer à le faire — sous
filtre `?type=cdi`, elles seront écartées, ce qui est le comportement correct
de `filtrerContrat`.

---

## 7. Ce qui a été écrit

| fichier | rôle |
|---|---|
| `api/_lib/greenhouse.js` | le collecteur : collecte, isolation des échecs, normalisation (231 l.) |
| `api/_lib/greenhouse-boards.js` | le catalogue : 28 boards vérifiés, avec leur relevé |
| `api/_lib/contrat.js` | **modifié** : garde `unlimited`, `contratGreenhouse`, `tempsGreenhouse`, `champMetadata` |
| `scripts/smoke/greenhouse.test.mjs` | sonde hors ligne, **62 vérifications** (`npm run test:greenhouse`) |
| `scripts/greenhouse/verifier-boards.mjs` | vérification board par board (`npm run greenhouse:boards`) |
| `scripts/greenhouse/candidats.mjs` | les 319 candidats sondés, 404 compris |
| `scripts/greenhouse/mesurer.mjs` | relevé du catalogue (`npm run greenhouse:mesure`) |
| `scripts/greenhouse/recouvrement.mjs` | la mesure du recouvrement (`npm run greenhouse:recouvrement`) |
| `scripts/greenhouse/contre-test-pagination.mjs` | le contre-test de pagination |

La sonde est hors ligne — le réseau est injecté — parce qu'une sonde qui
échoue quand un employeur retire son board n'apprend rien sur le code. Ce
qu'elle verrouille, dans l'ordre : deux boards en échec sur trois n'empêchent
pas le troisième de rendre ; « Unlimited Contract » reste un CDI ; un lieu non
reconnu ne devient pas la France ; la forme de sortie est celle des huit
autres collecteurs.

---

## 8. L'intégration livrée

La condition bloquante de la section 6 est tenue : **le collecteur ne tourne
jamais dans le chemin de la requête.**

```
/api/cron/collect-greenhouse   1×/jour à 4 h   28 boards → filtre FR → clé KV
         ↓
   greenhouse_jobs  (TTL 72 h, ~218 Ko)
         ↓
/api/jobs  →  fetchGreenhouse()  =  un kvGet, pas 28 requêtes HTTP
```

**La fréquence est imposée par le plan, pas choisie.** Le premier réglage était
`0 */6 * * *`, et il a fait **échouer le déploiement** de la PR 99 sur les deux
projets Vercel, avant même le build : le compte est en plan **Hobby**, où un
cron ne peut tourner qu'une fois par jour — *« cron expressions that would run
more frequently will fail during deployment »*. Les neuf autres crons du dépôt
sont tous quotidiens ou hebdomadaires, ce qui explique que personne n'avait
rencontré la contrainte.

Le coût est réel : les offres sont rafraîchies une fois par jour et non quatre,
donc une offre pourvue peut rester servie jusqu'à 24 h de plus. C'est
acceptable pour des offres d'emploi, qui restent ouvertes des semaines ; passer
en Pro lèverait la contrainte. L'heure n'est pas indifférente — 4 h du matin,
soit **avant** le cron d'alertes de 7 h, pour que les emails lisent un relevé
du jour. Hobby ne garantit la précision qu'à l'heure près (±59 min), ce qui
laisse deux heures de marge.

Et surtout : **la contrainte est désormais un test**. Une fréquence trop élevée
ne casse pas un test, elle casse un *déploiement*, ce qui ne se découvre
qu'après la poussée. `scripts/smoke/greenhouse.test.mjs` vérifie maintenant la
forme de l'expression cron — pour les **dix** crons du dépôt, pas seulement
celui-ci, parce qu'un garde qui ne couvre que le dernier ajouté laisserait le
prochain retomber dedans.

C'est la forme qu'avaient déjà les offres déposées par les employeurs
(`employer_jobs` + `fetchEmployerJobs`) ; la clé est simplement remplie par un
crawl au lieu d'un formulaire.

**Le cron** (`api/cron/collect-greenhouse.js`) refuse tout appel sans
`Authorization: Bearer $CRON_SECRET`, ne stocke que les offres dont le pays est
**établi** comme la France, et borne le relevé à 600 offres — mesuré à 668
octets par offre, soit 218 Ko aujourd'hui mais ~1,5 Mo à 200 boards, au-delà de
ce qu'un enregistrement Upstash accepte. La troncature est journalisée au lieu
d'être découverte par une écriture qui échoue.

**Deux gardes de sûreté, chacun pour une panne précise.**

*Une collecte vide n'écrase pas la clé précédente.* Si les 28 boards tombent
ensemble, écrire `offres: []` remplacerait un relevé valide par du vide, et la
page afficherait zéro offre Greenhouse en répondant 200. L'ancienne valeur vit
sur son TTL : périmée mais vraie.

*La clé expire au lieu de vivre indéfiniment.* 72 h pour un cron quotidien :
deux collectes consécutives peuvent échouer avant que la
source bascule dans `sourcesEnEchec` avec la cause **`collecte_absente`** — un
jeton ajouté au vocabulaire fermé, distinct de `cle_absente` qui se lirait
« il manque une variable d'environnement » et enverrait chercher la panne au
mauvais endroit. Un TTL infini aurait servi éternellement le dernier relevé
réussi, et une panne de cron serait restée invisible.

**Greenhouse est placé avant les sources tierces dans la liste des
collecteurs**, et six vérifications le verrouillent. `deduplicate()` garde la
première occurrence de chaque couple titre+entreprise : une offre vue à la fois
ici et chez un agrégateur sort donc avec l'URL de la page carrière de
l'employeur. Si l'ordre s'inversait un jour, tout l'intérêt de crawler la
source serait perdu en silence — d'où le test.

**Une absence déclarée.** `scripts/smoke/sources.mjs` fait échouer la sonde
pour tout collecteur absent sans raison écrite. `Greenhouse` y est inscrit avec
la sienne, et avec le délai au bout duquel elle cesse d'être tolérable : la clé
n'existe pas avant la première exécution du cron suivant un déploiement, et
au-delà de 72 h ce n'est plus une absence normale mais une panne de cron.

La sonde est passée de 62 à **93 vérifications** : 31 de plus pour
l'intégration seule, dont la pagination à dix offres par page — sans elle, les
334 offres françaises passeraient toutes devant les huit autres sources, que
`prioritize` classe après la France.

### Ce qu'il reste à faire, et qui n'est pas du code

1. **`CRON_SECRET` doit exister dans l'environnement Vercel du projet.** Les
   neuf autres crons s'en servent déjà, donc la variable est probablement là —
   à vérifier avant de considérer le cron actif.
2. **Vérifier la première exécution** (le lendemain 4 h au plus tard). Jusqu'à
   elle, `/api/jobs` déclarera `Greenhouse` en `collecte_absente`, ce qui est
   le comportement correct et non une panne. `npm run smoke:sources` le dira.
3. **Le catalogue reste le vrai levier** (section 6, condition 2), et
   **Lever est la cible suivante** : Greenhouse ne rend que 5,2 % d'offres
   françaises, et les scale-ups FR y sont toutes en 404.
