// Garde de la source unique du barème Écoles.
//
// scripts/pricing/bareme.mjs déclare le barème une fois. Ce garde vérifie que
// personne ne le contredit, et il échoue en nommant le fichier et le montant.
//
// Il ferme une famille de pannes, pas une panne. Le 2026-10-06, 451847a a
// remplacé le prix au siège par le barème par tranches, et seul ecoles.html a
// suivi : la landing a vendu le siège 9 € pendant neuf jours et l'agent de
// support a chiffré 9 € / 6 € / 39 € à de vrais clients. Les correctifs qui
// ont suivi ont gardé un endroit chacun — la relance d'essai (PR 69), la sonde
// de production (PR 71, PR 74), la landing et le prompt de l'agent (PR 79).
// Aucun n'a supprimé la duplication, donc la prochaine divergence restait
// libre de choisir un autre fichier.
//
// Cinq anneaux, du plus proche de la source au plus large :
//
//   [A] le calculateur réellement servi par /ecoles porte les montants
//       déclarés — c'est lui qui chiffre devant l'acheteur ;
//   [B] chaque fichier qui cite le barème le cite dans la forme que la
//       déclaration impose ;
//   [C] aucun fichier du dépôt n'affiche, en face d'une unité du barème, un
//       montant que la déclaration ne connaît pas. Liste blanche dérivée du
//       barème, et non liste noire des anciens prix : une liste des anciens
//       prix ne dirait rien du prochain changement de grille ;
//   [D] la sonde de production dérive ses aiguilles de la déclaration au lieu
//       d'en recopier les montants ;
//   [E] la landing ne réinjecte pas de prix au siège.
//
// Ce garde ne remplace pas scripts/pricing/ecoles.test.mjs, qui extrait et
// exécute le calculateur servi pour confronter ses résultats aux exemples
// publiés. Les deux se complètent : ecoles.test.mjs atteste que la page calcule
// juste, celui-ci que tout le dépôt annonce la même chose qu'elle.
//
// Lancer localement : npm run test:bareme
import fs from 'node:fs';
import path from 'node:path';
import {
  BAREME, EXEMPLES_SIEGES, EXEMPLES_OUTPLACEMENT,
  devisSieges, moyenneParSiege, devisOutplacement,
  euros, eurosSerres, nombre, montantsParUnite,
} from './bareme.mjs';
// La normalisation des espaces est celle de la sonde : U+00A0 insécable,
// U+202F insécable étroite, U+2009 fine. Une seule définition, sinon les deux
// gardes finiraient par ne plus normaliser la même chose.
import { norm, PAGE_ASSERTIONS } from '../smoke/assertions.mjs';

const ROOT = new URL('../../', import.meta.url);
const lire = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');

let passed = 0, failed = 0;
const ok = (label, detail) => { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); };
const ko = (label, detail) => { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); };

// Forme comparable d'un texte : espaces insécables ramenées à l'espace
// ordinaire, balises remplacées par une espace (« 22€<small> /siège » doit se
// lire « 22€ /siège »), suites d'espaces réduites à une seule, et espace de
// groupement des milliers recollée — le dépôt écrit « 2 500 € » dans les pages
// et « 2500€ » dans le prompt de l'agent, et ces deux formes citent le même
// montant. Ne recolle qu'une espace strictement encadrée de chiffres, ce qui
// ne peut pas rapprocher deux montants distincts.
const comparable = (s) => norm(s)
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .replace(/(\d) (?=\d{3}(?!\d))/g, '$1');

const [T1, T2, T3] = BAREME.tranches;
const { forfaitPlateforme, plancher, outplacementUsage, outplacementLicence,
        seuilMiseEnConcurrence } = BAREME;

