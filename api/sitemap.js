export default function handler(req, res) {
  const base = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';
  const today = new Date().toISOString().split('T')[0];
  const urls = [
    { loc: `${base}/`,                    changefreq: 'weekly',  priority: '1.0', lastmod: today },
    { loc: `${base}/jobs`,                changefreq: 'daily',   priority: '0.9', lastmod: today },
    { loc: `${base}/blog`,                changefreq: 'weekly',  priority: '0.85', lastmod: today },
    { loc: `${base}/cv-builder`,          changefreq: 'monthly', priority: '0.8' },
    { loc: `${base}/employeurs`,          changefreq: 'weekly',  priority: '0.85', lastmod: today },
    { loc: `${base}/about`,              changefreq: 'monthly', priority: '0.7' },
    { loc: `${base}/contact`,            changefreq: 'yearly',  priority: '0.5' },
    { loc: `${base}/legal`,              changefreq: 'yearly',  priority: '0.3' },
    { loc: `${base}/legal/mentions`,     changefreq: 'yearly',  priority: '0.2' },
    { loc: `${base}/legal/privacy`,      changefreq: 'yearly',  priority: '0.2' },
    { loc: `${base}/legal/cgu`,          changefreq: 'yearly',  priority: '0.2' },
    { loc: `${base}/blog/cv-ats-2026`,                changefreq: 'monthly', priority: '0.8', lastmod: '2026-04-20' },
    { loc: `${base}/blog/methode-star-entretien`,    changefreq: 'monthly', priority: '0.8', lastmod: '2026-04-18' },
    { loc: `${base}/blog/salaires-france-2026`,      changefreq: 'monthly', priority: '0.8', lastmod: '2026-04-15' },
    { loc: `${base}/blog/lettre-motivation-2026`,    changefreq: 'monthly', priority: '0.8', lastmod: '2026-04-12' },
    { loc: `${base}/blog/trouver-alternance-2026`,   changefreq: 'monthly', priority: '0.8', lastmod: '2026-04-10' },
    { loc: `${base}/blog/optimiser-profil-linkedin`, changefreq: 'monthly', priority: '0.8', lastmod: '2026-04-08' },
    { loc: `${base}/blog/cv-sans-experience`,        changefreq: 'monthly', priority: '0.8', lastmod: '2026-04-07' },
    { loc: `${base}/blog/questions-entretien-rh`,    changefreq: 'monthly', priority: '0.8', lastmod: '2026-04-05' },
    { loc: `${base}/blog/relancer-candidature`,      changefreq: 'monthly', priority: '0.8', lastmod: '2026-04-03' },
    { loc: `${base}/blog/negocier-salaire-entretien`,        changefreq: 'monthly', priority: '0.8', lastmod: '2026-04-25' },
    { loc: `${base}/blog/candidature-spontanee-exemple`,     changefreq: 'monthly', priority: '0.8', lastmod: '2026-04-28' },
    { loc: `${base}/blog/reconversion-professionnelle-2026`, changefreq: 'monthly', priority: '0.8', lastmod: '2026-05-02' },
    { loc: `${base}/emploi/paris`,       changefreq: 'daily',   priority: '0.9', lastmod: today },
    { loc: `${base}/emploi/lyon`,        changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/emploi/marseille`,   changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/emploi/bordeaux`,    changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/emploi/toulouse`,    changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/emploi/nantes`,      changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/emploi/lille`,       changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/emploi/remote`,      changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/metier/developpeur`, changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/metier/marketing`,   changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/metier/data`,        changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/metier/design`,      changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/metier/finance`,     changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/metier/rh`,          changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/metier/commercial`,      changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/metier/chef-projet`,     changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/metier/product-manager`, changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/metier/devops`,          changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/metier/comptable`,       changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/metier/juridique`,       changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/emploi/strasbourg`,      changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/emploi/nice`,            changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/emploi/rennes`,          changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/emploi/montpellier`,     changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/emploi/grenoble`,        changefreq: 'daily',   priority: '0.85', lastmod: today },
    { loc: `${base}/blog/travailler-en-startup-2026`,    changefreq: 'monthly', priority: '0.8', lastmod: '2026-05-12' },
    { loc: `${base}/blog/entretien-en-anglais`,          changefreq: 'monthly', priority: '0.8', lastmod: '2026-05-10' },
    { loc: `${base}/blog/portfolio-developpeur-2026`,    changefreq: 'monthly', priority: '0.8', lastmod: '2026-05-08' },
    { loc: `${base}/blog/negocier-contrat-travail-2026`, changefreq: 'monthly', priority: '0.8', lastmod: '2026-05-06' },
    { loc: `${base}/blog/cv-par-competences-2026`,       changefreq: 'monthly', priority: '0.8', lastmod: '2026-05-04' },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
}
