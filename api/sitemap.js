export default function handler(req, res) {
  const base = 'https://emploia-clean.vercel.app';
  const urls = [
    { loc: `${base}/`, changefreq: 'weekly', priority: '1.0' },
    { loc: `${base}/jobs`, changefreq: 'daily', priority: '0.9' },
    { loc: `${base}/app`, changefreq: 'monthly', priority: '0.85' },
    { loc: `${base}/blog`, changefreq: 'weekly', priority: '0.8' },
    { loc: `${base}/cv-builder`, changefreq: 'monthly', priority: '0.8' },
    { loc: `${base}/interview`, changefreq: 'monthly', priority: '0.75' },
    { loc: `${base}/recherche`, changefreq: 'daily', priority: '0.8' },
    { loc: `${base}/referral`, changefreq: 'monthly', priority: '0.6' },
    { loc: `${base}/legal`, changefreq: 'yearly', priority: '0.3' },
    { loc: `${base}/emploi/paris`, changefreq: 'daily', priority: '0.9' },
    { loc: `${base}/emploi/lyon`, changefreq: 'daily', priority: '0.85' },
    { loc: `${base}/emploi/marseille`, changefreq: 'daily', priority: '0.85' },
    { loc: `${base}/emploi/bordeaux`, changefreq: 'daily', priority: '0.85' },
    { loc: `${base}/emploi/toulouse`, changefreq: 'daily', priority: '0.85' },
    { loc: `${base}/emploi/nantes`, changefreq: 'daily', priority: '0.85' },
    { loc: `${base}/emploi/lille`, changefreq: 'daily', priority: '0.85' },
    { loc: `${base}/emploi/remote`, changefreq: 'daily', priority: '0.85' },
    { loc: `${base}/metier/developpeur`, changefreq: 'daily', priority: '0.85' },
    { loc: `${base}/metier/marketing`, changefreq: 'daily', priority: '0.85' },
    { loc: `${base}/metier/data`, changefreq: 'daily', priority: '0.85' },
    { loc: `${base}/metier/design`, changefreq: 'daily', priority: '0.85' },
    { loc: `${base}/metier/finance`, changefreq: 'daily', priority: '0.85' },
    { loc: `${base}/metier/rh`, changefreq: 'daily', priority: '0.85' },
    { loc: `${base}/metier/commercial`, changefreq: 'daily', priority: '0.85' },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.status(200).send(xml);
}
