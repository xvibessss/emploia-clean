# Prototype — collecteur SmartRecruiters en direct

**Relevé du 2026-11-04.** Branche `feat/collecteur-smartrecruiters`, coupée de
`main` à `c344103`.

Quatrième collecteur de la famille « crawl direct de l'ATS », après Greenhouse
(PR 99), Lever (PR 100) et Teamtailor (PR 108). L'API publique
`api.smartrecruiters.com/v1/companies/{id}/postings` est sans clé, paginée par
100, et accepte un filtre `country=fr` **côté serveur**.

**Les trois chiffres à retenir :**

1. **798 des 911 offres servies (87,6 %) sont absentes d'emploia** aujourd'hui,
   mesuré entreprise par entreprise et en paginant jusqu'à épuisement
   (`scripts/smartrecruiters/recouvrement.mjs`, 33 requêtes, 329 pages).
2. **5 entreprises sur 25 sont inconnues d'emploia** — Groupe Barrière,
   Boulanger, Sia, Bosch, Continental — et elles portent 212 offres. Repère :
   Lever 0 sur 16, Greenhouse 9 sur 27, Teamtailor 10 sur 19. Le chiffre
   d'entreprises est plus faible que celui de Teamtailor, et c'est attendu : ce
   relevé ne cherchait pas d'autres employeurs, il cherchait d'autres **métiers**.
3. **Ce sont les premiers métiers de terrain de la famille ATS** : sur les 911
   offres servies, 63 « vendeur », 33 « conseiller de vente », 26
   « réceptionniste », 9 « chef de partie », 8 cuisine, 7 « magasinier »,
   32 « technicien ».

---

## 1. Pourquoi cet ATS

La sonde de surface du 2026-11-04 échouait sur `coiffeur` : aucune offre, le
repli de pertinence servait l'agrégat brut. La sonde des sources échouait sur
`boulanger`. La cause n'est pas le repli — validé le 2026-10-22 (`caa9f5c`) —
c'est le catalogue : France Travail n'a pas d'identifiants, French Job Market a
épuisé son quota, et les trois ATS en place servent des postes de cadres tech.

SmartRecruiters est l'ATS des grands employeurs multi-sites. L'hypothèse était
qu'il porte l'hôtellerie et la distribution. Elle est vérifiée pour ces deux
secteurs, **pas** pour la coiffure, la boulangerie ou le soin : aucune
entreprise de ces trois métiers n'a été trouvée parmi les 402 candidats. Ces
trois-là restent suspendus aux identifiants France Travail.

## 2. Le catalogue

**402 identifiants sondés** par `scripts/smartrecruiters/verifier-boards.mjs`.

| | **SmartRecruiters** | Teamtailor | Lever | Greenhouse |
|---|---|---|---|---|
| Candidats sondés | 402 | 383 | 401 | 319 |
| Entreprises vivantes | 32 (8,0 %) | 40 | 31 | 63 |
| dont ≥ 1 offre FR | **25** | 19 | 17 | 28 |
| Offres FR du catalogue | **3 407** | 228 | 331 | 336 |
| Offres FR servies | 911 (borne 60/entreprise) | 228 | 331 | 336 |
| Durée de collecte | 7,8 s | 5,1 s | 20 – 31,5 s | 10,1 s |
| Échecs | 0 | 0 | 0 | 0 |

**Le piège propre à cet ATS** : un identifiant inconnu rend **HTTP 200 avec
`totalFound: 0`**, pas 404 (vérifié sur `zzzznotacompany123`). « N'existe pas »
et « ne recrute pas » sont indiscernables par le statut ; la sonde lit donc
`company.name` dans les offres servies. 370 identifiants ne servent rien.

Sept entreprises servent des offres mais **aucune en France** et ne sont pas
inscrites : Domino's (24 737 offres), Securitas, Equinox, Sodexo, Colliers,
Thales, Vinci Construction.

Le catalogue retenu, offres FR au relevé :

```
Alten 762 · Assystem 408 · Devoteam 327 · Talan 295 · Groupe Barrière 277
Forvis Mazars 211 · Accor 199 · Meritis 147 · Boulanger 144 · Sia 139
Conforama 131 · Kiabi 126 · Ubisoft 110 · Primark 35 · Nexity 29 · Bosch 25
Galeries Lafayette 9 · Saint-Gobain 9 · Continental 7 · Sixt 5 · Gameloft 5
LVMH 4 · Intermarché 1 · Darty 1 · Segula Technologies 1
```

## 3. Ce que la source donne, et ce qu'elle ne donne pas

