# Publication sur le Chrome Web Store

Tout ce qu'il faut coller dans le tableau de bord développeur
(https://chrome.google.com/webstore/devconsole). Ce fichier n'est pas dans le
paquet publié.

## Paquet

```bash
cd chrome-extension
zip -r ../emploia-extension-2.0.0.zip manifest.json background.js content.js content.css popup.html popup.css popup.js icons/icon16.png icons/icon48.png icons/icon128.png
```

Vérifié avant chaque envoi :
- `npm run test:extension` (lecture des offres, remplissage sans écraser ni confondre) ;
- test de bout en bout dans un vrai Chrome (extension chargée, clic, `/app`
  ouvert avec l'offre collée, fragment effacé) — voir la PR qui l'a introduit.

## Fiche

**Nom** : Emploia — Adapte ton CV à chaque offre

**Résumé** (132 caractères max) :
Sur une offre LinkedIn, Indeed ou Welcome to the Jungle, un clic : Emploia adapte ton CV et ta lettre à l'offre. En français.

**Catégorie** : Productivité → Organisation et planification
**Langue** : Français

**Description** :

Tu passes des heures à réécrire ton CV pour chaque offre ? Emploia le fait en 30 secondes.

✨ Adapter mon CV — Sur une offre d'emploi, un bouton « Adapter mon CV » apparaît. Un clic, et l'offre s'ouvre dans le générateur d'Emploia, déjà collée : titre, entreprise, lieu et description. Il ne reste qu'à ajouter ton parcours et à générer un CV et une lettre de motivation taillés pour cette offre, avec les mots-clés que les logiciels de tri (ATS) recherchent.

⚡ Remplir les formulaires — Enregistre une fois ton prénom, nom, email, téléphone et ville. Sur un formulaire de candidature, « Remplir avec Emploia » complète ces champs pour toi. Les champs déjà remplis ne sont jamais écrasés, et rien n'est envoyé : tu relis et tu postules.

Fonctionne sur LinkedIn, Indeed, Welcome to the Jungle, JobTeaser, HelloWork, Monster, APEC, Meteojob, Cadremploi et France Travail.

🔒 Respect de ta vie privée
• Ton profil reste sur ton ordinateur : il n'est envoyé à aucun serveur.
• L'offre n'est transmise qu'au moment où tu cliques, et seulement à emploia.eu.
• Aucun suivi, aucune publicité, aucune revente de données.

Emploia est un outil français de recherche d'emploi : 5 générations gratuites, sans carte bancaire, sur emploia.eu.

## Confidentialité (onglet « Pratiques de confidentialité »)

**Objectif unique** :
Aider un candidat à postuler : ouvrir l'offre d'emploi affichée dans le générateur de CV d'Emploia, et remplir les champs d'identité des formulaires de candidature avec le profil que l'utilisateur a enregistré.

**Justification des autorisations** :
- `storage` : conserver sur l'ordinateur de l'utilisateur le profil qu'il saisit (prénom, nom, email, téléphone, ville, profil LinkedIn, poste), utilisé pour remplir les formulaires.
- `activeTab` : permettre à la fenêtre de l'extension de demander à l'onglet ouvert s'il affiche une offre ou un formulaire, pour activer le bon bouton.
- Accès aux sites (scripts de contenu limités aux 10 sites d'emploi listés) : y afficher le bouton et y lire l'offre affichée. Aucun autre site.

**Code distant** : Non, je n'utilise pas de code distant.

**Utilisation des données** — cocher :
- « Contenu des sites Web » : le texte de l'offre affichée est ouvert sur emploia.eu quand l'utilisateur clique sur « Adapter mon CV ».

Puis cocher les trois certifications (pas de vente ou transfert à des tiers hors cas autorisés, pas d'usage sans lien avec l'objectif unique, pas d'usage pour la solvabilité ou le crédit).

**URL des règles de confidentialité** : https://emploia.eu/legal#extension

## Visuels

- Icône 128 × 128 : `icons/icon128.png`
- Captures 1280 × 800 (jointes à la PR) :
  1. le bouton « Adapter mon CV » sur une offre ;
  2. l'offre collée dans le générateur d'Emploia ;
  3. la fenêtre de l'extension.
- Petite vignette promotionnelle 440 × 280 (jointe à la PR).

Les captures utilisent une page d'offre neutre (entreprise fictive « Atelier
Lumen », profil fictif « Camille Martin ») : aucune marque de site d'emploi n'y
figure.

## Compte développeur

Frais d'inscription uniques de 5 $. Comme Emploia est une activité commerciale,
déclarer le compte comme **professionnel (trader)** au titre du DSA : nom,
adresse et email de contact sont alors affichés sur la fiche.
