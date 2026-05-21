export const config = { runtime: 'nodejs' };

import { kvGet, kvSet, kvSmembers, getGenerationsUsed, htmlEscape } from './_lib/auth.js';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';
const RESEND_KEY = process.env.RESEND_API_KEY;
const DAY = 86400000; // ms
const BATCH_SIZE = 100;

// ── Email helpers ──────────────────────────────────────────────────────────────

function unsubscribeLink(email) {
  return `${BASE_URL}/api/newsletter?action=unsubscribe&email=${encodeURIComponent(email)}`;
}

function emailWrapper({ firstName, subject, headerGradient = 'linear-gradient(135deg,#6366f1,#3b82f6)', body, email }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif">
<div style="max-width:520px;margin:40px auto;padding:0 20px">
  <div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:${headerGradient};padding:28px 32px">
      <div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px">Emploia</div>
    </div>
    <div style="padding:32px">
      ${body}
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">
    &copy; ${year} Emploia &middot;
    <a href="${BASE_URL}" style="color:#94a3b8;text-decoration:none">emploia.fr</a> &middot;
    <a href="${unsubscribeLink(email)}" style="color:#94a3b8;text-decoration:none">Se d&eacute;sabonner</a>
  </p>
</div>
</body>
</html>`;
}

function sendEmail(payload) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: 'Emploia <lea@emploia.fr>', ...payload }),
    signal: AbortSignal.timeout(8000),
  });
}

// ── Email builders ─────────────────────────────────────────────────────────────

function buildJ3Email({ firstName, email }) {
  const body = `
    <h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 12px;letter-spacing:-.5px">Le score ATS&nbsp;: ce chiffre qui d&eacute;cide si tu passes en entretien 📊</h1>
    <p style="color:#475569;line-height:1.7;margin:0 0 16px;font-size:14px">Bonjour ${firstName},</p>
    <p style="color:#475569;line-height:1.7;margin:0 0 16px;font-size:14px">Savais-tu que <strong style="color:#0f172a">75&nbsp;% des CV</strong> ne sont jamais lus par un humain&nbsp;? Ils sont filtr&eacute;s en amont par des logiciels ATS (<em>Applicant Tracking System</em>).</p>
    <p style="color:#475569;line-height:1.7;margin:0 0 20px;font-size:14px">Voici les seuils qui comptent&nbsp;:</p>
    <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:0 10px 10px 0;padding:16px 20px;margin-bottom:20px">
      <div style="font-size:13px;color:#92400e;font-weight:700;margin-bottom:8px">Comment l'ATS te juge</div>
      <div style="font-size:13px;color:#78350f;line-height:1.8">
        🔴 <strong>Score &lt; 60&nbsp;:</strong> CV rejet&eacute; automatiquement, jamais vu<br>
        🟡 <strong>Score 60&ndash;79&nbsp;:</strong> En attente, peu de chances d'&ecirc;tre contact&eacute;<br>
        🟢 <strong>Score &ge; 80&nbsp;:</strong> CV transmis &agrave; un recruteur humain
      </div>
    </div>
    <p style="color:#475569;line-height:1.7;margin:0 0 12px;font-size:14px"><strong style="color:#0f172a">4 conseils pour booster ton score ATS&nbsp;:</strong></p>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:28px">
      <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;background:#f8fafc;border-radius:10px">
        <span style="min-width:22px;height:22px;border-radius:6px;background:#6366f1;color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">1</span>
        <span style="font-size:13px;color:#475569;line-height:1.6"><strong style="color:#0f172a">Reprends les mots-cl&eacute;s exacts</strong> de l'offre d'emploi dans ton CV — les ATS font de la correspondance textuelle.</span>
      </div>
      <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;background:#f8fafc;border-radius:10px">
        <span style="min-width:22px;height:22px;border-radius:6px;background:#6366f1;color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">2</span>
        <span style="font-size:13px;color:#475569;line-height:1.6"><strong style="color:#0f172a">Utilise des intitul&eacute;s de section standards</strong>&nbsp;: "Exp&eacute;rience", "Formation", "Comp&eacute;tences". Les titres cr&eacute;atifs d&eacute;routent les ATS.</span>
      </div>
      <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;background:#f8fafc;border-radius:10px">
        <span style="min-width:22px;height:22px;border-radius:6px;background:#6366f1;color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">3</span>
        <span style="font-size:13px;color:#475569;line-height:1.6"><strong style="color:#0f172a">&Eacute;vite les tableaux et colonnes multiples</strong>&nbsp;: les ATS lisent de gauche &agrave; droite, de haut en bas. Les mises en page complexes cassent l'analyse.</span>
      </div>
      <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;background:#f8fafc;border-radius:10px">
        <span style="min-width:22px;height:22px;border-radius:6px;background:#6366f1;color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">4</span>
        <span style="font-size:13px;color:#475569;line-height:1.6"><strong style="color:#0f172a">Quantifie tes r&eacute;sultats</strong>&nbsp;: "augment&eacute; le CA de 23&nbsp;%" est mieux pars&eacute; qu'"am&eacute;lior&eacute; les ventes".</span>
      </div>
    </div>
    <a href="${BASE_URL}/app" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none;letter-spacing:-.2px">Teste ton score ATS gratuitement →</a>
    <p style="font-size:12px;color:#94a3b8;margin:20px 0 0;line-height:1.6">Analyse imm&eacute;diate, sans carte bancaire.</p>`;

  return {
    to: [email],
    subject: 'Le score ATS : ce chiffre qui décide si tu passes en entretien 📊',
    html: emailWrapper({ firstName, email, body }),
  };
}

function buildJ5Email({ firstName, email }) {
  const body = `
    <h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 12px;letter-spacing:-.5px">${firstName}, tu utilises encore le plan gratuit — voici ce que tu rates 🔓</h1>
    <p style="color:#475569;line-height:1.7;margin:0 0 20px;font-size:14px">Tu as bien commenc&eacute; avec Emploia. Voici ce qu'un passage au Pro changerait concr&egrave;tement&nbsp;:</p>
    <div style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:28px">
      <div style="display:flex;background:#f8fafc;border-bottom:1px solid #e2e8f0">
        <div style="flex:1;padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px">Fonctionnalit&eacute;</div>
        <div style="width:90px;padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-align:center;border-left:1px solid #e2e8f0">Gratuit</div>
        <div style="width:90px;padding:12px 16px;font-size:12px;font-weight:800;color:#6366f1;text-align:center;border-left:1px solid #e2e8f0">Pro</div>
      </div>
      <div style="display:flex;border-bottom:1px solid #f1f5f9">
        <div style="flex:1;padding:12px 16px;font-size:13px;color:#475569">G&eacute;n&eacute;rations de CV</div>
        <div style="width:90px;padding:12px 16px;font-size:13px;color:#94a3b8;text-align:center;border-left:1px solid #f1f5f9">5 max</div>
        <div style="width:90px;padding:12px 16px;font-size:13px;font-weight:700;color:#10b981;text-align:center;border-left:1px solid #f1f5f9">Illimit&eacute;es</div>
      </div>
      <div style="display:flex;border-bottom:1px solid #f1f5f9;background:#fafbff">
        <div style="flex:1;padding:12px 16px;font-size:13px;color:#475569">Simulateur entretien IA 🎤</div>
        <div style="width:90px;padding:12px 16px;font-size:13px;color:#ef4444;text-align:center;border-left:1px solid #f1f5f9">&times;</div>
        <div style="width:90px;padding:12px 16px;font-size:13px;font-weight:700;color:#10b981;text-align:center;border-left:1px solid #f1f5f9">✓</div>
      </div>
      <div style="display:flex;border-bottom:1px solid #f1f5f9">
        <div style="flex:1;padding:12px 16px;font-size:13px;color:#475569">N&eacute;gociation salariale IA</div>
        <div style="width:90px;padding:12px 16px;font-size:13px;color:#ef4444;text-align:center;border-left:1px solid #f1f5f9">&times;</div>
        <div style="width:90px;padding:12px 16px;font-size:13px;font-weight:700;color:#10b981;text-align:center;border-left:1px solid #f1f5f9">✓</div>
      </div>
      <div style="display:flex">
        <div style="flex:1;padding:12px 16px;font-size:13px;color:#475569">Versions de CV sauvegard&eacute;es</div>
        <div style="width:90px;padding:12px 16px;font-size:13px;color:#94a3b8;text-align:center;border-left:1px solid #f1f5f9">3</div>
        <div style="width:90px;padding:12px 16px;font-size:13px;font-weight:700;color:#10b981;text-align:center;border-left:1px solid #f1f5f9">20</div>
      </div>
    </div>
    <div style="background:#ede9fe;border-radius:12px;padding:16px 20px;margin-bottom:28px">
      <p style="font-size:14px;font-weight:700;color:#4c1d95;margin:0 0 8px">🎤 Le simulateur d'entretien IA</p>
      <p style="font-size:13px;color:#5b21b6;margin:0;line-height:1.6">Il analyse ta candidature, g&eacute;n&egrave;re des questions r&eacute;elles, &eacute;value tes r&eacute;ponses et te donne un plan d'am&eacute;lioration personnalis&eacute; — avant l'entretien.</p>
    </div>
    <a href="${BASE_URL}/app" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none;letter-spacing:-.2px">Activer mon essai Pro gratuit →</a>
    <p style="font-size:12px;color:#94a3b8;margin:20px 0 0;line-height:1.6">Aucune carte bancaire requise pour l'essai.</p>`;

  return {
    to: [email],
    subject: `${firstName}, tu utilises encore le plan gratuit — voici ce que tu rates 🔓`,
    html: emailWrapper({ firstName, email, body }),
  };
}

