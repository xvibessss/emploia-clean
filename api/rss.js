export default function handler(req, res) {
  const base = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';

  const articles = [
    {
      title: 'Comment optimiser son CV pour passer les filtres ATS en France (2026)',
      link: `${base}/blog/cv-ats-2026`,
      description: "78% des CVs sont rejetés avant même d'être lus par un humain. Guide complet : format, mots-clés, structure — tout pour passer les filtres ATS des grandes entreprises françaises.",
      pubDate: 'Sun, 20 Apr 2026 08:00:00 +0200',
      category: 'CV & ATS',
    },
    {
      title: 'La méthode STAR en entretien : guide complet avec exemples (2026)',
      link: `${base}/blog/methode-star-entretien`,
      description: "Maîtrisez la méthode STAR pour structurer vos réponses en entretien d'embauche. Exemples concrets pour le marché français, questions types et erreurs à éviter.",
      pubDate: 'Fri, 18 Apr 2026 08:00:00 +0200',
      category: 'Entretien',
    },
    {
      title: 'Grille des salaires en France 2026 par métier et région',
      link: `${base}/blog/salaires-france-2026`,
      description: 'Tech, marketing, finance, RH, commercial — les fourchettes salariales réelles en France pour 2026. CDI, stage, alternance. Données France Travail et APEC.',
      pubDate: 'Tue, 15 Apr 2026 08:00:00 +0200',
      category: 'Salaire',
    },
    {
      title: 'Rédiger une lettre de motivation percutante en 2026 — Guide + exemples',
      link: `${base}/blog/lettre-motivation-2026`,
      description: 'Les recruteurs lisent une lettre de motivation en 47 secondes. Structure exacte, phrases à bannir, 2 exemples complets qui décrochent des entretiens.',
      pubDate: 'Sat, 12 Apr 2026 08:00:00 +0200',
      category: 'CV & ATS',
    },
    {
      title: 'Trouver une alternance en 2026 : guide complet (calendrier, plateformes, candidatures)',
      link: `${base}/blog/trouver-alternance-2026`,
      description: '7 alternants sur 10 sont embauchés. Calendrier 2026, meilleures plateformes, stratégie candidature spontanée, rémunération — tout pour décrocher une alternance.',
      pubDate: 'Thu, 10 Apr 2026 08:00:00 +0200',
      category: 'Recherche',
    },
    {
      title: 'Optimiser son profil LinkedIn pour être recruté en 2026 — Guide complet',
      link: `${base}/blog/optimiser-profil-linkedin`,
      description: '87% des recruteurs utilisent LinkedIn. Les 7 sections critiques à optimiser pour apparaître dans leurs recherches — titre, résumé, expériences, compétences.',
      pubDate: 'Tue, 08 Apr 2026 08:00:00 +0200',
      category: 'LinkedIn',
    },
    {
      title: 'Faire un CV sans expérience : méthode complète + exemples (2026)',
      link: `${base}/blog/cv-sans-experience`,
      description: "Pas d'expérience ? Voici comment valoriser vos projets, stages, compétences et formations pour créer un CV qui convainc les recruteurs. Exemples par secteur.",
      pubDate: 'Mon, 07 Apr 2026 08:00:00 +0200',
      category: 'CV & ATS',
    },
    {
      title: "Les 30 questions d'entretien RH les plus posées en France — Avec réponses",
      link: `${base}/blog/questions-entretien-rh`,
      description: 'Les questions RH les plus fréquentes en France avec les meilleures réponses type. "Parlez-moi de vous", "Vos défauts ?", "Pourquoi nous ?" — comment y répondre.',
      pubDate: 'Sat, 05 Apr 2026 08:00:00 +0200',
      category: 'Entretien',
    },
    {
      title: 'Relancer une candidature après un entretien : email + timing',
      link: `${base}/blog/relancer-candidature`,
      description: "Comment relancer un recruteur après un entretien sans paraître insistant. Timing, formulation, exemples d'emails de relance qui fonctionnent.",
      pubDate: 'Thu, 03 Apr 2026 08:00:00 +0200',
      category: 'Recherche',
    },
    {
      title: "Négocier son salaire en entretien : guide complet + scripts (2026)",
      link: `${base}/blog/negocier-salaire-entretien`,
      description: "Quand parler salaire, combien demander, comment répondre. 3 scripts de négociation testés + tableau des fourchettes par métier en France.",
      pubDate: 'Sat, 25 Apr 2026 08:00:00 +0200',
      category: 'Salaire',
    },
    {
      title: "Candidature spontanée : exemple complet + guide 2026",
      link: `${base}/blog/candidature-spontanee-exemple`,
      description: "80% des offres ne sont jamais publiées. Comment trouver le bon contact, rédiger le bon email et décrocher un entretien sans offre publiée.",
      pubDate: 'Tue, 28 Apr 2026 08:00:00 +0200',
      category: 'Recherche',
    },
    {
      title: "Reconversion professionnelle en 2026 : guide complet + financement CPF",
      link: `${base}/blog/reconversion-professionnelle-2026`,
      description: "CPF, Pro-A, 6 secteurs qui recrutent — tout pour changer de métier en 2026, avec les formations financées et les démarches étape par étape.",
      pubDate: 'Sat, 02 May 2026 08:00:00 +0200',
      category: 'Recherche',
    },
    {
      title: "Travailler en startup en 2026 : avantages, risques et comment candidater",
      link: `${base}/blog/travailler-en-startup-2026`,
      description: "Stock-options, culture no-bullshit, croissance rapide — mais aussi instabilité. Tout ce qu'il faut savoir avant de rejoindre une startup en France en 2026.",
      pubDate: 'Tue, 12 May 2026 08:00:00 +0200',
      category: 'Recherche',
    },
    {
      title: "Réussir un entretien en anglais : les phrases et questions clés",
      link: `${base}/blog/entretien-en-anglais`,
      description: "Les formules idiomatiques, les questions techniques et les pièges à éviter pour briller lors d'un entretien en anglais, même avec un niveau intermédiaire.",
      pubDate: 'Sat, 10 May 2026 08:00:00 +0200',
      category: 'Entretien',
    },
    {
      title: "Portfolio développeur 2026 : ce que les recruteurs veulent vraiment voir",
      link: `${base}/blog/portfolio-developpeur-2026`,
      description: "GitHub, projets perso, contributions open-source — comment construire un portfolio qui convainc les tech leads et les recruteurs en 2026.",
      pubDate: 'Thu, 08 May 2026 08:00:00 +0200',
      category: 'CV & ATS',
    },
    {
      title: "Négocier son contrat de travail en 2026 : au-delà du salaire",
      link: `${base}/blog/negocier-contrat-travail-2026`,
      description: "Télétravail, RTT, période d'essai, clause de non-concurrence — ce que vous pouvez négocier au-delà du salaire lors d'une embauche en France.",
      pubDate: 'Tue, 06 May 2026 08:00:00 +0200',
      category: 'Salaire',
    },
    {
      title: "CV par compétences 2026 : quand l'utiliser et comment le structurer",
      link: `${base}/blog/cv-par-competences-2026`,
      description: "Le CV fonctionnel est idéal pour les reconversions et les trous dans le parcours. Guide complet avec structure, exemples et erreurs à éviter.",
      pubDate: 'Sun, 04 May 2026 08:00:00 +0200',
      category: 'CV & ATS',
    },
    {
      title: "Télétravail : comment le négocier lors d'un entretien en 2026",
      link: `${base}/blog/teletravail-negocier-2026`,
      description: "Hybride, full-remote, indemnités — les bonnes formulations pour aborder le télétravail sans effrayer le recruteur et obtenir les conditions souhaitées.",
      pubDate: 'Tue, 13 May 2026 08:00:00 +0200',
      category: 'Salaire',
    },
    {
      title: "Les secteurs qui recrutent le plus en France en 2026",
      link: `${base}/blog/secteurs-qui-recrutent-2026`,
      description: "Tech, santé, logistique, énergie verte, services à la personne — les 8 secteurs en tension de recrutement en France et les profils recherchés.",
      pubDate: 'Tue, 13 May 2026 08:00:00 +0200',
      category: 'Recherche',
    },
    {
      title: "IA et emploi en 2026 : quels métiers sont menacés, lesquels recrutent",
      link: `${base}/blog/ia-et-emploi-2026`,
      description: "ChatGPT, Copilot, agents IA — analyse factuelle des métiers impactés et de ceux qui bénéficient de l'IA en France. Comment se repositionner.",
      pubDate: 'Tue, 13 May 2026 08:00:00 +0200',
      category: 'Recherche',
    },
    {
      title: "Préparer un entretien technique en 48h : méthode et ressources",
      link: `${base}/blog/preparer-entretien-technique`,
      description: "LeetCode, System Design, questions comportementales tech — plan de révision intensif en 48h pour décrocher le poste même sans préparation longue.",
      pubDate: 'Tue, 13 May 2026 08:00:00 +0200',
      category: 'Entretien',
    },
    {
      title: "L'email de candidature parfait : structure, objet, exemples",
      link: `${base}/blog/email-candidature-parfait`,
      description: "Objet, accroche, pièces jointes — la structure exacte d'un email de candidature qui donne envie d'ouvrir le CV joint. Exemples pour 3 profils différents.",
      pubDate: 'Tue, 13 May 2026 08:00:00 +0200',
      category: 'Recherche',
    },
    {
      title: "Réseaux sociaux et recherche d'emploi : guide pratique 2026",
      link: `${base}/blog/reseaux-sociaux-recherche-emploi`,
      description: "LinkedIn, X/Twitter, GitHub, Malt — comment utiliser chaque réseau pour être repéré par les recruteurs et décrocher des opportunités off-market.",
      pubDate: 'Tue, 13 May 2026 08:00:00 +0200',
      category: 'Recherche',
    },
    {
      title: "Générateur de lettre de motivation gratuit en ligne 2026",
      link: `${base}/blog/generateur-lettre-motivation-gratuit`,
      description: "Générez une lettre de motivation personnalisée gratuitement en ligne. Structure, exemples, erreurs à éviter — outil IA adapté à chaque offre en 30 secondes.",
      pubDate: 'Sun, 18 May 2026 10:00:00 +0200',
      category: 'CV & ATS',
    },
    {
      title: "CV gratuit en ligne 2026 : créez un CV ATS en 5 minutes",
      link: `${base}/blog/cv-gratuit-en-ligne-2026`,
      description: "Comparatif des 5 meilleurs outils pour créer un CV gratuit en ligne en 2026. Optimisation ATS, personnalisation IA, téléchargement PDF — guide complet.",
      pubDate: 'Sun, 18 May 2026 08:00:00 +0200',
      category: 'CV & ATS',
    },
    {
      title: "Défauts en entretien 2026 — Les meilleures réponses (exemples)",
      link: `${base}/blog/defauts-entretien`,
      description: "Comment répondre à 'Quels sont vos défauts ?' : structure DAP, 8 exemples concrets par profil, pièges à éviter. La question la plus piège de tout entretien.",
      pubDate: 'Wed, 20 May 2026 10:00:00 +0200',
      category: 'Entretien',
    },
    {
      title: "Accroche CV 2026 — Exemples complets + Comment rédiger son profil",
      link: `${base}/blog/accroche-cv`,
      description: "Rédiger l'accroche de son CV en 2026 : formule en 3 lignes, 6 exemples complets (avant/après) par profil, check-list et erreurs à éviter. Section la plus lue par les ATS.",
      pubDate: 'Wed, 20 May 2026 11:00:00 +0200',
      category: 'CV & ATS',
    },
    {
      title: "Comment se présenter en entretien 2026 — Pitch 90 secondes",
      link: `${base}/blog/comment-se-presenter-entretien`,
      description: "Structure du pitch de présentation, 3 exemples complets (expérimenté, débutant, reconversion), erreurs éliminatoires et formules qui font la différence en entretien.",
      pubDate: 'Tue, 20 May 2026 08:00:00 +0200',
      category: 'Entretien',
    },
    {
      title: "Lettre de motivation alternance 2026 — Exemples complets + Guide",
      link: `${base}/blog/lettre-motivation-alternance`,
      description: "Structure, 2 exemples complets (développement web + marketing) et erreurs à éviter pour rédiger une lettre de motivation d'alternance qui décroche des entretiens.",
      pubDate: 'Tue, 20 May 2026 09:00:00 +0200',
      category: 'CV & ATS',
    },
    {
      title: "CV en anglais 2026 — Modèle, traduction et différences clés",
      link: `${base}/blog/cv-en-anglais`,
      description: "Rédiger un CV en anglais : CV vs Resume, différences avec le CV français (photo, longueur, format), vocabulaire RH, verbes d'action, erreurs de traduction à éviter.",
      pubDate: 'Mon, 19 May 2026 10:00:00 +0200',
      category: 'CV & ATS',
    },
    {
      title: "Comment trouver un emploi rapidement en 2026 — 7 stratégies",
      link: `${base}/blog/trouver-emploi-rapidement`,
      description: "Plan d'action semaine par semaine pour décrocher un emploi en 2-8 semaines : réseau, candidatures directes, plateformes à cibler, suivi et erreurs à éviter.",
      pubDate: 'Mon, 19 May 2026 11:00:00 +0200',
      category: 'Recherche',
    },
    {
      title: "Lettre de motivation stage 2026 — Exemples complets + Guide",
      link: `${base}/blog/lettre-motivation-stage`,
      description: "Rédiger une lettre de motivation pour un stage : structure en 4 blocs, 2 exemples complets (tech + marketing), phrases à bannir, erreurs éliminatoires. Modèle gratuit.",
      pubDate: 'Mon, 19 May 2026 08:00:00 +0200',
      category: 'CV & ATS',
    },
    {
      title: "Entretien téléphonique 2026 : réussir le premier filtre RH",
      link: `${base}/blog/entretien-telephonique`,
      description: "L'entretien téléphonique élimine 60% des candidats en 15-20 minutes. Questions types, réponses exemples, check-list de préparation, email de remerciement — guide complet.",
      pubDate: 'Mon, 19 May 2026 09:00:00 +0200',
      category: 'Entretien',
    },
    {
      title: "Score ATS : comment analyser et optimiser son CV pour les filtres ATS",
      link: `${base}/blog/score-ats-cv-optimisation`,
      description: "78% des CVs échouent sur le score ATS. Guide complet : facteurs de scoring (mots-clés 40%, format 25%), avant/après 38→91/100, 5 étapes d'optimisation, erreurs à éviter.",
      pubDate: 'Mon, 18 May 2026 11:00:00 +0200',
      category: 'CV & ATS',
    },
    {
      title: "Simulation d'entretien d'embauche en ligne (IA) 2026 : s'entraîner gratuitement",
      link: `${base}/blog/simulation-entretien-embauche`,
      description: "Comment s'entraîner à un entretien avec l'IA en 2026. Questions personnalisées par poste, feedback instantané, méthode STAR, plan 48h. Simulateur gratuit.",
      pubDate: 'Sun, 18 May 2026 09:00:00 +0200',
      category: 'Entretien',
    },
    {
      title: "Salaire brut net 2026 : calcul, simulateur et différences cadre/non-cadre",
      link: `${base}/blog/salaire-brut-net`,
      description: "Convertir un salaire brut en net en France : taux de cotisation, simulateur interactif, tableau SMIC→100k€, différences cadre/non-cadre, formule de négociation.",
      pubDate: 'Wed, 20 May 2026 12:00:00 +0200',
      category: 'Salaire',
    },
    {
      title: "Compétences CV 2026 : hard skills, soft skills et mots-clés ATS par secteur",
      link: `${base}/blog/competences-cv`,
      description: "Quelles compétences mettre sur son CV pour passer les filtres ATS : grilles par secteur (tech, data, marketing, finance), niveaux, erreurs à éviter.",
      pubDate: 'Wed, 20 May 2026 13:00:00 +0200',
      category: 'CV & ATS',
    },
    {
      title: "CV étudiant 2026 : modèle complet + guide pas à pas",
      link: `${base}/blog/cv-etudiant`,
      description: "Comment faire un CV étudiant sans expérience professionnelle : modèle complet, structure, sections clés, erreurs à éviter — pour stages, alternances et premier emploi.",
      pubDate: 'Thu, 21 May 2026 08:00:00 +0200',
      category: 'CV & ATS',
    },
    {
      title: "Bilan de compétences 2026 : guide complet, financement CPF et démarches",
      link: `${base}/blog/bilan-de-competences`,
      description: "Tout sur le bilan de compétences en 2026 : CPF, durée légale (24h max), 3 phases, choisir son organisme, ce que ça produit et comment l'utiliser pour changer de voie.",
      pubDate: 'Thu, 21 May 2026 09:00:00 +0200',
      category: 'Reconversion',
    },
    {
      title: "Période d'essai 2026 : durée légale, droits et rupture — Guide complet",
      link: `${base}/blog/periode-essai-droits`,
      description: "Durée légale par contrat (CDI 2-4 mois, CDD), droits pendant la période d'essai, conditions de rupture, délais de prévenance, chômage et recours en cas d'abus.",
      pubDate: 'Thu, 21 May 2026 10:00:00 +0200',
      category: 'Salaire',
    },
    {
      title: "Comment faire un CV en 2026 : guide complet pas à pas",
      link: `${base}/blog/comment-faire-un-cv`,
      description: "Guide complet pour créer un CV qui passe les filtres ATS et convainc les recruteurs : 7 étapes, formule des bullet points, mise en forme, optimisation ATS, adaptation par offre.",
      pubDate: 'Thu, 21 May 2026 11:00:00 +0200',
      category: 'CV & ATS',
    },
    {
      title: "Questions à poser en entretien 2026 : les 25 meilleures + celles à éviter",
      link: `${base}/blog/questions-a-poser-en-entretien`,
      description: "25 questions à poser au recruteur en fin d'entretien, classées par catégorie (poste, équipe, entreprise, progression), + les questions qui plombent votre candidature.",
      pubDate: 'Thu, 21 May 2026 12:00:00 +0200',
      category: 'Entretien',
    },
    {
      title: "Rupture conventionnelle 2026 : guide complet, indemnités et procédure",
      link: `${base}/blog/rupture-conventionnelle`,
      description: "Tout sur la rupture conventionnelle : conditions, procédure en 5 étapes, calcul des indemnités (1/4 par an), délai carence chômage, fiscalité et pièges à éviter.",
      pubDate: 'Fri, 22 May 2026 08:00:00 +0200',
      category: 'Salaire',
    },
    {
      title: "Lettre de motivation reconversion professionnelle 2026 — Exemples complets",
      link: `${base}/blog/lettre-motivation-reconversion`,
      description: "Structure en 4 blocs, 3 exemples complets annotés (comptable→dev, commercial→RH, enseignant→marketing) et erreurs à éviter pour convaincre malgré un profil atypique.",
      pubDate: 'Fri, 22 May 2026 09:00:00 +0200',
      category: 'CV & ATS',
    },
    {
      title: "CV commercial 2026 : modèle complet + conseils pour décrocher des entretiens",
      link: `${base}/blog/cv-commercial`,
      description: "Comment faire un CV commercial percutant : les KPIs à mettre, modèle annoté B2B, différences selon le profil (terrain, sédentaire, comptes clés, manager). Le guide pour se démarquer.",
      pubDate: 'Fri, 22 May 2026 10:00:00 +0200',
      category: 'CV & ATS',
    },
    {
      title: "Lettre de démission 2026 : modèles gratuits + guide complet",
      link: `${base}/blog/lettre-demission`,
      description: "3 modèles prêts à l'emploi (CDI avec préavis, dispense de préavis, période d'essai), délais de préavis par catégorie, droit au chômage et alternative rupture conventionnelle.",
      pubDate: 'Fri, 22 May 2026 11:00:00 +0200',
      category: 'Salaire',
    },
  ];

  const items = articles.map(a => `
    <item>
      <title><![CDATA[${a.title}]]></title>
      <link>${a.link}</link>
      <guid isPermaLink="true">${a.link}</guid>
      <description><![CDATA[${a.description}]]></description>
      <pubDate>${a.pubDate}</pubDate>
      <category>${a.category}</category>
      <author>contact@emploia.fr (Emploia)</author>
    </item>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Blog Emploia — Guides CV, Entretien &amp; Recherche d'emploi</title>
    <link>${base}/blog</link>
    <description>Guides pratiques pour décrocher un emploi en France : CV ATS, entretiens, lettres de motivation, salaires, alternance.</description>
    <language>fr-FR</language>
    <managingEditor>contact@emploia.fr (Emploia)</managingEditor>
    <webMaster>contact@emploia.fr (Emploia)</webMaster>
    <image>
      <url>${base}/favicon.svg</url>
      <title>Emploia Blog</title>
      <link>${base}/blog</link>
    </image>
    <atom:link href="${base}/rss.xml" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
}
