# JSearch : le cron avait tourné, et le site disait le contraire

Relevé du 2026-10-22. Établi **sans dépenser une seule requête RapidAPI**.

---

## La réponse en un paragraphe

**Rien n'était cassé côté infrastructure. Le cron a tourné.** Ce qui était cassé
est le fait de le dire : `collect-rapidapi` n'écrivait pas sa clé KV quand la
collecte ne ramenait aucune offre, et sans clé, la lecture n'a qu'un seul mot —
`collecte_absente`, qui se lit « le cron n'a pas tourné ». Le diagnostic exact
était pourtant **calculé** par `fusionner`, et `causeReservoir` savait déjà le
traduire. Il était jeté une ligne plus loin, avant d'atteindre KV.

Donc la réponse à la question 1 n'est ni « le quota » ni « le cron » : c'est
**le code qui rendait les deux indiscernables**, et c'est aussi la réponse à la
question 2.

---

## 1. Ce qui est établi

| Fait | Comment |
|---|---|
| Le cron est déclaré `0 3 * * * /api/cron/collect-rapidapi` | `vercel.json` |
| `RAPIDAPI_KEY` et `CRON_SECRET` existent en Production | `vercel env ls production` (noms seuls, aucune valeur) |
| Les deux crons lisent le **même** `CRON_SECRET`, même comparaison | lecture des deux handlers |
| **Les crons se déclenchent bien sur ce projet** | voir ci-dessous |
| Zéro offre ⇒ clé non écrite ⇒ `collecte_absente` | lecture, puis exercé par la sonde |

### La preuve que les crons tournent

Le message qui m'a confié la tâche affirmait que `collect-ats` avait tourné
parce que Greenhouse et Lever servent. L'argument est juste mais incomplet :
`greenhouse_jobs` pouvait dater de la PR #99, antérieure.

**C'est `lever_jobs` qui tranche.** Cette clé n'existe que depuis la PR #100,
mergée le 21. Si Lever sert 26 offres, c'est que `collect-ats` a tourné
**après** le déploiement du 21 — donc à 4 h le 22. `collect-rapidapi` est à 3 h,
dans le même `vercel.json`, le même déploiement, le même mécanisme. Il a tourné.

Et le rejet 401 est écarté : les deux crons lisent le même `CRON_SECRET` avec la
même comparaison, et celui de 4 h a abouti.

---

## 2. Le défaut, et pourquoi il était invisible

```js
// api/cron/collect-rapidapi.js, avant
if (!offres) {
  console.error(`collect-rapidapi: aucune offre… — clé non écrite.`);
  return new Response(JSON.stringify({ ok: false, raison: 'collecte_vide', ecrit: false }), …);
}
await kvSet(CLE_KV, valeur, TTL_SECONDES);   // jamais atteint
```

Son commentaire disait : « On laisse l'absence être une absence, et
`collecte_absente` la dira. » Mais **l'absence d'OFFRES n'est pas l'absence de
COLLECTE.** Les confondre rendait trois pannes indicibles d'un coup :

| ce qui s'est passé | `etat` calculé | ce qui était publié |
|---|---|---|
| le plafond mensuel a refusé | `quota` | `collecte_absente` |
| `RAPIDAPI_KEY` non posée | `cle_absente` | `collecte_absente` |
| l'API répond mal sur tous les appels | `ok` (!) | `collecte_absente` |
| le cron n'a vraiment pas tourné | — | `collecte_absente` |

Le plus dur à voir : `causeReservoir` contient **déjà** la branche
`entree.etat === 'quota' ? 'quota_epuise'`. Elle était inatteignable, parce que
`quota_epuise` ne pouvait être publié que si une collecte **antérieure** avait
laissé une clé pour le porter — donc jamais au premier passage, qui est
exactement le moment où on en a besoin.

### La sonde prouvait la bonne propriété sur la mauvaise moitié

`scripts/smoke/rapidapi.test.mjs` contenait déjà, en section 5 :

```js
check('une collecte vide met quand même l'état à jour',
  vide.etat === 'quota', 'sinon `quota_epuise` serait indicible à la lecture');
```

`quota_epuise` **était** indicible. Mais pas à cause de `fusionner`, qui faisait
son travail — à cause du handler qui jetait son résultat. La sonde vérifiait
l'unité et ratait l'intégration.

Et, plus bas, elle **épinglait le défaut comme une intention** :

```js
check('une collecte totalement vide n'écrit pas la clé', …);
```

C'est cette assertion qui l'a fait tenir. Elle est remplacée par son inverse.

---

## 3. La crainte d'origine était infondée

Le garde existait pour qu'une clé vide « ne fasse pas apparaître un réservoir là
où il n'y en a pas ». `causeReservoir` le montre :

```js
if (!entree.collecteLe || !entree.offres?.length) return perime;
```