Mesuré sur les 3 407 offres FR :

- **Pays** : 100 %, ISO-2 minuscule. Le filtre serveur `country=fr` est
  honnête — **0** offre rendue sous ce filtre ne porte un autre pays. Le pays
  est quand même relu offre par offre.
- **Ville** : 100 %, souvent en capitales (« PARIS ») — remise en casse
  d'affichage, seulement quand elle est entièrement en capitales.
- **Date** : 100 %.
- **Distanciel** : 44 `remote`, 649 `hybrid`. Seul `remote` rend
  `remote: true`.
- **Description** : **absente** de la liste. Elle n'existe que dans le détail
  d'une offre, un appel par offre. On ne les fait pas ; le champ vaut `''`.
- **Salaire** : absent.

## 4. Le piège du contrat — `permanent` n'est pas un CDI

`typeOfEmployment` est une énumération (`permanent`, `part-time`, `contract`,
`intern`), et `permanent` a tout l'air d'un CDI. Croisé avec les titres qui
**écrivent** leur contrat :

| id servi | titres « CDI » | titres « CDD » |
|---|---|---|
| `permanent` | 216 | **124** |
| `part-time` | 36 | 63 |
| `contract` | 6 | 6 |

`permanent` couvre 124 CDD — c'est l'id que SmartRecruiters affiche
« Full-time », une **durée**. Exemple : « CHEF DE RANG (F/H/X) - CDD TEMPS
PLEIN » chez Accor, servi `permanent`. Lire l'id publierait un CDI sur un CDD.

`intern` n'ajoute rien que le titre ne dise : sur 114 offres `intern`, 107
écrivent « stage » dans leur titre, 1 « alternant », et les 6 autres sont des
postes (« Développeur Java F/H ») que l'id étiquette à tort.

**Décision : le contrat vient du titre seul** (`contratSmartRecruiters`). 281
des 911 offres servies ont un contrat lu ; les 630 autres valent `null` et sont
écartées sous filtre de contrat, comme partout.

## 5. La borne — par entreprise, puis en octets

**Par entreprise : 60 offres, les plus récentes.** Les sept cabinets
d'ingénierie et de conseil (Alten, Assystem, Devoteam, Talan, Forvis Mazars,
Meritis, Sia) portent 2 289 des 3 407 offres, soit 67 %. Sans borne par
entreprise, la troncature garderait ce que l'ordre de collecte met en tête et
couperait d'abord l'hôtellerie et la vente — ce que ce collecteur existe pour
apporter.

**Par fournisseur : 1 000 offres au lieu de 600.** `MAX_OFFRES` est un proxy de
poids, calé sur 668 octets par offre Greenhouse (600 ≈ 400 Ko). Une offre
SmartRecruiters pèse **360 octets**. Mesuré : 911 offres, 320 Ko de valeur KV —
sous le poids que la borne commune accepte déjà. `ats.js` lit donc
`fournisseur.maxOffres ?? MAX_OFFRES`, et la sonde verrouille que
`maxOffres × 360 ≤ 600 × 668`.

## 6. Ce qu'il faut savoir avant de merger

- **« Boulanger » est une enseigne d'électroménager.** Le filtre de pertinence
  de `api/jobs.js` lit le nom de l'entreprise, donc une recherche
  « boulanger » remontera ses 60 postes de vente. La sonde des sources ne s'y
  trompera pas — elle cherche l'aiguille dans le titre et le lieu — mais un
  candidat, si. À trancher : retirer Boulanger du catalogue, ou ne plus lire
  l'entreprise dans le filtre de pertinence quand le terme est un métier.
- **Workable a été écarté**, pas oublié : dès la deuxième requête, son API
  publique a rendu « error code: 1015 », la limitation de débit de Cloudflare.
  Un collecteur qu'on ne peut pas mesurer ne s'intègre pas — à retenter depuis
  une autre adresse.
- Le cron unique passe de ~40 s à ~48 s, loin sous les 300 s de `vercel.json`.
- La clé `smartrecruiters_jobs` n'existera qu'après le premier passage du cron
  (04:00 UTC) ; d'ici là la source est déclarée `collecte_absente`, entrée
  connue dans `ABSENCES_CONNUES`.

## 7. Rejouer

```bash
npm run smartrecruiters:boards        # sonde les 402 candidats
npm run smartrecruiters:mesure        # collecte, poids, contrats, métiers
npm run smartrecruiters:recouvrement  # contre la production, ~10 min
npm run test:smartrecruiters          # 94 vérifications hors ligne
```
