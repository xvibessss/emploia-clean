# France Travail : le chemin vérifié avant que les identifiants arrivent

Relevé du 2026-10-21. Tout ce qui suit a été établi **sans identifiant**, par
lecture de la documentation officielle de francetravail.io et par appels réels
aux deux points d'accès.

---

## En un paragraphe

**Le soupçon qui motivait la tâche était faux, et il en cachait un vrai.** La
migration `pole-emploi.io → francetravail.io` avait déjà été faite dans ce
code : hôte, chemin, realm, `grant_type`, encodage du corps et scope
correspondent **mot pour mot** à l'exemple de la documentation d'aujourd'hui.
Mais le code mettait le jeton en cache **55 minutes** sur un commentaire
affirmant qu'il vit une heure, quand la seule valeur concrète publiée par
France Travail est **`expires_in: 1499`, soit vingt-cinq minutes**. Les
identifiants posés, la source aurait servi la première demi-heure puis rendu
`http_401` la seconde, en alternance, sans que rien ne nomme la cause et sans
que le cache se répare — puisqu'il n'était pas expiré. C'était la deuxième
panne, et c'est celle-là qui est corrigée.

---

## 1. Ce qui était périmé

| # | Point | État | Comment je l'ai établi |
|---|---|---|---|
| 1 | **Cache du jeton 2× plus long que le jeton** | 🔴 corrigé | Code : `kvSet('ft_token', …, 3300)` + commentaire « valid for 3600s ». Doc officielle « 4.1. Client Credentials », exemple de retour : `"expires_in": 1499`. |
| 2 | **Identifiants refusés ≠ droits insuffisants** | 🔴 corrigé | Doc « 4.9. Erreurs fréquentes » : `invalid_client` (identifiant/secret erroné) et `invalid_scope` (« scope pour lequel vous ne disposez pas des droits ») sont deux HTTP 400 distincts. Le code les rendait tous deux `jeton_refuse`. |
| 3 | **Zéro silencieux sur forme inattendue** | 🔴 corrigé | Code : `(data.resultats \|\| [])` — une réponse dont la forme change rend zéro offre **sans figurer dans `sourcesEnEchec`**. |
| 4 | **Zéro silencieux sur le filtre « stage »** | 🔴 corrigé | Code : `if (type === 'stage') return [];`, sans journalisation. |
| 5 | **Aucun renouvellement sur 401** | 🔴 corrigé | Un jeton périmé en cache condamnait la source jusqu'à l'expiration de la clé — jusqu'à 55 min de `http_401` par requête. |
| 6 | **204 lu comme une réponse illisible** | 🟠 corrigé par prudence | `.json()` sur un corps vide jette ; `borner_cause` l'aurait classé `reponse_illisible`, un faux échec. Je **n'ai pas pu confirmer** que l'API rend 204 (voir §3). |
| 7 | Domaine du serveur d'autorisation | 🟢 déjà bon | `entreprise.francetravail.fr` — identique à la doc. |
| 8 | Domaine et chemin de l'API | 🟢 déjà bon | `api.francetravail.io/partenaire/offresdemploi/v2/offres/search`. |
| 9 | `realm`, `grant_type`, `Content-Type`, corps | 🟢 déjà bon | Identiques à l'exemple officiel. |
| 10 | Scope `api_offresdemploiv2 o2dsoffre` | 🟢 conforme à la doc | Mais **non vérifiable par appel** (voir §3). |
| 11 | Table des codes de contrat | 🟢 **laissée telle quelle** | Je n'ai pas pu établir qu'un code manque (voir §3). |

### Les preuves qui tranchent

**Le serveur d'autorisation accepte la forme exacte de la requête du code.**
Avec des identifiants volontairement faux :

```
POST https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire
→ HTTP 400  {"error":"invalid_client","error_description":"Client authentication failed"}
```

`invalid_client` est un refus d'**identifiants**, pas de requête. Un
`grant_type` inventé rend `unsupported_grant_type` au même endroit — donc le
serveur valide bien la forme, et la forme passe.

**L'ancien domaine ne rend pas 404, il ne rend rien.**
`api.pole-emploi.io` résout encore (185.215.64.15) mais **expire après 12 s**.
Un retour en arrière se présenterait donc comme un `timeout`, c'est-à-dire
comme une panne réseau passagère, pas comme une erreur de configuration. C'est
pourquoi les deux URL sont désormais épinglées en littéral dans la sonde.

---

## 2. Ce qui a été corrigé

