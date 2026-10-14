# Stage 4 — Conseil / seconde critique

## La critique qui compte : pour qui optimise-t-on ?

**42 « erreurs » LibreCrawl qui disparaissent ne sont pas 42 problèmes
résolus.** La spec le dit déjà : `CollectionPage` et `ContactPage` ne
produisent aucun rich result pour de l'emploi. Le risque réel de cette run
est donc de **faire taire un linter** et de confondre ça avec du gain SEO.

Ce qui sauve la slice malgré tout, et qu'il faut nommer précisément :

- `emploi.html` et `metier.html` sont les **deux points d'entrée** vers 85
  pages. Les laisser sans `isPartOf` ni `CollectionPage` alors que leurs 85
  enfants en ont est une incohérence qui se paiera à la prochaine
  intervention, pas un défaut cosmétique.
- Les 5 pages métiers nues au milieu de 32 équipées sont une anomalie de
  maintenance : le prochain qui ajoute une page métier copiera laquelle ?

C'est une run de **dette technique**, pas de croissance. Assumé, et Hugo a
signé en le sachant.

## Trois ajustements à porter dans l'implémentation

### 1. Échappement défensif du JSON inline

Mesuré : **0 occurrence** de `<`, `>` ou `&` dans les 10 titles et
descriptions aujourd'hui. Donc aucun risque immédiat.

Mais une meta description contenant `</script>` casserait la page entière,
et ces descriptions sont éditées à la main. Le script échappera `<`, `>` et
`&` en séquences `<` / `>` / `&` — c'est ce que Google
recommande pour du JSON-LD inline, et ça coûte une ligne.

Ne pas s'en passer sous prétexte que le compte est à zéro : la protection
vaut pour les éditions futures, pas pour l'état d'aujourd'hui.

### 2. `cv-builder.html` : compléter sans inventer

`index.html` structure déjà son `SoftwareApplication` avec
`applicationCategory: "BusinessApplication"` et `operatingSystem: "Web"`.
Un `WebApplication` nu serait incohérent avec ça, donc on aligne.

**Mais pas d'`offers`.** `index.html` en a un ; le reproduire sur
`cv-builder` demanderait d'inscrire un prix. Inventer un prix sur un
produit payant en production, c'est du balisage mensonger — Google
sanctionne l'écart entre balisage et page. Un avertissement « champ
recommandé manquant » dans Search Console est préférable à un faux prix.

Ce choix reste dans la spec signée : le `@type` ne change pas, seuls deux
champs descriptifs s'ajoutent.

### 3. Assertion sur `</head>`

Vérifié : les 10 fichiers ont **exactement un** `</head>`. Le script
l'exigera quand même et refusera le fichier sinon — une insertion dans un
fichier à zéro ou deux `</head>` produirait du HTML cassé silencieusement.

## Ce que le conseil n'a pas trouvé à redire

- Les `@type` des 9 autres fichiers sont les types standard et cohérents
  avec le repo (`CollectionPage` ×7, `ContactPage`, `WebPage`).
- Recopier `description` et `url` depuis la page plutôt que les
  reconstruire élimine la classe de bugs la plus probable : le décalage
  entre balisage et contenu.
- L'assertion `git diff` limitée aux 10 cibles est la bonne protection
  contre la dérive de périmètre, qui est le mode d'échec classique d'un
  script qui édite N fichiers.

## Risque résiduel accepté

Le `WebApplication` de `cv-builder` sera incomplet aux yeux de Google
(pas d'`offers`, pas de `aggregateRating`). Conséquence : pas de rich
result pour cette page, et possiblement un avertissement dans Search
Console. C'est le prix de ne pas mentir sur un prix.