function buildJ7Email({ firstName, email }) {
  const body = `
    <h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 12px;letter-spacing:-.5px">⏳ ${firstName}, d&eacute;bloque Emploia Pro — 7j gratuits t'attendent</h1>
    <p style="color:#475569;line-height:1.7;margin:0 0 16px;font-size:14px">Ta p&eacute;riode de d&eacute;couverte touche &agrave; sa fin. Sans passer au Pro, tu vas perdre acc&egrave;s &agrave;&nbsp;:</p>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:#fff5f5;border:1px solid #fecaca;border-radius:10px">
        <span style="font-size:16px;flex-shrink:0">🚫</span>
        <span style="font-size:13px;color:#475569">G&eacute;n&eacute;rations illimit&eacute;es de CV ATS-optimis&eacute;s</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:#fff5f5;border:1px solid #fecaca;border-radius:10px">
        <span style="font-size:16px;flex-shrink:0">🚫</span>
        <span style="font-size:13px;color:#475569">Simulateur d'entretien IA avec feedback personnalis&eacute;</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:#fff5f5;border:1px solid #fecaca;border-radius:10px">
        <span style="font-size:16px;flex-shrink:0">🚫</span>
        <span style="font-size:13px;color:#475569">N&eacute;gociation salariale IA — email + script argument&eacute;</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:#fff5f5;border:1px solid #fecaca;border-radius:10px">
        <span style="font-size:16px;flex-shrink:0">🚫</span>
        <span style="font-size:13px;color:#475569">20 versions de CV sauvegard&eacute;es</span>
      </div>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:28px">
      <p style="font-size:14px;font-weight:700;color:#166534;margin:0 0 4px">Emploia Pro — 9&nbsp;€ / mois</p>
      <p style="font-size:13px;color:#15803d;margin:0;line-height:1.6">C'est <strong>moins qu'un caf&eacute; par semaine</strong> pour multiplier tes chances de d&eacute;crocher un entretien. Et tu commences par 7&nbsp;jours gratuits.</p>
    </div>
    <a href="${BASE_URL}/app" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none;letter-spacing:-.2px">D&eacute;marrer mon essai gratuit →</a>
    <p style="font-size:12px;color:#94a3b8;margin:20px 0 0;line-height:1.6">Annulation possible &agrave; tout moment, sans engagement.</p>`;

  return {
    to: [email],
    subject: `⏳ ${firstName}, débloque Emploia Pro — 7j gratuits t'attendent`,
    html: emailWrapper({ firstName, email, body }),
  };
}