Le collecteur est sorti de `api/jobs.js` vers **`api/_lib/france-travail.js`**.
La raison n'est pas l'esthétique : c'est le seul collecteur du dépôt qui
s'authentifie, donc le seul dont la panne peut venir de trois endroits, et
écrit en ligne dans le handler **aucune sonde ne pouvait l'atteindre**. Dans
`api/jobs.js` il reste un adaptateur de onze lignes.

### La durée du cache est lue, plus devinée

```js
export function ttlDepuisExpiration(expiresIn, defaut = TTL_JETON_DEFAUT) {
  const n = Number(expiresIn);
  if (!Number.isFinite(n) || n <= 0) return defaut;
  return Math.max(TTL_JETON_PLANCHER, Math.floor(n) - MARGE_JETON_SECONDES);
}
```

Le serveur est seul à savoir combien de temps il honore son jeton. S'il répond
3600 demain, le cache suit sans qu'on touche au code. La sonde ne vérifie pas
un nombre : elle vérifie la **propriété** « le cache ne survit jamais au
jeton », sur six valeurs de `expires_in`.

### Quatre causes là où il y en avait une

`causesEnEchec` gagne quatre jetons, et chacun correspond à **un geste
différent** :

| cause | ce qui se passe | ce qu'il faut faire |
|---|---|---|
| `cle_absente` | les variables ne sont pas posées | les poser dans Vercel |
| `identifiants_refuses` | posées, mais le serveur les refuse (`invalid_client`) | les corriger |
| `droits_insuffisants` | identifiants bons, application **non abonnée** à l'API (`invalid_scope`) | s'abonner sur francetravail.io |
| `forme_inattendue` | l'API répond 2xx sans la forme attendue | relire son contrat d'interface |
| `filtre_non_servi` | la source s'abstient sur ce filtre | rien — c'est un zéro **déclaré** |

Les deux du milieu sont ceux qui comptent, parce que ce sont les deux qu'on
confond : **`invalid_scope` se produit avec des identifiants parfaitement
valides.** Sous un jeton commun, tu aurais revérifié tes variables pendant que
la panne était un abonnement manquant. Un `error` que la doc ne nomme pas
retombe sur `jeton_refuse`, le jeton générique d'origine — rien n'est reclassé
au jugé.

### Le jeton se renouvelle

Sur un 401 de l'API, le jeton du cache est abandonné, un neuf est demandé
**cache ignoré**, et la recherche est rejouée **une fois**. Un 401 qui persiste
rend `http_401` : le refus est alors réel, et il ne boucle pas.

---

## 3. Ce que je n'ai pas pu vérifier sans identifiant

Dit franchement, parce que la moitié de la valeur de ce rapport est là.

**La passerelle authentifie AVANT de router.** C'est le point méthodologique le
plus important, et il invalide une hypothèse de la mission :

```
/partenaire/offresdemploi/v2/offres/search             → 401
/partenaire/offresdemploi/v2/referentiel/typesContrats → 401
/partenaire/offresdemploi/v9/offres/search             → 401   ← version inexistante
/partenaire/offresdemploi/v2/offres/CHEMIN-BIDON       → 401   ← chemin inexistant
```

Un 401 ne prouve donc **pas** qu'un chemin existe. Le chemin de recherche
repose sur la documentation et sur des usages tiers concordants, pas sur mes
sondes. (Même comportement que la passerelle RapidAPI, relevé par la session
des sources tierces.)

**Le scope n'est pas vérifiable.** L'ordre de validation est `grant_type` →
authentification du client → scope. Avec un client faux, le serveur n'atteint
jamais la validation du scope : les quatre variantes que j'ai essayées —
celle du code, une bidon, `o2dsoffre` seul, et l'ancienne forme
`application_<id> …` — rendent **toutes** le même `invalid_client`. Le scope du
code est celui de l'exemple officiel ; c'est tout ce que je peux affirmer.

**Le 204.** Ni confirmé ni infirmé : la page de référence de l'API est
elle-même fermée (`403 : l'accès à cette API vous est interdit` sans compte).
Je l'ai traité par prudence — ça coûte une ligne et supprime un faux échec
possible. Si l'API ne rend jamais 204, cette ligne ne sert jamais et ne nuit
pas.

