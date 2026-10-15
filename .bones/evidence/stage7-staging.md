# Stage 7 — Validation en staging

## Pourquoi un serveur local et pas une preview Vercel

Une preview Vercel aurait exigé de **pousser une branche** — une action
sortante que Hugo n'a pas autorisée, et qui à ce stade du pipeline
précéderait sa décision de promotion (stage 8). Le repo est servi
statiquement en local à la place, ce qui suffit pour la seule question
ouverte après le stage 6 : *le JSON-LD arrive-t-il valide par HTTP ?*

Serveur : `python3 -m http.server --bind 127.0.0.1:8081`, arrêté après
validation.

## Les 10 pages, servies et vérifiées

Chaque page a été **récupérée par HTTP**, son bloc extrait de la réponse et
**parsé** :

| Vérification | Résultat |
|---|---|
| HTTP 200 | 10/10 |
| Exactement un bloc `application/ld+json` servi | 10/10 |
| `JSON.parse` du bloc réussit | 10/10 |
| `@type` servi conforme à la spec | 10/10 |
| `url` servie = canonical attendue | 10/10 |

Les séquences `<` sont bien décodées par le parseur : le JSON est
syntaxiquement propre et l'échappement défensif ne pollue pas les valeurs.

## Non-régression hors périmètre

Échantillon servi et parsé : `metier/agent-immobilier.html`,
`metier/aide-soignant.html`, `metier/chef-cuisine.html` (1 bloc chacune,
valide), `emploi/brest.html` et `index.html` (2 blocs chacune, les deux
valides). **Aucune régression.**

Un premier échantillon avait signalé `metier/informatique.html` en 404 :
vérifié, ce fichier **n'existe pas et n'a jamais existé** (absent de
`git ls-files`). C'était une erreur de ma liste de test, pas un défaut du
site.

## Ce que ce staging ne couvre pas

- **Pas de routing Vercel** : un serveur statique sert `/contact.html`, pas
  `/contact`. Les canonical pointent vers les URLs propres, qui ne sont
  résolues qu'en production. Le contenu du bloc est validé, le routage ne
  l'est pas.
- **Pas d'en-têtes de production** (cache, sécurité, régions `cdg1`).
- **Pas de validation par Google.** Le JSON est syntaxiquement valide et les
  `@type` sont des types standard schema.org, mais seul le Rich Results Test
  ou Search Console confirmera l'interprétation côté Google — après
  déploiement, et c'est un contrôle du stage 10.

## État avant le gate propriétaire

10 fichiers modifiés dans le working tree, **aucun commit, aucun push,
aucun déploiement**. `emploia.eu` est intact et sa sonde sortait 0 problème
sur 263 routes au stage 6.