function buildJ14Email({ firstName, email }) {
  const body = `
    <h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 12px;letter-spacing:-.5px">${firstName}, tu cherches encore un emploi ? (ou c'est r&eacute;gl&eacute; 🎉)</h1>
    <p style="color:#475569;line-height:1.7;margin:0 0 20px;font-size:14px">Coucou ${firstName},</p>
    <p style="color:#475569;line-height:1.7;margin:0 0 20px;font-size:14px">2 semaines que tu as rejoint Emploia. Je me demandais o&ugrave; tu en &eacute;tais dans ta recherche.</p>
    <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:28px">
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px 20px">
        <p style="font-size:14px;font-weight:700;color:#166534;margin:0 0 8px">🎉 Tu as trouv&eacute; un poste ?</p>
        <p style="font-size:13px;color:#15803d;margin:0;line-height:1.6">F&eacute;licitations&nbsp;! C'est une super nouvelle. Si Emploia t'a aid&eacute;, on serait ravis que tu partages ton exp&eacute;rience — &ccedil;a aide beaucoup les autres candidats.</p>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px">
        <p style="font-size:14px;font-weight:700;color:#0f172a;margin:0 0 10px">🔍 Tu es toujours en recherche ?</p>
        <p style="font-size:13px;color:#475569;margin:0 0 10px;line-height:1.6">Voici 3 actions rapides pour relancer ta recherche d&egrave;s aujourd'hui&nbsp;:</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <span style="min-width:22px;height:22px;border-radius:6px;background:#6366f1;color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">1</span>
            <span style="font-size:13px;color:#475569;line-height:1.6">G&eacute;n&egrave;re un nouveau CV adapt&eacute; &agrave; une offre sp&eacute;cifique — pas de CV g&eacute;n&eacute;rique.</span>
          </div>
          <div style="display:flex;align-items:flex-start;gap:10px">
            <span style="min-width:22px;height:22px;border-radius:6px;background:#6366f1;color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">2</span>
            <span style="font-size:13px;color:#475569;line-height:1.6">V&eacute;rifie ton score ATS — une petite am&eacute;lioration peut changer tout.</span>
          </div>
          <div style="display:flex;align-items:flex-start;gap:10px">
            <span style="min-width:22px;height:22px;border-radius:6px;background:#6366f1;color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">3</span>
            <span style="font-size:13px;color:#475569;line-height:1.6">Entra&icirc;ne-toi avec le simulateur d'entretien avant ton prochain RH.</span>
          </div>
        </div>
      </div>
    </div>
    <a href="${BASE_URL}/app" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none;letter-spacing:-.2px">Reprendre ma recherche →</a>
    <p style="font-size:12px;color:#94a3b8;margin:20px 0 0;line-height:1.6">Tu peux aussi r&eacute;pondre directement &agrave; cet email si tu as une question.</p>`;

  return {
    to: [email],
    subject: `${firstName}, tu cherches encore un emploi ? (ou c'est réglé 🎉)`,
    html: emailWrapper({ firstName, email, body }),
  };
}