**La table des codes de contrat est laissée intacte.** `FT_CONTRAT` mappe CDI,
DIN, CDD, CDS, DDI, CA, CP, LIB. Le référentiel `/referentiel/typesContrats`
est derrière l'authentification (401) et la doc de l'API derrière un compte
(403) : **je n'ai pas pu établir qu'un code manque**, donc je n'ai rien ajouté.
La doctrine du dépôt dit de ne pas deviner, et un code ajouté au jugé
étiquetterait de vraies offres avec un contrat faux. C'est le premier
contrôle à faire une fois les identifiants posés (§5-d).

**La forme d'une offre réelle** (`resultats`, `intitule`, `lieuTravail.libelle`,
`salaire.libelle`…) est inchangée : non vérifiable, donc non touchée. Si elle a
bougé, c'est maintenant `forme_inattendue` qui le dira au lieu d'un zéro muet.

---

## 4. Réservoir rempli par cron, ou appel en ligne ?

**Appel en ligne. Et ce n'est pas par symétrie avec Adzuna : c'est parce que
l'argument qui a fait basculer les autres sources ne s'applique pas ici.**

JSearch et French Job Market sont devenues des réservoirs pour une raison
arithmétique : leurs plans plafonnent à **200 et 30 requêtes par mois**, et un
seul passage de crawler sur les 86 pages SEO en consomme 86 — presque trois
fois le quota mensuel entier de French Job Market. Un appel par requête
utilisateur était impossible.

**France Travail n'a aucun plafond mensuel.** Son débit est borné *par
seconde*, et la doc le publie dans ses en-têtes :
`X-Ratelimit-Burst-Capacity-Clientidlimiter` = appels maximum **par seconde**,
par API et par application. 86 requêtes étalées sur un crawl ne pèsent rien
contre un plafond par seconde. L'arithmétique qui condamnait les sources
RapidAPI ne dit rien ici.

Et le réservoir **perdrait ce qui fait la valeur de la source**. Un cron ne peut
remplir un réservoir qu'avec un jeu de requêtes *génériques* — c'est ce que
fait `collect-rapidapi` avec ses onze familles de métiers. Or France Travail
vaut par la recherche *spécifique* : un candidat qui cherche « soudeur à
Brive-la-Gaillarde » obtient une vraie réponse en ligne, et **rien** d'un
réservoir construit sur onze familles. S'y ajoute une borne que l'API impose :
une requête ne peut paginer que sur ~1 150 résultats, donc on ne peut pas
mirrorer le catalogue — il n'y a pas de réservoir exhaustif possible, seulement
un échantillon.

Coût de l'appel en ligne : **une** requête par requête utilisateur non cachée,
le jeton étant en cache KV et partagé. Le cache de réponse de 300 s absorbe les
répétitions. Un pic de trafic peut rendre `http_429` — déjà nommé, avec
`Retry-After` publié par l'API.

---

## 5. Marche à suivre — ce qu'il te reste à faire

### a) Créer l'application sur francetravail.io

1. Compte sur <https://francetravail.io/inscription> (ou connexion).
2. **Mes applications** → créer une application.
3. **Abonner cette application à l'API « Offres d'emploi v2 ».** Ne saute pas
   cette étape : sans elle, tes identifiants seront valides et le serveur
   refusera quand même, avec `invalid_scope`. C'est le cas que
   `droits_insuffisants` existe pour nommer.
4. Relever l'**identifiant client** et la **clé secrète**.

Aucun scope à saisir nulle part : le code demande déjà
`api_offresdemploiv2 o2dsoffre`, qui est l'exemple officiel. L'abonnement de
l'étape 3 est ce qui te donne le droit sur ces scopes.

### b) Poser les deux variables dans Vercel

Projet `emploia` (team `xvibessss-projects`) → Settings → Environment
Variables, pour **Production** (et Preview si tu veux tester sur une PR) :

| Variable | Valeur |
|---|---|
| `FRANCE_TRAVAIL_CLIENT_ID` | l'identifiant client |
| `FRANCE_TRAVAIL_CLIENT_SECRET` | la clé secrète |

Les noms sont déjà ceux que le code lit et ceux de `.env.example` — ne les
renomme pas. **Redéploie** ensuite : une variable ajoutée ne s'applique pas à
un déploiement déjà construit.

### c) Vérifier en une commande

```bash
npm run smoke:sources
```

Quatre lectures possibles, et chacune te dit quoi faire :

- **`↻ France Travail ne figure plus parmi les échecs — retirer son entrée
  d'ABSENCES_CONNUES`** → **c'est gagné.** La source sert. Retire son entrée de
  `ABSENCES_CONNUES` dans `scripts/smoke/sources.mjs`.