Une entrée sans offre rend une **cause** ; elle n'est jamais servie. Le garde
protégeait d'un risque qui n'existait pas, en détruisant le diagnostic.

---

## 4. Ce qui est corrigé

**L'écriture devient inconditionnelle**, et la clé devient aussi une **balise de
passage** : `collecteLe` à sa racine date le dernier tour du cron, quel qu'en
soit le résultat. C'est ce qui rend les deux lectures enfin distinctes, sans
logs :

```
clé absente                      → le cron n'a pas tourné    → crons Vercel
clé présente, jsearch.etat quota → il a tourné, refusé        → abonnement
clé présente, etat cle_absente   → RAPIDAPI_KEY non posée     → poser la variable
clé présente, etat erreur        → l'API répond mal           → le fournisseur
```

**Un nouveau jeton, `collecte_en_echec`**, et une correction en amont qui le
rend atteignable : `collecterJSearch` déclarait `ok` une collecte dont les six
appels avaient échoué, parce que `parLots` n'écarte que `quota` et `ok` et que
les refus non-429 finissaient dans le journal sans remonter. Désormais, aucun
appel abouti alors qu'on a appelé, et sans refus de quota, vaut `erreur`. Une
collecte **partielle** reste `ok` — elle a ramené ce qu'elle a pu, et la dire en
échec ferait clignoter une source qui sert.

Le handler est extrait en `collecterEtEcrire({ kvGet, kvSet, fetchImpl })`, pour
la même raison qu'en #102 : un handler non injectable ne peut pas être sondé, et
c'est précisément ce qui a laissé passer ce défaut.

---

## 5. Ce que je n'ai pas établi, et pourquoi je n'ai pas dépensé de quota

**Je ne sais pas pourquoi JSearch a ramené zéro offre à 3 h** — plafond atteint,
ou API en panne. Les logs runtime sont hors de portée : le passage date de ~19 h,
la rétention Hobby est d'une heure.

**Et un appel maintenant n'y répondrait pas.** Il dirait l'état du quota
*aujourd'hui*, pas celui d'il y a dix-neuf heures. Ce serait une requête sur les
200 du mois dépensée pour une information qui ne répond pas à la question posée.
Je ne l'ai donc pas faite.

L'antériorité penche pour le plafond : le relevé du 21 montrait `http_429` sur
JSearch sous l'ancienne architecture d'appels en ligne, qui consommait le quota
par requête utilisateur. Mais c'est une présomption, pas une mesure, et le
correctif ne repose pas dessus — **il rend la question inutile à poser la
prochaine fois.** Au prochain passage du cron, la clé portera l'état et il n'y
aura plus rien à deviner.

---

## 6. Tests

`scripts/smoke/rapidapi.test.mjs` — **77 vérifications** (59 avant), hors ligne,
`fetch` et les deux accès KV injectés. Déjà rattachée au job `guards`.

La nouvelle section exerce le **handler entier** plutôt qu'une fonction, parce
que le défaut vivait précisément entre les deux.

**Vérifiée par mutation — cinq régressions injectées, cinq attrapées :**

| mutation | attrapée |
|---|---|
| le garde `!offres` qui sautait l'écriture, restauré | ✓ 2 assertions |
| `etat` revenu à `quota ? 'quota' : 'ok'` | ✓ 2 |
| branche `erreur` retirée de `causeReservoir` | ✓ 1 |
| une panne **partielle** déclarée en échec | ✓ 2 |
| le cron cesse de dater son passage | ✓ 2 |

---

## 7. Hors périmètre, à instruire

**`api/cron/collect-ats.js` porte le même garde** (`raison: 'collecte_vide'`,
`ecrit: false`). La conséquence y est moins grave — il laisse la clé précédente
intacte, donc Greenhouse et Lever continuent de servir leurs offres de la veille
— mais si une collecte ATS échoue **totalement et durablement**, la clé finit
par expirer et la panne se lira `collecte_absente` sans dire qu'un crawl a
pourtant eu lieu. Même famille de défaut, pas touché : hors périmètre, et le
comportement y est défendable tant que la clé précédente tient.

**French Job Market** reste `collecte_absente`, et c'est normal : collecte le
lundi seulement, la première tombe le lundi 26. Avec ce correctif, elle portera
un état dès le premier passage du cron au lieu de partager le silence de
JSearch.

---

## 8. Fichiers touchés

| fichier | nature |
|---|---|
| `api/cron/collect-rapidapi.js` | écriture inconditionnelle ; handler extrait en `collecterEtEcrire` |
| `api/_lib/rapidapi.js` | `etatDeCollecte` : une collecte dont aucun appel n'aboutit vaut `erreur` |
| `api/jobs.js` | `causeReservoir` traduit `erreur` ; `collecte_en_echec` ajouté à `CAUSES` |
| `scripts/smoke/rapidapi.test.mjs` | l'assertion qui épinglait le défaut est inversée ; section 11 ajoutée |