function buildJ30Email({ firstName, userId, email }) {
  const npsUrl = `${BASE_URL}/nps?uid=${encodeURIComponent(userId)}`;
  const body = `
    <h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 12px;letter-spacing:-.5px">${firstName}, 30 secondes pour nous aider 🙏</h1>
    <p style="color:#475569;line-height:1.7;margin:0 0 16px;font-size:14px">Salut ${firstName},</p>
    <p style="color:#475569;line-height:1.7;margin:0 0 16px;font-size:14px">Ca fait un mois que tu utilises Emploia. Ton avis nous aide vraiment &agrave; am&eacute;liorer l'outil pour tous les candidats.</p>
    <p style="color:#475569;line-height:1.7;margin:0 0 8px;font-size:15px;font-weight:700;color:#0f172a">Une seule question :</p>
    <p style="color:#475569;line-height:1.7;margin:0 0 24px;font-size:14px">Sur une &eacute;chelle de 0 &agrave; 10, quelle est la probabilit&eacute; que tu recommandes Emploia &agrave; quelqu'un qui cherche un emploi&nbsp;?</p>
    <a href="${npsUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none;letter-spacing:-.2px">Donner mon avis (30 sec) →</a>
    <p style="font-size:13px;color:#475569;margin:28px 0 0;line-height:1.7">PS — Tu as d&eacute;croch&eacute; un poste depuis que tu utilises Emploia&nbsp;? R&eacute;ponds &agrave; cet email pour nous le dire, on adore avoir de ces nouvelles 🎉</p>`;

  return {
    to: [email],
    subject: `${firstName}, 30 secondes pour nous aider 🙏`,
    html: emailWrapper({ firstName, email, body }),
  };
}

// ── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Auth check
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers['authorization'] !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!RESEND_KEY) {
    return res.status(500).json({ error: 'No RESEND_API_KEY' });
  }

  try {
    const allUsers = (await kvSmembers('all_users')) || [];
    const total = allUsers.length;

    // Cursor-based pagination (max 100 users per run)
    const rawCursor = (await kvGet('trial_cursor')) || 0;
    const cursor = typeof rawCursor === 'number' ? rawCursor : parseInt(rawCursor, 10) || 0;
    const start = cursor % Math.max(total, 1);
    const batch = allUsers.slice(start, start + BATCH_SIZE);
    const nextCursor = (start + BATCH_SIZE >= total) ? 0 : start + BATCH_SIZE;
    await kvSet('trial_cursor', nextCursor, 86400 * 7);

    const now = Date.now();

    let sent = 0;
    let skipped = 0;

    for (const email of batch) {
      // Skip opted-out users
      const optedOut = await kvGet(`optout:${email}`);
      if (optedOut) { skipped++; continue; }

      const user = await kvGet(`user:${email}`);
      if (!user || !user.createdAt) { skipped++; continue; }

      const age = now - new Date(user.createdAt).getTime();
      const ageDays = age / DAY;

      // Skip users older than 33 days — nothing left to send in this lifecycle
      if (ageDays > 33) { skipped++; continue; }

      const firstNameRaw = (user.name || '').replace(/[\r\n]/g, ' ').split(' ')[0] || '';
      const firstName = htmlEscape(firstNameRaw || 'là');

      let emailSent = false;

      // ── J3: ATS educational (2–4 days, 0 generations) ──
      if (!emailSent && ageDays >= 2 && ageDays < 4) {
        const alreadySent = await kvGet(`trial_j3:${email}`);
        if (!alreadySent) {
          const generationsUsed = (await getGenerationsUsed(email)) ?? (user.generationsUsed || 0);
          if (generationsUsed === 0) {
            try {
              await sendEmail(buildJ3Email({ firstName, email }));
              await kvSet(`trial_j3:${email}`, true, 86400 * 180);
              sent++;
              emailSent = true;
            } catch (err) {
              console.error('[trial-reminder] J3 send error', email, err?.message);
            }
          } else {
            // Has generations — mark as skipped so we don't re-check forever
            await kvSet(`trial_j3:${email}`, 'skip', 86400 * 180);
            skipped++;
            emailSent = true; // prevent falling through to later checks this run
          }
        } else {
          skipped++;
        }
      }

      // ── J5: Upgrade nudge (4–6 days, free plan) ──
      if (!emailSent && ageDays >= 4 && ageDays < 6) {
        const alreadySent = await kvGet(`trial_j5:${email}`);
        if (!alreadySent) {
          if (!user.plan || user.plan === 'free') {
            try {
              await sendEmail(buildJ5Email({ firstName, email }));
              await kvSet(`trial_j5:${email}`, true, 86400 * 180);
              sent++;
              emailSent = true;
            } catch (err) {
              console.error('[trial-reminder] J5 send error', email, err?.message);
            }
          } else {
            await kvSet(`trial_j5:${email}`, 'skip', 86400 * 180);
            skipped++;
            emailSent = true;
          }
        } else {
          skipped++;
        }
      }

      // ── J7: Trial expiration (6–8 days, free plan) ──
      if (!emailSent && ageDays >= 6 && ageDays < 8) {
        const alreadySent = await kvGet(`trial_j7:${email}`);
        if (!alreadySent) {
          if (!user.plan || user.plan === 'free') {
            try {
              await sendEmail(buildJ7Email({ firstName, email }));
              await kvSet(`trial_j7:${email}`, true, 86400 * 180);
              sent++;
              emailSent = true;
            } catch (err) {
              console.error('[trial-reminder] J7 send error', email, err?.message);
            }
          } else {
            await kvSet(`trial_j7:${email}`, 'skip', 86400 * 180);
            skipped++;
            emailSent = true;
          }
        } else {
          skipped++;
        }
      }

      // ── J14: Re-engagement (12–16 days, free plan) ──
      if (!emailSent && ageDays >= 12 && ageDays < 16) {
        const alreadySent = await kvGet(`trial_j14:${email}`);
        if (!alreadySent) {
          if (!user.plan || user.plan === 'free') {
            try {
              await sendEmail(buildJ14Email({ firstName, email }));
              await kvSet(`trial_j14:${email}`, true, 86400 * 90);
              sent++;
              emailSent = true;
            } catch (err) {
              console.error('[trial-reminder] J14 send error', email, err?.message);
            }
          } else {
            await kvSet(`trial_j14:${email}`, 'skip', 86400 * 90);
            skipped++;
            emailSent = true;
          }
        } else {
          skipped++;
        }
      }

      // ── J30: NPS (28–32 days, all plans) ──
      if (!emailSent && ageDays >= 28 && ageDays < 32) {
        const alreadySent = await kvGet(`trial_j30:${email}`);
        if (!alreadySent) {
          try {
            await sendEmail(buildJ30Email({ firstName, userId: user.id || email, email }));
            await kvSet(`trial_j30:${email}`, true, 86400 * 365);
            sent++;
            emailSent = true;
          } catch (err) {
            console.error('[trial-reminder] J30 send error', email, err?.message);
          }
        } else {
          skipped++;
        }
      }

      // User not in any active window
      if (!emailSent) skipped++;
    }

    return res.status(200).json({
      sent,
      skipped,
      processed: batch.length,
      totalUsers: total,
      nextCursor,
    });
  } catch (err) {
    console.error('[trial-reminder] fatal error', err?.message, err?.stack);
    return res.status(500).json({ error: 'Internal server error', message: err?.message });
  }
}
