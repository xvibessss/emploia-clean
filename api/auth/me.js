export const config = { runtime: 'edge' };
import { getCurrentUser, getAllowedOrigin, checkRateLimit, kvGet, kvSet, kvSetNX, htmlEscape } from "../_lib/auth.js";

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };

  if (req.method === "OPTIONS") return new Response(null, {
    status: 204, headers: { ...H, "Access-Control-Allow-Methods": "GET, OPTIONS" }
  });
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "Méthode non autorisée" }), { status: 405, headers: H });

  // Light rate limit on /me
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'me', 60, 60);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '60' } });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: H });

  const refCode = await kvGet(`refcode:${user.id}`);
  let referral = null;
  if (refCode) {
    const refData = await kvGet(`ref:${refCode}`) || {};
    referral = { code: refCode, link: `https://emploia.fr/?ref=${refCode}`, signups: (refData.signups || []).length, monthsEarned: refData.monthsEarned || 0 };
  }

  // Never return passwordHash or salt to client
  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    plan: user.plan || 'free',
    generationsUsed: user.generationsUsed || 0,
    createdAt: user.createdAt,
    avatar: user.avatar || null,
    provider: user.provider || 'email',
    subscriptionId: user.subscriptionId || null,
    stripeCustomerId: user.stripeCustomerId || null,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd || false,
    cancelAt: user.cancelAt || null,
    planActivatedAt: user.planActivatedAt || null,
    lastLoginAt: user.lastLoginAt || null,
    referral,
  };

  // Lazy drip emails — fire async, don't block response
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey && user.createdAt && user.email) {
    const daysSince = (Date.now() - new Date(user.createdAt).getTime()) / 86400000;
    const firstName = htmlEscape((user.name || '').replace(/[\r\n]/g, ' ').split(' ')[0] || 'là');
    const sendDrip = async (key, subject, html) => {
      const fullUser = await kvGet(`user:${user.email}`);
      if (fullUser?.[key]) return;
      // Atomic lock (NX = set only if not exists, TTL=120s) prevents double-send
      // from concurrent /me requests hitting the same user at the same time
      const locked = await kvSetNX(`driplock:${user.email}:${key}`, 1, 120);
      if (!locked) return;
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          signal: AbortSignal.timeout(8000),
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'Emploia <noreply@emploia.fr>', to: [user.email], subject, html }),
        });
        await kvSet(`user:${user.email}`, { ...fullUser, [key]: true });
      } catch { /* fire-and-forget */ }
    };
    const baseHtml = (title, body) => `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif"><div style="max-width:520px;margin:40px auto;padding:0 20px"><div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden"><div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px"><div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff">Emploia</div></div><div style="padding:32px"><h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 12px">${title}</h1>${body}</div></div><p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${new Date().getFullYear()} Emploia · <a href="https://emploia.fr" style="color:#94a3b8">emploia.fr</a> · <a href="https://emploia.fr/api/newsletter?unsubscribe=${encodeURIComponent(user.email)}" style="color:#94a3b8">Se désabonner</a></p></div></body></html>`;
    // Each drip is checked independently (not else-if) so a user inactive
    // for several days still receives all relevant drips on their next visit.
    // sendDrip() is idempotent via KV flags — no double-send risk.
    if (daysSince >= 1 && daysSince < 5) {
      sendDrip('drip1Sent', `${firstName}, vous avez encore 5 générations gratuites 🎁`, baseHtml(
        `${firstName}, votre copilote vous attend`,
        `<p style="color:#475569;line-height:1.6;margin:0 0 20px">Vous avez créé votre compte récemment. Vous n'avez pas encore utilisé toutes vos générations gratuites — et c'est dommage, parce qu'Emploia peut faire des trucs impressionnants.</p><p style="color:#475569;line-height:1.6;margin:0 0 20px"><strong>Ce que vous pouvez générer maintenant :</strong></p><div style="display:flex;flex-direction:column;gap:10px;margin-bottom:28px"><div style="display:flex;align-items:center;gap:12px"><span style="font-size:20px">📄</span><span style="color:#475569;font-size:13px"><strong>CV ATS-optimisé</strong> — Collez une offre, obtenez un CV en 30s qui passe les filtres</span></div><div style="display:flex;align-items:center;gap:12px"><span style="font-size:20px">✉️</span><span style="color:#475569;font-size:13px"><strong>Lettre de motivation</strong> — Personnalisée à l'offre, sans effort</span></div><div style="display:flex;align-items:center;gap:12px"><span style="font-size:20px">🎯</span><span style="color:#475569;font-size:13px"><strong>Score ATS</strong> — Collez votre CV existant, obtenez un score et des conseils</span></div></div><a href="https://emploia.fr/app" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none">Générer maintenant →</a>`
      )).catch(() => {});
    }
    if (daysSince >= 3 && daysSince < 8) {
      sendDrip('drip3Sent', `Comment se passe votre recherche, ${firstName} ? 🤝`, baseHtml(
        `Votre recherche avance ?`,
        `<p style="color:#475569;line-height:1.6;margin:0 0 20px">3 jours depuis votre inscription sur Emploia. On espère que vous avez déjà décroché quelques entretiens !</p><p style="color:#475569;line-height:1.6;margin:0 0 20px">Si vous êtes encore en recherche, voici ce que d'autres candidats ont utilisé cette semaine :</p><div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:24px"><p style="font-size:13px;color:#1e293b;font-style:italic;margin:0 0 8px">"J'ai postulé chez 3 entreprises avec Emploia la première semaine. 2 rappels. Mon score ATS est passé de 41 à 94."</p><p style="font-size:11px;color:#94a3b8;margin:0">— Sophie M., Chargée com' digitale</p></div><p style="color:#475569;font-size:13px;margin:0 0 24px">Passez Pro pour des <strong>générations illimitées</strong> — 7 jours d'essai gratuits, 0€ aujourd'hui.</p><a href="https://emploia.fr/#pricing" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none">Voir les offres Pro →</a>`
      )).catch(() => {});
    }
    if (daysSince >= 7 && daysSince < 21) {
      sendDrip('drip7Sent', `${firstName}, une semaine et votre CV peut déjà être 2× plus visible 📈`, baseHtml(
        `Une semaine. Voici ce que les autres candidats ont fait.`,
        `<p style="color:#475569;line-height:1.6;margin:0 0 20px">Ceux qui passent Pro la première semaine décrochent en moyenne <strong>2,4× plus d'entretiens</strong>. Voici pourquoi :</p><div style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px"><div style="display:flex;align-items:center;gap:12px"><span style="font-size:20px">♾️</span><span style="color:#475569;font-size:13px"><strong>Générations illimitées</strong> — adaptez votre CV à chaque offre, sans jamais vous bloquer</span></div><div style="display:flex;align-items:center;gap:12px"><span style="font-size:20px">🎤</span><span style="color:#475569;font-size:13px"><strong>Coaching entretien IA</strong> — questions types, réponses STAR, feedback immédiat</span></div><div style="display:flex;align-items:center;gap:12px"><span style="font-size:20px">📊</span><span style="color:#475569;font-size:13px"><strong>Dashboard candidatures</strong> — suivez toutes vos postulations en kanban</span></div></div><p style="color:#475569;font-size:13px;margin:0 0 24px">Essai 7 jours gratuit. <strong>0€ aujourd'hui.</strong> Annulation en 1 clic.</p><a href="https://emploia.fr/#pricing" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none">Démarrer l'essai gratuit →</a>`
      )).catch(() => {});
    }
    if (daysSince >= 14 && daysSince < 21) {
      sendDrip('drip14Sent', `${firstName}, votre recherche d'emploi en 3 ressources gratuites 📚`, baseHtml(
        `3 guides pour accélérer votre recherche`,
        `<p style="color:#475569;line-height:1.6;margin:0 0 20px">Deux semaines depuis votre inscription. Pour vous aider à aller encore plus loin, voici nos meilleurs guides :</p>
<div style="display:flex;flex-direction:column;gap:12px;margin-bottom:28px">
  <a href="https://emploia.fr/blog/cv-ats-2026" style="display:flex;align-items:center;gap:14px;padding:14px;background:#f8fafc;border-radius:12px;text-decoration:none">
    <span style="font-size:24px">📄</span>
    <div><div style="font-size:13px;font-weight:700;color:#0f172a">Comment passer les filtres ATS en 2026</div><div style="font-size:12px;color:#64748b">15 min · Le guide complet avec checklist</div></div>
  </a>
  <a href="https://emploia.fr/blog/methode-star-entretien" style="display:flex;align-items:center;gap:14px;padding:14px;background:#f8fafc;border-radius:12px;text-decoration:none">
    <span style="font-size:24px">🎤</span>
    <div><div style="font-size:13px;font-weight:700;color:#0f172a">La méthode STAR avec 3 exemples concrets</div><div style="font-size:12px;color:#64748b">8 min · Structurez vos réponses en entretien</div></div>
  </a>
  <a href="https://emploia.fr/blog/salaires-france-2026" style="display:flex;align-items:center;gap:14px;padding:14px;background:#f8fafc;border-radius:12px;text-decoration:none">
    <span style="font-size:24px">💰</span>
    <div><div style="font-size:13px;font-weight:700;color:#0f172a">Grille des salaires France 2026</div><div style="font-size:12px;color:#64748b">10 min · Tech, Marketing, Finance, RH</div></div>
  </a>
</div>
<a href="https://emploia.fr/app" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none">Retourner sur Emploia →</a>`
      )).catch(() => {});
    }
    if (daysSince >= 21 && daysSince < 35) {
      sendDrip('drip21Sent', `${firstName}, une autre offre vous attend peut-être déjà 🚀`, baseHtml(
        `3 semaines. Les meilleures offres partent vite.`,
        `<p style="color:#475569;line-height:1.6;margin:0 0 20px">3 semaines depuis votre inscription. Le marché de l'emploi bouge vite — certaines offres clôturent en 48 heures.</p>
<p style="color:#475569;line-height:1.6;margin:0 0 20px">Avec Emploia Pro, vous pouvez postuler à <strong>10 offres personnalisées par jour</strong> — CV + lettre adaptés à chaque annonce en moins de 30 secondes.</p>
<div style="background:#f0f9ff;border-left:4px solid #3b82f6;padding:16px;border-radius:0 8px 8px 0;margin-bottom:24px">
  <p style="font-size:13px;color:#1e293b;margin:0 0 6px;font-weight:700">En ce moment sur Emploia :</p>
  <p style="font-size:13px;color:#475569;margin:0">2 847 candidats actifs · 1 200+ offres analysées aujourd'hui · Taux d'entretien +2,4×</p>
</div>
<p style="color:#475569;font-size:13px;margin:0 0 24px">7 jours d'essai gratuit. <strong>Aucune carte bleue requise.</strong></p>
<a href="https://emploia.fr/#pricing" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none">Essayer Pro gratuitement →</a>`
      )).catch(() => {});
    }
    // ── Drip Pro : onboarding des utilisateurs payants ──────────────────────
    // Déclenché sur planActivatedAt, pas createdAt, pour cibler les vrais payants.
    if (user.plan !== 'free' && user.planActivatedAt) {
      const daysPro = (Date.now() - new Date(user.planActivatedAt).getTime()) / 86400000;

      if (daysPro >= 0.5 && daysPro < 3) {
        sendDrip('dripPro1Sent', `Bienvenue dans Emploia Pro, ${firstName} ! Voici comment en tirer le max 🚀`, baseHtml(
          `Vous êtes Pro — voici votre guide de démarrage`,
          `<p style="color:#475569;line-height:1.6;margin:0 0 20px">Bienvenue dans Emploia Pro ! Votre accès illimité est actif. Voici les 4 actions les plus impactantes que nos meilleurs utilisateurs font dans les 48 premières heures :</p>
<div style="display:flex;flex-direction:column;gap:14px;margin-bottom:28px">
  <div style="display:flex;gap:14px;align-items:flex-start;padding:14px;background:#f8fafc;border-radius:12px">
    <span style="font-size:24px;flex-shrink:0">1️⃣</span>
    <div><div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px">Uploadez votre CV existant</div><div style="font-size:13px;color:#475569">Importez votre CV PDF dans Emploia — il sera analysé et pré-rempli dans votre profil pour accélérer toutes vos générations futures.</div></div>
  </div>
  <div style="display:flex;gap:14px;align-items:flex-start;padding:14px;background:#f8fafc;border-radius:12px">
    <span style="font-size:24px;flex-shrink:0">2️⃣</span>
    <div><div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px">Optimisez votre profil LinkedIn</div><div style="font-size:13px;color:#475569">Accédez aux outils Pro : optimisation LinkedIn, négociation salariale, et bilan post-entretien IA — tout sur <a href="https://emploia.fr/tools" style="color:#6366f1">emploia.fr/tools</a>.</div></div>
  </div>
  <div style="display:flex;gap:14px;align-items:flex-start;padding:14px;background:#f8fafc;border-radius:12px">
    <span style="font-size:24px;flex-shrink:0">3️⃣</span>
    <div><div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px">Configurez une alerte emploi</div><div style="font-size:13px;color:#475569">Activez vos alertes pour recevoir les meilleures offres correspondant à votre profil chaque matin directement dans votre boîte mail.</div></div>
  </div>
  <div style="display:flex;gap:14px;align-items:flex-start;padding:14px;background:#f8fafc;border-radius:12px">
    <span style="font-size:24px;flex-shrink:0">4️⃣</span>
    <div><div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px">Testez le simulateur d'entretien</div><div style="font-size:13px;color:#475569">Préparez vos entretiens avec l'IA, puis faites un bilan post-entretien pour identifier vos axes d'amélioration et rédiger votre email de remerciement.</div></div>
  </div>
</div>
<a href="https://emploia.fr/tools" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none">Découvrir tous mes outils Pro →</a>`
        )).catch(() => {});
      }

      if (daysPro >= 5 && daysPro < 7) {
        sendDrip('dripProTrialEndSent', `${firstName ? firstName + ', v' : 'V'}otre essai Pro expire dans ${Math.ceil(7 - daysPro)} jour${Math.ceil(7 - daysPro) > 1 ? 's' : ''} ⏰`, baseHtml(
          `Votre accès Pro illimité expire bientôt`,
          `<p style="color:#475569;line-height:1.6;margin:0 0 16px">Votre essai gratuit de 7 jours expire dans <strong style="color:#ef4444">${Math.ceil(7 - daysPro)} jour${Math.ceil(7 - daysPro) > 1 ? 's' : ''}</strong>. Après cette date, vous repasserez en plan gratuit (5 générations).</p>
<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;border-radius:0 10px 10px 0;margin-bottom:20px">
  <p style="font-size:13px;font-weight:700;color:#991b1b;margin:0 0 8px">Sans abonnement, vous perdrez l'accès à :</p>
  <div style="display:flex;flex-direction:column;gap:6px">
    <div style="font-size:13px;color:#b91c1c;display:flex;align-items:center;gap:8px">✕ Générations illimitées (CV, lettre, score ATS)</div>
    <div style="font-size:13px;color:#b91c1c;display:flex;align-items:center;gap:8px">✕ Coaching entretien IA illimité</div>
    <div style="font-size:13px;color:#b91c1c;display:flex;align-items:center;gap:8px">✕ Smart Apply + Alertes jusqu'à 50 offres</div>
  </div>
</div>
<p style="color:#475569;font-size:13px;margin:0 0 20px">Si vous continuez, <strong>seulement 9€/mois</strong> — annulable en 1 clic à tout moment. Pour vous remercier de votre confiance, votre carte ne sera débitée qu'à la fin de l'essai.</p>
<a href="https://emploia.fr/api/stripe-portal" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none;margin-bottom:12px">Continuer avec Pro → 9€/mois</a>
<p style="font-size:12px;color:#94a3b8;margin:8px 0 0">Annulez avant l'expiration et vous ne payez rien.</p>`
        )).catch(() => {});
      }

      if (daysPro >= 7 && daysPro < 14) {
        sendDrip('dripPro7Sent', `${firstName}, 1 semaine en Pro — conseil avancé pour doubler vos réponses 📈`, baseHtml(
          `7 jours en Pro : la technique que 80 % oublient`,
          `<p style="color:#475569;line-height:1.6;margin:0 0 20px">Une semaine d'accès Pro. La majorité des candidats génèrent un CV, postulent… et attendent. Les meilleurs font quelque chose en plus.</p>
<div style="background:#f0f9ff;border-left:4px solid #6366f1;padding:16px;border-radius:0 12px 12px 0;margin-bottom:24px">
  <p style="font-size:14px;font-weight:800;color:#1e293b;margin:0 0 8px">La technique du "double signal" :</p>
  <p style="font-size:13px;color:#475569;line-height:1.6;margin:0">Après avoir postulé : envoyez un message LinkedIn à un employé du domaine (pas au RH — à quelqu'un qui fait le même métier). Utilisez l'outil LinkedIn Emploia pour générer le message en 10 secondes.</p>
</div>
<p style="color:#475569;line-height:1.6;margin:0 0 20px">Ce double contact augmente le taux de réponse de <strong>3,2×</strong> selon nos données.</p>
<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:28px">
  <a href="https://emploia.fr/tools" style="display:flex;align-items:center;gap:12px;padding:12px;background:#f8fafc;border-radius:10px;text-decoration:none">
    <span style="font-size:20px">💬</span><div style="font-size:13px;font-weight:700;color:#0f172a">Générer un message LinkedIn en 10 secondes</div>
  </a>
  <a href="https://emploia.fr/jobs" style="display:flex;align-items:center;gap:12px;padding:12px;background:#f8fafc;border-radius:10px;text-decoration:none">
    <span style="font-size:20px">🔍</span><div style="font-size:13px;font-weight:700;color:#0f172a">Trouver des offres + employés à contacter</div>
  </a>
  <a href="https://emploia.fr/interview" style="display:flex;align-items:center;gap:12px;padding:12px;background:#f8fafc;border-radius:10px;text-decoration:none">
    <span style="font-size:20px">🎤</span><div style="font-size:13px;font-weight:700;color:#0f172a">Préparer votre prochain entretien</div>
  </a>
</div>
<a href="https://emploia.fr/tools" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none">Accéder aux outils Pro →</a>`
        )).catch(() => {});
      }
    }

    if (daysSince >= 30 && daysSince < 50) {
      sendDrip('drip30Sent', `${firstName}, on ne vous a pas perdu(e) 💪`, baseHtml(
        `Un mois. On garde votre compte actif.`,
        `<p style="color:#475569;line-height:1.6;margin:0 0 20px">Un mois depuis votre inscription sur Emploia. Votre compte est toujours là, avec toutes vos données.</p>
<p style="color:#475569;line-height:1.6;margin:0 0 20px">Si votre recherche d'emploi reprend — ou si vous cherchez à changer de poste dans les prochains mois — Emploia sera là.</p>
<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px">
  <a href="https://emploia.fr/blog/relancer-candidature" style="display:flex;align-items:center;gap:12px;padding:12px;background:#f8fafc;border-radius:10px;text-decoration:none">
    <span style="font-size:20px">📧</span>
    <div style="font-size:13px;font-weight:700;color:#0f172a">Comment relancer une candidature sans paraître insistant</div>
  </a>
  <a href="https://emploia.fr/blog/questions-entretien-rh" style="display:flex;align-items:center;gap:12px;padding:12px;background:#f8fafc;border-radius:10px;text-decoration:none">
    <span style="font-size:20px">🤝</span>
    <div style="font-size:13px;font-weight:700;color:#0f172a">Les 30 questions RH les plus posées — Avec réponses</div>
  </a>
</div>
<a href="https://emploia.fr/app" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none">Reprendre ma recherche →</a>
<p style="margin-top:20px;font-size:12px;color:#94a3b8">Pour ne plus recevoir ces emails : <a href="https://emploia.fr/api/newsletter?unsubscribe=${encodeURIComponent(user.email)}" style="color:#94a3b8">Se désabonner</a></p>`
      )).catch(() => {});
    }
  }

  return new Response(JSON.stringify({ user: safeUser }), { status: 200, headers: H });
}
