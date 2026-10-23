# `collect-ats` : dater le passage sans écraser le relevé

Relevé du 2026-10-22. Suite de #105, mais **pas** la même correction — et c'est
tout le sujet.

---

## Verdict en un paragraphe

**Le garde de `collect-ats` est bien placé, et je ne l'ai pas retiré.** Copier
#105 ici aurait créé une panne au lieu d'en révéler une. Ce qui manquait n'est
pas l'écriture de la clé d'offres : c'est qu'il ne restait **aucune trace du
passage du cron** quand cette clé était épargnée. J'ai donc séparé la balise de
la charge — une clé distincte, qui ne porte aucune offre et ne peut donc rien
mettre hors ligne.

---

## 1. Pourquoi #105 ne se copie pas ici

| | réservoir RapidAPI (#105) | réservoir ATS |
|---|---|---|
| clés | une pour deux sources | **une par fournisseur** |
| contenu au moment d'une panne | souvent vide de toute façon | **des centaines d'offres servies** |
| le lecteur sert-il une entrée vide ? | **non** — `causeReservoir` rend une cause | **oui**, en silence (voir §3) |
| écrire à vide coûte | rien | **24 h de source hors ligne** |

Dans #105, retirer le garde était sans danger parce que `causeReservoir` refuse
déjà de servir une entrée sans offre : une collecte à zéro ne servait rien de
toute façon. `collect-ats` n'a pas cette propriété. `greenhouse_jobs` porte
aujourd'hui des centaines d'offres servies en production ; si une panne de
crawl passagère écrivait `offres: []` par-dessus, Greenhouse disparaîtrait du
site jusqu'au cron suivant.

Le commentaire du garde dit déjà la bonne chose, et il avait raison :

> On laisse l'ancienne valeur vivre sur son TTL : elle est périmée mais vraie,
> et si la panne dure elle expirera d'elle-même en déclarant la source morte.

**Garde conservé.** C'est le premier résultat de cette PR, et c'est un
non-changement assumé.

---

## 2. Ce qui manquait réellement

Épargner la clé a un prix : il ne reste **aucune trace que le cron est passé**.
Au bout de 72 h la clé expire, et deux histoires se confondent exactement comme
JSearch les confondait avant #105 :

```
le cron n'est jamais passé           → clé expirée → collecte_absente
il est passé trois nuits, crawl mort → clé expirée → collecte_absente
```

**La correction : une balise de passage, dans une clé à part.**

```
ats_passage  { passeLe, fournisseurs: { Greenhouse: {ok, raison, offres, boards, boardsEnEchec}, … } }
```

- Écrite **inconditionnellement**, une fois, après la boucle.
- Elle **ne porte aucune offre** — c'est ce qui la rend inoffensive : la
  réécrire chaque nuit ne peut rien mettre hors ligne.
- TTL de 14 jours, soit **plus long que les 72 h des clés d'offres**. Une balise
  qui expirerait la première ne saurait rien expliquer.
- Un échec d'écriture de la balise ne fait pas échouer le cron : elle explique
  les pannes, elle n'en est pas une.

Côté lecture, quand une clé d'offres ne donne rien :

```
pas de balise                 → collecte_absente   le cron n'est pas passé
balise, fournisseur en échec  → collecte_en_echec  passé, crawl mort
balise, fournisseur ok        → collecte_absente   il a écrit ; l'absence est ailleurs
balise plus vieille que 72 h  → collecte_absente   elle n'explique plus rien
```

**Aucun nouveau jeton.** `collecte_en_echec` vient de #105 et dit déjà
exactement ça : le cron a tourné, la collecte a échoué. Les trois raisons
possibles (`collecte_vide`, `collecte_interrompue`, `ecriture_refusee`)
appellent le même geste — aller voir le fournisseur ou les journaux du cron — et
le détail reste lisible dans `raison`. Un cinquième jeton n'aurait fait que
dupliquer un champ.

---

## 3. Un trou trouvé en chemin : la liste vide était servie en silence

Le lecteur portait ce commentaire :

```js
// Absente ou illisible, la clé ne vaut pas une liste vide. Un `return []`
// nu ferait disparaître la source en silence
const offres = Array.isArray(collecte?.offres) ? collecte.offres : null;
if (!offres) return muet(…, 'collecte_absente');
```

**Le commentaire avait raison avant le code.** `Array.isArray([])` est vrai et
`![]` est faux — donc une clé portant `offres: []` traversait le garde et
partait dans `servirReservoir`, qui rendait zéro offre **sans publier de
cause**. Exactement le silence que `causesEnEchec` existe pour retirer.

Vérifié :

```
$ node -e "const o=[]; console.log(Array.isArray(o), !o)"
true false
```

Le cas est aujourd'hui inatteignable, précisément parce que le garde du cron
refuse d'écrire une collecte vide — les deux moitiés se tenaient par la main
sans que personne ne l'ait voulu. Une clé écrite par un déploiement antérieur,
ou à la main, y arriverait. Le test est devenu `!offres || !offres.length`.

---

## 4. Le bundle Edge : 46 Ko évités

Première version : `api/jobs.js` importait la règle de balise depuis
`_lib/ats.js`. Or `ats.js` importe les deux collecteurs et les deux catalogues
de boards — **46 133 octets de code de crawl** tirés dans le bundle de la route
la plus chaude du site, pour appeler deux fonctions qui ne touchent pas au
réseau.

La balise vit donc dans `api/_lib/ats-balise.js`, **qui n'importe rien**.
`ats.js` vient y chercher le TTL des clés d'offres et réexporte le reste, donc
une seule définition existe. Une assertion refuse que `jobs.js` importe
`_lib/ats.js`.

---

## 5. Tests

`scripts/smoke/greenhouse.test.mjs` — **116 vérifications** (98 avant).
`scripts/smoke/lever.test.mjs` — **126** (125 avant). Hors ligne, KV et réseau
injectés, déjà rattachées au job `guards`.

Les deux harnais exercent le **vrai** lecteur extrait de `api/jobs.js`, avec la
**vraie** règle `causeDepuisBalise` importée — pas une copie, qui resterait
verte en divergeant du module.

**Vérifié par mutation — neuf régressions injectées, neuf attrapées :**

| mutation | attrapée |
|---|---|
| **une collecte vide écrase un relevé valide** (garde du cron) | ✓ 2 assertions |
| **idem côté registre** (`ecrire: true`) | ✓ 4 |
| la balise gardée par une condition | ✓ 1 |
| la balise porterait les offres | ✓ 2 |
| la balise expire avant les clés d'offres | ✓ 1 |
| un échec de fournisseur relu comme un succès | ✓ 2 |
| la balise périmée explique quand même | ✓ 1 |
| le vide redevient servi en silence | ✓ 1 |
| `jobs.js` réimporte le gros registre | ✓ 1 |

**Deux de mes assertions ne passaient pas cette épreuve au premier jet**, et je
les ai renforcées :

- « la balise s'écrit inconditionnellement » cherchait une sous-chaîne, donc
  restait verte sur `if (false) await kvSet(CLE_BALISE, …)`. Elle exige
  maintenant une **instruction nue** (`^\s*await kvSet(…);$`).
- « la balise ne porte aucune offre » cherchait deux motifs précis dans la
  source du module, donc ratait toute troisième façon d'y mettre des offres.
  Elle **construit** maintenant une balise à partir d'un rapport qui en charrie,
  et vérifie qu'aucune n'en ressort.

C'est la même leçon qu'en #102, où mes assertions d'URL comparaient une
constante à elle-même : une assertion sur le TEXTE du code suit le code quand il
se trompe.

---

## 6. Fichiers touchés

| fichier | nature |
|---|---|
| `api/_lib/ats-balise.js` | **nouveau** — règles d'écriture et de lecture, zéro import |
| `api/_lib/ats.js` | prend le TTL dans la balise, la réexporte ; **garde inchangé** |
| `api/cron/collect-ats.js` | écrit la balise après la boucle ; **garde inchangé** |
| `api/jobs.js` | consulte la balise ; `!offres.length` ajouté ; lecture paresseuse |
| `scripts/smoke/greenhouse.test.mjs` | section balise, +18 vérifications |
| `scripts/smoke/lever.test.mjs` | harnais mis à jour, assertion de cause renforcée |

La balise est lue **paresseusement** et une seule fois pour les deux
fournisseurs : une source saine ne paie aucune lecture supplémentaire, la
requête ne part que s'il y a une panne à expliquer.

`CAUSES` n'est **pas** touché : aucun jeton nouveau n'était nécessaire.