// ── Les citants, et ce que la déclaration leur impose ───────────────────────
// Chaque citation est construite à partir de la déclaration : changer un
// montant dans bareme.mjs change ce qui est exigé ici, et le fichier resté sur
// l'ancienne valeur échoue en nommant la forme attendue.
//
// La carte « Écoles & RH » de la landing n'est plus un citant depuis ce51237 :
// elle renvoie au devis. Elle est gardée en [E], qui refuse qu'un prix au
// siège y revienne.
const CITANTS = [
  {
    fichier: 'ecoles.html',
    pourquoi: 'la page de vente : title, metas, JSON-LD, tableau, calculateur',
    citations: [
      // Le taux d'entrée, celui que portent le title et les trois metas.
      `${euros(T1.prix)} par siège et par an`,
      // La phrase qui explique le cumul des tranches.
      `les ${nombre(T1.jusqua)} premiers sièges à ${euros(T1.prix)}`,
      `les suivants à ${euros(T2.prix)}`,
      `au-delà de ${nombre(T2.jusqua)} à ${euros(T3.prix)}`,
      `forfait plateforme de ${euros(forfaitPlateforme)}`,
      `Plancher de facturation : ${euros(plancher)}`,
      `${euros(outplacementUsage)} par candidat`,
      `${euros(outplacementLicence)} par consultant`,
      `seuil de ${euros(seuilMiseEnConcurrence)} HT`,
      // Le JSON-LD, qui écrit les prix en entiers nus.
      ...[T1.prix, T2.prix, T3.prix, forfaitPlateforme, outplacementUsage, outplacementLicence]
        .map((m) => `"price": "${m}"`),
      // Le tableau « Ce que cela donne » : totaux et coûts moyens. Ce sont les
      // deux colonnes qui ont déjà divergé l'une de l'autre, la moyenne ayant
      // été calculée un temps hors forfait plateforme.
      ...EXEMPLES_SIEGES.map((n) => euros(devisSieges(n))),
      ...EXEMPLES_SIEGES.map((n) => euros(moyenneParSiege(n), 2)),
      ...EXEMPLES_OUTPLACEMENT.map((e) => euros(devisOutplacement(e.quantite, e.mode))),
    ],
  },
  {
    fichier: 'api/agent/support.js',
    pourquoi: "le prompt de l'agent de support, qui chiffre à de vrais clients",
    citations: [
      `${eurosSerres(T1.prix)}/siège/an pour les ${nombre(T1.jusqua)} premiers sièges`,
      `${eurosSerres(T2.prix)} de ${nombre(T1.jusqua + 1)} à ${nombre(T2.jusqua)}`,
      `${eurosSerres(T3.prix)} au-delà`,
      `forfait plateforme unique de ${eurosSerres(forfaitPlateforme)}`,
      `plancher de facturation de ${eurosSerres(plancher)}`,
      // L'agent doit savoir que le taux au siège seul est trompeur : c'est la
      // consigne qui l'empêche de citer 22 € là où le devis dit 28,25 €.
      `coûte ${eurosSerres(devisSieges(EXEMPLES_SIEGES[0]))}/an`,
      `soit ${eurosSerres(moyenneParSiege(EXEMPLES_SIEGES[0]), 2)} par siège`,
      `${eurosSerres(outplacementUsage)} par candidat accompagné`,
      `licence consultant ${eurosSerres(outplacementLicence)}/an`,
    ],
  },
];

// ── [A] Le calculateur servi porte les montants déclarés ───────────────────
// Le barème vit dans un <script> inline de ecoles.html, servi tel quel : le
// site est statique, sans étape de build (`buildCommand: echo ok`), donc la
// page ne peut pas importer la déclaration sans bundler ni requête réseau sur
// le chemin critique. On extrait donc ses littéraux et on les confronte. La
// page reste octet pour octet ce qu'elle était ; la liberté de diverger, elle,
// a disparu. C'est la technique que scripts/pricing/ecoles.test.mjs emploie
// déjà pour exécuter ce même bloc au lieu d'une copie de sa logique.
console.log('\n[A] Calculateur servi par /ecoles — littéraux vs déclaration');
try {
  const html = lire('ecoles.html');
  const blocs = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const calc = blocs.find((s) => s.includes('__ecQuote'));
  if (!calc) {
    ko('calculateur introuvable dans ecoles.html', 'window.__ecQuote absent');
  } else {
    const tranchesPage = [...calc.matchAll(/\{\s*upTo:\s*(\d+|Infinity)\s*,\s*price:\s*(\d+)\s*\}/g)]
      .map((m) => ({ jusqua: m[1] === 'Infinity' ? Infinity : Number(m[1]), prix: Number(m[2]) }));

    if (tranchesPage.length !== BAREME.tranches.length) {
      ko('ecoles.html : nombre de tranches',
        `la page en déclare ${tranchesPage.length}, la déclaration ${BAREME.tranches.length}`);
    } else {
      BAREME.tranches.forEach((attendue, i) => {
        const servie = tranchesPage[i];
        const borne = attendue.jusqua === Infinity ? '∞' : nombre(attendue.jusqua);
        if (servie.jusqua === attendue.jusqua && servie.prix === attendue.prix) {
          ok(`ecoles.html : tranche ${i + 1} (jusqu'à ${borne}) à ${euros(attendue.prix)}`);
        } else {
          ko(`ecoles.html : tranche ${i + 1} (jusqu'à ${borne})`,
            `la page sert { jusqu'à ${servie.jusqua}, ${servie.prix} € }, la déclaration impose ` +
            `{ jusqu'à ${attendue.jusqua}, ${attendue.prix} € }`);
        }
      });
    }

    // Les constantes scalaires, chacune sous le nom qu'elle porte dans la page.
    const CONSTANTES = [
      ['PLATFORM', forfaitPlateforme, 'forfait plateforme'],
      ['FLOOR', plancher, 'plancher de facturation'],
      ['OUTPL_USAGE', outplacementUsage, "outplacement à l'usage"],
      ['OUTPL_LICENCE', outplacementLicence, 'licence consultant'],
      ['THRESHOLD', seuilMiseEnConcurrence, 'seuil de mise en concurrence'],
    ];
    for (const [nom, attendu, role] of CONSTANTES) {
      const m = calc.match(new RegExp(`var\\s+${nom}\\s*=\\s*(\\d+)`));
      if (!m) {
        ko(`ecoles.html : ${nom} introuvable`,
          `le calculateur ne déclare plus le ${role} — renommé ou retiré, le garde ne peut plus le confronter`);
      } else if (Number(m[1]) !== attendu) {
        ko(`ecoles.html : ${nom} (${role})`,
          `la page sert ${m[1]} €, la déclaration impose ${attendu} €`);
      } else {
        ok(`ecoles.html : ${nom} = ${euros(attendu)}`, role);
      }
    }
  }
} catch (e) { ko('lecture de ecoles.html impossible', e.message); }

