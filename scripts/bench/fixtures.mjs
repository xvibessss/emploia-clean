// Jeux d'essai pour le bench qualité des générations.
// CASES : profils + offres types (utilisés en mode --live pour générer via l'API).
// GOLDEN : sorties de référence pour auto-tester le détecteur sans appeler l'IA.

export const CASES = [
  {
    name: 'Junior — développeuse web',
    profileType: 'jeune-diplome',
    profile: `Marie Dupont, développeuse web.
Formation : Licence informatique, Université de Lyon, 2022.
Expérience : stage de 6 mois chez Webagency à Lyon (2021), développement de sites en React.
Projet perso : application de gestion de tâches en Vue.js.
Compétences : JavaScript, React, HTML, CSS, Git. Langues : français (natif), anglais B2.`,
    offer: `Développeur front-end React (CDI), Lyon. Missions : développer des interfaces en React,
intégrer des maquettes, travailler avec Git. Profil : 0-2 ans d'expérience, maîtrise de JavaScript et React.`,
  },
  {
    name: 'Senior — chef de projet',
    profileType: 'experience',
    profile: `Karim Benali, chef de projet digital.
Expérience : chef de projet chez Sopra Steria (2018-2024), pilotage de projets web pour clients grands comptes.
Avant : consultant junior chez Capgemini (2015-2018).
Formation : Master management des SI, IAE Paris, 2015.
Compétences : gestion de projet, Agile/Scrum, JIRA, budgétisation. Langues : français, anglais courant, arabe.`,
    offer: `Chef de projet digital senior (CDI), Paris. Piloter des projets web de bout en bout,
management d'équipe, méthodologie Agile. 5+ ans d'expérience exigés.`,
  },
  {
    name: 'Reconversion — vers data',
    profileType: 'reconversion',
    profile: `Sophie Martin, en reconversion vers l'analyse de données.
Ancien poste : responsable comptable chez Leclerc (2016-2023).
Formation initiale : DCG comptabilité, 2016. Formation récente : bootcamp Data Analyst, Le Wagon, 2024.
Compétences : Excel avancé, SQL, Python (pandas), Power BI. Langues : français, anglais B1.`,
    offer: `Data Analyst junior (CDI), Nantes. Analyser des données, créer des tableaux de bord (Power BI),
requêtes SQL. Une première expérience ou une reconversion sont bienvenues.`,
  },
];

// Golden samples tied to CASES[0].profile.
export const GOLDEN = {
  profile: CASES[0].profile,
  clean: `MARIE DUPONT — Développeuse web
[à compléter : email] · [à compléter : téléphone] · [à compléter : LinkedIn]

PROFIL
Développeuse web junior formée au développement React, à la recherche d'un premier poste en front-end.

EXPÉRIENCE
Webagency — Stagiaire développement web (2021, 6 mois), Lyon
- Développé des sites web en React
- Contribué à [à compléter : nombre] projets clients

PROJETS
Application de gestion de tâches développée en Vue.js

FORMATION
Licence informatique — Université de Lyon (2022)

COMPÉTENCES
JavaScript, React, HTML, CSS, Git

LANGUES
Français (natif), Anglais (B2)`,

  // Same CV but with invented facts a good guardrail must catch.
  planted: `MARIE DUPONT — Développeuse web

PROFIL
Développeuse web ayant augmenté le trafic de 45% sur ses projets.

EXPÉRIENCE
Google — Développeuse front-end (2019-2021), Paris
- Développé des sites en React, augmentant le trafic de 45%
- Géré une équipe de 8 personnes
- Généré 200 k€ de revenus additionnels

FORMATION
Master informatique — Université de Lyon (2023)
Licence informatique — Université de Lyon (2022)

COMPÉTENCES
JavaScript, React, HTML, CSS, Git`,
};

// Embellishment case, taken from a real generation on the demo account (22/10/2026):
// the profile says "anglais niveau B2" and a consumer telecom agency; the CV came back
// with "Anglais courant", "Conseillère Clientèle B2B" and a client-company portfolio,
// all words lifted from the offer. Facts were not invented, they were upgraded.
export const EMBELLISH = {
  profile: `Camille Martin
Conseillère clientèle, 3 ans d'expérience.
2022-2025 : conseillère clientèle en agence chez un opérateur télécom, 60 appels par jour, traitement des réclamations, suivi dans Salesforce.
2021-2022 : alternance en service commercial, préparation de devis.
Compétences : Excel (RECHERCHEV, tableaux croisés), Salesforce, gestion des réclamations, anglais niveau B2.
Formation : BTS NDRC (Négociation et digitalisation de la relation client).`,
  offer: `Chargé·e de clientèle B2B (H/F) — CDI — Lyon
Au sein d'une PME de distribution de matériel professionnel, tu gères un portefeuille d'une centaine de clients entreprises.
Missions : relation client (téléphone, e-mail, visio), suivi des commandes et des litiges dans le CRM, reportings mensuels sous Excel.
Profil : 2 ans d'expérience minimum en relation client B2B, maîtrise d'Excel (tableaux croisés dynamiques), anglais courant, autonomie.`,
  // What the generator produced (excerpt, verbatim).
  planted: `# CAMILLE MARTIN

## PROFIL
Conseillère clientèle B2B avec 3 ans d'expérience en relation client et gestion de portefeuilles. Maîtrise confirmée d'Excel (tableaux croisés dynamiques, RECHERCHEV). Anglais courant pour la communication avec clients européens.

## EXPÉRIENCES PROFESSIONNELLES
**Conseillère Clientèle B2B — Opérateur Télécom** | 2022 – 2025 (3 ans)
- Géré un portefeuille de clients entreprises en relation client au quotidien
- Traité en moyenne 60 appels par jour

## LANGUES
Anglais : courant`,
  // The honest version: same facts, offer words only where the profile supports them.
  clean: `CAMILLE MARTIN — Chargée de clientèle
[à compléter : email] · [à compléter : téléphone]

PROFIL
Conseillère clientèle, 3 ans d'expérience en relation client et traitement des réclamations, à l'aise sur Excel (tableaux croisés, RECHERCHEV) et Salesforce.

EXPÉRIENCES
Opérateur télécom — Conseillère clientèle en agence (2022-2025)
- Traité 60 appels par jour et les réclamations associées
- Assuré le suivi client dans Salesforce (CRM)

LANGUES
Anglais : B2

À PRÉCISER AVANT D'ENVOYER
- L'offre demande une expérience B2B et un anglais courant : à ajouter seulement si c'est vrai.`,
};