- **`identifiants_refuses`** → les variables sont posées mais fausses.
  Recopie-les (attention aux espaces en fin de valeur).
- **`droits_insuffisants`** → les identifiants sont bons, l'application n'est
  pas abonnée à l'API Offres d'emploi v2. Retourne à l'étape a-3.
- **`cle_absente`** → les variables ne sont pas arrivées jusqu'à l'exécution :
  mauvais environnement, ou pas redéployé.

La même réponse se lit directement, sans la sonde :

```bash
curl -s 'https://emploia.eu/api/jobs?q=developpeur' | python3 -c 'import sys,json; print(json.load(sys.stdin).get("causesEnEchec"))'
```

### d) Le contrôle qui reste, une fois les identifiants posés

Le seul point que je n'ai pas pu vérifier et qui touche la donnée servie : la
table des codes de contrat. Avec un jeton valide :

```bash
curl -s -H "Authorization: Bearer $JETON" 'https://api.francetravail.io/partenaire/offresdemploi/v2/referentiel/typesContrats'
```

Compare la liste à `FT_CONTRAT` dans `api/_lib/contrat.js`. Un code absent de
la table rend `null` — ce qui est le comportement voulu, pas un bug — mais si
un code fréquent et sans ambiguïté manque, il vaut la peine de l'ajouter.
`MIS` (intérim) et `SAI` (saisonnier) doivent **rester** `null` : ils ne sont
aucun des cinq badges.

---

## 6. Tests

`scripts/smoke/france-travail.test.mjs` — **135 vérifications**, hors ligne,
`fetch` et les deux accès KV injectés, aucune variable d'environnement lue.
Déclaré dans `package.json` (`test:france-travail`) et rattaché au job `guards`
de `.github/workflows/ci.yml`.

Couvre : la durée du cache dérivée de `expires_in` · la conformité de la requête
de jeton à l'exemple officiel · les quatre causes distinctes deux à deux · les
pannes de transport · le renouvellement sur 401 et l'absence de boucle · un zéro
légitime qui n'est pas un échec · les paramètres de recherche · les codes de
contrat vers le vocabulaire fermé · la non-fabrication sur une offre pauvre.

**La sonde a été vérifiée par mutation**, parce qu'un test qui ne peut pas
échouer est décoratif. Dix régressions injectées dans le collecteur, **dix
attrapées** :

| mutation | attrapée |
|---|---|
| TTL du jeton remis en dur à 3300 s | ✓ 7 assertions |
| `invalid_scope` confondu avec `invalid_client` | ✓ 2 |
| renouvellement sur 401 supprimé | ✓ 6 |
| retour au zéro silencieux sur forme inattendue | ✓ (plantage) |
| 204 relu par `.json()` | ✓ 2 |
| filtre « stage » redevenu muet | ✓ 1 |
| scope amputé | ✓ 2 |
| ancien domaine `api.pole-emploi.io` restauré | ✓ 3 |
| ancien serveur `entreprise.pole-emploi.fr` restauré | ✓ 3 |
| secret recopié dans l'URL | ✓ 1 |

Les deux lignes de domaine ne passaient **pas** au premier jet : mes assertions
comparaient la constante à elle-même, donc elles suivaient le code quand il se
trompait. C'est la mutation qui l'a montré, et les URL sont maintenant épinglées
en littéral.

`scripts/smoke/causes.test.mjs` suit le site HTTP là où il a atterri (3 dans le
handler, 1 dans chacun des deux collecteurs extraits) — la propriété vérifiée
ne bouge pas, seul son emplacement change.

---

## 7. Fichiers touchés

| fichier | nature |
|---|---|
| `api/_lib/france-travail.js` | **nouveau** — le collecteur, réseau et KV injectables |
| `api/jobs.js` | collecteur remplacé par un adaptateur ; 4 jetons ajoutés à `CAUSES` |
| `scripts/smoke/france-travail.test.mjs` | **nouveau** — 135 vérifications |
| `scripts/smoke/causes.test.mjs` | le site HTTP suivi dans le fichier où il a migré |
| `scripts/smoke/sources.mjs` | l'absence connue nomme les causes qui ne sont plus tolérables |
| `package.json` | `test:france-travail` déclaré |
| `.github/workflows/ci.yml` | une étape dans le job `guards` |

`api/_lib/contrat.js` n'est **pas** touché : je n'ai pas pu établir qu'un code
de contrat manque, et je ne réécris pas au jugé.