// ── [B] Chaque citant cite la déclaration ───────────────────────────────────
console.log('\n[B] Les citants portent les montants déclarés');
for (const { fichier, pourquoi, citations } of CITANTS) {
  console.log(`\n  ${fichier} — ${pourquoi}`);
  let texte;
  try { texte = comparable(lire(fichier)); }
  catch (e) { ko(`${fichier} illisible`, e.message); continue; }

  for (const citation of citations) {
    if (texte.includes(comparable(citation))) ok(`${fichier} cite « ${citation} »`);
    else ko(`${fichier} doit citer « ${citation} »`,
      'absent — soit le barème a changé dans scripts/pricing/bareme.mjs et ce fichier ne l’a pas ' +
      'suivi, soit sa formulation a changé et la citation attendue doit suivre ici');
  }
}

// ── [C] Aucun montant étranger en face d'une unité du barème ───────────────
// C'est l'anneau qui attrape un endroit *nouveau*, que personne n'a pensé à
// inscrire dans CITANTS — celui où la prochaine divergence ira se loger.
//
// Les montants nus sont des sous-mots : « 9€ » vit dans « 59€ », et 12 est
// aussi la commission créateur par vente. Un montant n'est donc examiné que
// s'il porte une unité du barème : « 22 € par siège », « 190€/candidat ».
// Un montant cité sans unité (« 17€ de 501 à 1000 ») reste couvert par [B].
const UNITE = '(?:si[èe]ges?|[ée]tudiants?|candidats?|consultants?)';
const MONTANT = '(\\d{1,3}(?:[ ]?\\d{3})*(?:,\\d+)?)';
const MOTIFS = [
  // « 22€ /siège/an », « 190€/candidat »
  new RegExp(`${MONTANT}\\s?€\\s*/\\s*${UNITE}`, 'gi'),
  // « 22 € par siège », « 1 500 € par consultant et par an »
  new RegExp(`${MONTANT}\\s?€\\s+par\\s+${UNITE}`, 'gi'),
];

// La seule exemption, et elle est structurelle : le travail de cette table est
// de *nommer* les prix morts pour que la sonde les cherche dans les octets
// servis par la production. Les y interdire reviendrait à interdire la garde
// elle-même. Les montants que cette table réclame, eux, sont dérivés de la
// déclaration — c'est l'anneau [D] qui le vérifie, donc rien n'y est écrit à
// la main.
const SANS_BALAYAGE = new Set(['scripts/smoke/assertions.mjs']);

// Tout ce qui est servi ou exécuté : un citant peut naître n'importe où, et le
// garde doit le voir arriver.
const EXTENSIONS = new Set(['.html', '.js', '.mjs']);
const IGNORES = new Set(['node_modules', '.git', '.vercel']);
const parcourir = (dir, out = []) => {
  for (const e of fs.readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
    if (IGNORES.has(e.name)) continue;
    const rel = dir === '.' ? e.name : `${dir}/${e.name}`;
    if (e.isDirectory()) parcourir(rel, out);
    else if (EXTENSIONS.has(path.extname(e.name))) out.push(rel);
  }
  return out;
};

