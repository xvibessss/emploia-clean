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
