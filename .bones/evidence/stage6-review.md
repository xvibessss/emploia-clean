# Stage 6 — Revue adversariale + sécurité

## Surface d'attaque du changement

Le changement insère du JSON-LD **statique** dans 10 fichiers HTML. Aucune
entrée utilisateur n'y entre : `name`, `description` et `url` sont recopiés
depuis le `<title>`, la meta description et le canonical de la page
elle-même — contenu déjà servi publiquement.

| Vecteur | Verdict |
|---|---|
| XSS via le bloc inline | **couvert** — `<`, `>`, `&` échappés en `<`/`>`/`&`, assertion automatique vérifie qu'aucun de ces caractères ne subsiste brut |
| Cassure de page par `</script>` dans une valeur | **couvert** — même échappement |
| Injection de commande dans mes scripts | **néant** — `execSync` n'est appelé qu'avec la chaîne littérale `git diff --name-only`, deux occurrences, zéro interpolation |
| Fuite de secret | **néant** — aucun motif (`sk_live`, `rk_live`, `api_key`, `bearer`, `password`) dans les 10 fichiers |
| Régression de contenu | **structurellement impossible** — diff purement additif : **142 insertions, 0 suppression** |

## Intégrité HTML

Les 10 fichiers ont, après modification : exactement un `</head>`, et autant
de `<script` que de `</script>`. Aucun déséquilibre de balise.

## Ce que la sonde de production prouve — et ne prouve pas

`npm run smoke:surface` sort **0 problème sur 263 routes** (74 handlers API,
184 pages avec `<title>`, `<h1>` et ≥80 mots, 4 actifs, 7 sondes de contenu).

**Mais cette sonde cible `https://emploia.eu` par défaut** — la production,
pas le working tree. Elle ne valide donc **pas** le changement. Ce qu'elle
établit est une **référence saine avant promotion** : si la prod casse après
le déploiement, la sonde aura prouvé que ce n'était pas déjà cassé.

Elle accepte une base en argument (`surface.mjs https://autre`), ce qui en
fait l'outil du stage 7 sur l'URL de preview.

## Limite de la revue, honnêtement

Aucune page n'a encore été **servie** avec son nouveau bloc. Les assertions
du stage 5 lisent les fichiers sur disque ; elles ne prouvent pas qu'un
navigateur ou le robot de Google reçoit du JSON-LD valide par HTTP. C'est
précisément le travail du stage 7.

Risque résiduel inchangé depuis le stage 4 : le `WebApplication` de
`cv-builder.html` reste incomplet pour Google (ni `offers`, ni
`aggregateRating`), par refus d'inscrire un prix non vérifié.