console.log('\n[C] Aucun montant du barème cité hors de la grille déclarée');
try {
  const autorises = montantsParUnite();
  const grille = [...autorises].sort((a, b) => a - b)
    .map((v) => euros(v, Number.isInteger(v) ? 0 : 2)).join(', ');
  const fichiers = parcourir('.').filter((f) => !SANS_BALAYAGE.has(f));
  let etrangers = 0, examines = 0;
  for (const f of fichiers) {
    const texte = comparable(lire(f));
    for (const motif of MOTIFS) {
      for (const m of texte.matchAll(motif)) {
        examines++;
        const montant = Number(m[1].replace(/ /g, '').replace(',', '.'));
        if (autorises.has(montant)) continue;
        ko(`${f} : « ${m[0].trim()} »`,
          `${montant} n'est pas un montant du barème déclaré. Autorisés en face d'une unité : ${grille}. ` +
          'Soit le barème a changé et ce fichier ne l’a pas suivi, soit ce montant est légitime ' +
          'et doit être dérivé de scripts/pricing/bareme.mjs');
        etrangers++;
      }
    }
  }
  if (!etrangers) {
    ok(`${examines} montant(s) cité(s) avec une unité du barème dans ${fichiers.length} fichiers`,
      'tous conformes à la déclaration');
  }
} catch (e) { ko('balayage du dépôt impossible', e.message); }

// ── [D] La sonde dérive ses aiguilles de la déclaration ────────────────────
// Si assertions.mjs recopiait de nouveau les montants, la divergence que ce
// garde ferme pourrait rentrer par cette porte : la sonde réclamerait un
// ancien prix, et l'échec ressemblerait à une régression de production alors
// que c'est la sonde qui serait fausse. C'est exactement ce qui est arrivé au
// « 9 € » de /ecoles, resté dans la sonde trois jours après la bascule.
console.log('\n[D] scripts/smoke/assertions.mjs dérive ses aiguilles du barème');
try {
  const src = lire('scripts/smoke/assertions.mjs');
  if (/from '\.\.\/pricing\/bareme\.mjs'/.test(src)) ok('la sonde importe scripts/pricing/bareme.mjs');
  else ko('la sonde n’importe plus le barème',
    'ses aiguilles de prix seraient de nouveau une copie à la main');

  const ecoles = PAGE_ASSERTIONS.find((a) => a.route === '/ecoles');
  const attendues = [
    euros(T1.prix), euros(T2.prix), euros(T3.prix),
    euros(forfaitPlateforme), nombre(seuilMiseEnConcurrence),
  ];
  for (const attendu of attendues) {
    if (ecoles?.must.includes(attendu)) ok(`la sonde réclame « ${attendu} » sur /ecoles`);
    else ko(`la sonde doit réclamer « ${attendu} » sur /ecoles`, 'aiguille absente de PAGE_ASSERTIONS');
  }
} catch (e) { ko('contrôle de la sonde impossible', e.message); }

// ── [E] La landing ne réinjecte pas de prix au siège ───────────────────────
// Hugo a tranché le 2026-10-15 (ce51237) : la carte « Écoles & RH » renvoie au
// devis, comme legal.html, et le barème ne vit que sur /ecoles. La raison tient
// au barème lui-même — un taux au siège sans le forfait plateforme est
// trompeur : 100 sièges coûtent 4 700 €, soit 47 € le siège et non 22 €.
//
// Une source unique ne doit donc surtout pas remettre un montant ici. Cet
// anneau existe parce que [C] ne suffirait pas : [C] accepte tout montant que
// le barème connaît, et « 22 € par siège » sur la landing serait donc accepté
// alors que c'est précisément ce que la décision a retiré. Si cette décision
// change un jour, inscrire la carte dans CITANTS avec ses citations dérivées
// plutôt que de desserrer cet anneau.
console.log('\n[E] La carte « Écoles & RH » de la landing renvoie au devis');
try {
  const texte = comparable(lire('index.html'));
  const trouves = MOTIFS.flatMap((motif) => [...texte.matchAll(motif)].map((m) => m[0].trim()));
  if (!trouves.length) ok('index.html ne porte aucun prix à l’unité', 'la carte renvoie au devis');
  else for (const t of trouves) {
    ko(`index.html : « ${t} »`,
      'la carte de la landing ne doit pas porter de prix au siège — sans le forfait plateforme ' +
      'il est trompeur, et le devis supprime le problème au lieu de le compenser (ce51237)');
  }
} catch (e) { ko('lecture de index.html impossible', e.message); }

if (failed) {
  console.error(`\n❌ garde du barème : ${failed} échec(s) — ` +
    'scripts/pricing/bareme.mjs est la source ; aligner les fichiers nommés ci-dessus avant de merger\n');
  process.exit(1);
}
console.log(`\n✅ garde du barème : ${passed} vérifications OK\n`);
