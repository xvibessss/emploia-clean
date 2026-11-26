// Sonde hors ligne de l'extension Chrome (chrome-extension/content.js).
//
// Le vrai content.js est chargé dans un DOM jsdom avec une fausse API chrome,
// sur des pages types reconstituées d'après les sites réels (vérifiés le
// 2026-11-26) : offre WTTJ/HelloWork en JSON-LD, offre expirée HelloWork avec
// bandeau cookies, Indeed sans JSON-LD, France Travail en microdonnées,
// formulaire de candidature avec un champ « nom de l'entreprise ».
//
// jsdom n'est pas une dépendance du projet : la CI l'installe pour cette
// étape seulement (`npm install --no-save jsdom`). En local, sans jsdom, la
// sonde le dit et s'arrête proprement.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let JSDOM;
try { ({ JSDOM } = require(process.env.JSDOM_PATH || 'jsdom')); }
catch { console.log('⏭  jsdom absent : npm install --no-save jsdom'); process.exit(process.env.CI ? 1 : 0); }

const SOURCE = readFileSync(new URL('../../chrome-extension/content.js', import.meta.url), 'utf8');
let fail = 0;
const check = (nom, ok, detail = '') => { console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && detail ? ` — ${detail}` : ''}`); if (!ok) fail++; };

function charger(url, html, profil = null) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const envoyes = [];
  let ecouteur = null;
  w.chrome = {
    runtime: {
      sendMessage: (m) => envoyes.push(m),
      onMessage: { addListener: (f) => { ecouteur = f; } },
    },
    storage: { local: { get: (_k, cb) => cb(profil ? { emploia_profile: profil } : {}) } },
  };
  w.CSS = w.CSS || { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&') };
  w.eval(SOURCE);
  const demander = (type) => new Promise(res => { const r = ecouteur({ type }, {}, res); if (r !== true && type !== 'TRIGGER_AUTOFILL') {} });
  return { w, doc: w.document, envoyes, demander };
}

const jsonLd = (o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const LONG = 'Vous piloterez la stratégie d’acquisition B2B, les campagnes payantes et le SEO. ' .repeat(6);

// ── 1. Offre en JSON-LD (WTTJ, HelloWork) ────────────────────────────────
console.log('\n  Offre en JSON-LD');
{
  const { doc, envoyes, demander } = charger('https://www.welcometothejungle.com/fr/companies/x/jobs/y', `<html><head>${jsonLd([
    { '@type': 'BreadcrumbList' },
    { '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Lead Growth Marketing', hiringOrganization: { '@type': 'Organization', name: 'Welcome to the Jungle' },
      jobLocation: [{ '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Paris' } }], description: `<p>${LONG}</p><ul><li>SQL</li><li>HubSpot</li></ul>` },
  ])}</head><body><h1>Lead Growth Marketing</h1></body></html>`);
  const fab = doc.getElementById('emploia-fab');
  check('le bouton « Adapter mon CV » apparaît', fab && /Adapter mon CV/.test(fab.textContent), fab && fab.textContent);
  const etat = await demander('PAGE_STATE');
  check('la fenêtre de l’extension voit une offre', etat.offre === true && etat.formulaire === false, JSON.stringify(etat));
  fab.click();
  const m = envoyes.find(e => e.type === 'OPEN_GENERATOR');
  check('le clic envoie l’offre au générateur', !!m);
  check('l’en-tête porte titre, entreprise et lieu', m && m.offre.startsWith('Lead Growth Marketing — Welcome to the Jungle (Paris)'), m && m.offre.slice(0, 80));
  check('le HTML de la description est converti en texte', m && !/<li>|<p>/.test(m.offre) && m.offre.includes('HubSpot'));
  check('l’offre est plafonnée à 8 000 caractères', m && m.offre.length <= 8000);
}

// ── 2. Offre expirée + bandeau cookies (HelloWork, 2026-11-26) ───────────
console.log('\n  Page sans offre');
{
  const cookies = 'Ces traceurs peuvent être activés ou désactivés à tout moment. Si vous n’acceptez pas ces cookies le service sera le même. '.repeat(5);
  const { doc } = charger('https://www.hellowork.com/fr-fr/emplois/1.html', `<html><body>
    <div class="hw-cc-modal__body"><div class="description">${cookies}</div></div>
    <section><p>Cette offre d'emploi n'est plus disponible.</p></section></body></html>`);
  check('aucun bouton quand seul le bandeau cookies contient du texte', !doc.getElementById('emploia-fab'));
}
{
  const autres = Array.from({ length: 8 }, (_, i) => `<li><h2>Offre ${i}</h2><div class="description">${'Résumé court d’une autre offre. '.repeat(6)}</div></li>`).join('');
  const { doc } = charger('https://candidat.francetravail.fr/offres/recherche/detail/X', `<html><body><h1>Offres partenaires</h1><ul>${autres}</ul></body></html>`);
  check('aucun bouton sur une liste de résumés d’« autres offres »', !doc.getElementById('emploia-fab'));
}

// ── 3. Sélecteurs de repli : Indeed, France Travail ──────────────────────
console.log('\n  Sites sans JSON-LD');
{
  const { doc, envoyes } = charger('https://fr.indeed.com/viewjob?jk=1', `<html><body>
    <h1 data-testid="jobsearch-JobInfoHeader-title">Comptable H/F</h1>
    <div data-testid="inlineHeader-companyName">Cabinet Durand</div>
    <div id="jobDescriptionText">${LONG}</div></body></html>`);
  doc.getElementById('emploia-fab')?.click();
  const m = envoyes.find(e => e.type === 'OPEN_GENERATOR');
  check('Indeed : titre et entreprise lus par sélecteurs', m && m.offre.startsWith('Comptable H/F — Cabinet Durand'), m && m.offre.slice(0, 60));
}
{
  const { doc, envoyes } = charger('https://candidat.francetravail.fr/offres/recherche/detail/216XGCG', `<html><body>
    <h1 id="labelPopin" itemprop="title">Serveur polyvalent / Barman (H/F)</h1>
    <div itemprop="description">${LONG}</div></body></html>`);
  doc.getElementById('emploia-fab')?.click();
  const m = envoyes.find(e => e.type === 'OPEN_GENERATOR');
  check('France Travail : offre lue par microdonnées', m && m.offre.startsWith('Serveur polyvalent / Barman (H/F)'), m && m.offre.slice(0, 60));
}

// ── 4. Formulaire de candidature ─────────────────────────────────────────
console.log('\n  Remplissage de formulaire');
{
  const profil = { firstName: 'Hugo', lastName: 'Chapelle', email: 'hugo@example.com', phone: '0600000000', location: 'Bordeaux', linkedin: 'https://linkedin.com/in/x', title: 'Growth' };
  const { doc, demander } = charger('https://jobs.example.com/apply/42', `<html><body><form>
    <label for="a">Prénom</label><input id="a" name="firstName"/>
    <label for="b">Nom</label><input id="b" name="lastName"/>
    <input type="email" name="email"/>
    <input type="tel" name="phone"/>
    <label for="c">Nom de l'entreprise actuelle</label><input id="c" name="company_name"/>
    <label for="d">Nombre d'années d'expérience</label><input id="d" name="years"/>
    <textarea name="cover_letter"></textarea>
    <input name="city" value="Déjà rempli"/>
    <input type="file" name="cv"/>
  </form></body></html>`, profil);
  const fab = doc.getElementById('emploia-fab');
  check('le bouton « Remplir avec Emploia » apparaît sur un formulaire', fab && /Remplir/.test(fab.textContent), fab && fab.textContent);
  const res = await demander('TRIGGER_AUTOFILL');
  const v = (n) => doc.querySelector(`[name="${n}"]`).value;
  check('prénom, nom, email, téléphone remplis', v('firstName') === 'Hugo' && v('lastName') === 'Chapelle' && v('email') === 'hugo@example.com' && v('phone') === '0600000000');
  check('« nom de l’entreprise » n’est PAS rempli avec le nom', v('company_name') === '', v('company_name'));
  check('« nombre d’années » n’est PAS pris pour « nom »', v('years') === '', v('years'));
  check('la lettre de motivation n’est pas écrasée par le profil', v('cover_letter') === '');
  check('un champ déjà rempli n’est jamais écrasé', v('city') === 'Déjà rempli');
  check('le compte rendu donne le bon nombre de champs', res && res.count === 4, JSON.stringify(res));
}

console.log(fail ? `\n❌ extension : ${fail} échec(s)` : '\n✅ extension : toutes les vérifications OK');
process.exit(fail ? 1 : 0);
