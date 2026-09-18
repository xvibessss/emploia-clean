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
