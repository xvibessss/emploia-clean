const SKEY = 'emploia_admin_secret';
/* Le secret admin vit dans sessionStorage : propre à cet onglet, effacé à sa
   fermeture. Il était dans localStorage, lisible par tout script de l'origine,
   depuis n'importe quelle page et sans limite de durée — une seule faille XSS
   ailleurs sur le site suffisait à le voler. La ligne suivante purge l'ancienne
   copie chez qui s'était déjà connecté. */
try{localStorage.removeItem(SKEY);}catch{}
const $ = (id) => document.getElementById(id);
const nf = (n) => (Number(n) || 0).toLocaleString('fr-FR');
const eur = (n) => (Number(n) || 0).toLocaleString('fr-FR') + ' €';
const TITLES = { overview:"Vue d'ensemble", revenue:"Revenus & facturation", acquisition:"Acquisition & canaux", seo:"SEO", retention:"Cohortes & rétention", product:"Produit & engagement", automations:"Automatisations", referral:"Parrainage", affiliates:"Créateurs & commissions" };
let DATA = null;

/* ── Auth ── */
function login(){ const v=$('secret').value.trim(); if(!v){$('gateErr').textContent='Entre le secret.';return;} try{sessionStorage.setItem(SKEY,v);}catch{} load(); }
function logout(){ try{sessionStorage.removeItem(SKEY);}catch{} DATA=null; $('shell').hidden=true; $('gate').hidden=false; $('secret').value=''; $('gateErr').textContent=''; }

async function load(){
  let secret=''; try{secret=sessionStorage.getItem(SKEY)||'';}catch{}
  if(!secret){logout();return;}
  try{
    const r=await fetch('/api/admin/stats',{headers:{'x-admin-secret':secret},cache:'no-store'});
    if(r.status===403){$('gateErr').textContent='Secret invalide.'; $('gate').hidden=false; $('shell').hidden=true; return;}
    if(!r.ok) throw new Error('HTTP '+r.status);
    DATA=await r.json();
    $('gate').hidden=true; $('shell').hidden=false; $('gateErr').textContent='';
    $('genAt').textContent = DATA.generatedAt ? 'MàJ '+new Date(DATA.generatedAt).toLocaleString('fr-FR') : '';
    renderAll();
  }catch(e){
    if(!$('shell').hidden){ /* keep view */ }
    else $('gateErr').textContent='Erreur de chargement. Réessaie.';
  }
}

/* ── Nav ── */
function toggleSide(force){ const s=$('side'),b=$('backdrop'); const open=force===undefined?!s.classList.contains('open'):force; s.classList.toggle('open',open); b.classList.toggle('show',open); }
document.getElementById('nav').addEventListener('click',(e)=>{
  const it=e.target.closest('.nav-item'); if(!it) return;
  const k=it.dataset.nav;
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('on',n===it));
  document.querySelectorAll('section[data-sec]').forEach(s=>s.classList.toggle('active',s.dataset.sec===k));
  $('secTitle').textContent=TITLES[k]||'';
  toggleSide(false);
});

/* ── Helpers ── */
function kpi(lbl,val,cls,sub){ return `<div class="card kpi"><div class="lbl">${lbl}</div><div class="val ${cls||''}">${val}</div>${sub?`<div class="sub">${sub}</div>`:''}</div>`; }
function chart(name,days,series){
  series=series||[]; const max=Math.max(1,...series); const total=series.reduce((a,b)=>a+b,0);
  const bars=series.map((v,i)=>`<div class="b ${v>0?'on':''}" style="height:${Math.max(Math.round(v/max*100),2)}%" title="${days[i]}: ${nf(v)}"></div>`).join('');
  return `<div class="card chart"><div class="ct"><span class="nm">${name}</span><span class="tot">${nf(total)} sur 14 j</span></div><div class="bars">${bars}</div><div class="xr"><span>${(days[0]||'').slice(5)}</span><span>${(days[days.length-1]||'').slice(5)}</span></div></div>`;
}
function soonCard(title,what){ return `<div class="card"><div class="empty"><div class="ei">🔌</div><div style="color:var(--t1);font-weight:700;margin-bottom:6px">${title}</div><div class="note" style="max-width:520px;margin:0 auto">${what}</div></div></div>`; }

/* ── Sections ── */
function renderAll(){
  const d=DATA, u=d.users||{}, rev=d.revenue||{}, ev=d.events||{}, oth=d.other||{}, plan=u.byPlan||{}, dd=(d.daily&&Array.isArray(d.daily.days))?d.daily:null;
  const paid=(plan.pro||0)+(plan.intensif||0);

  // Overview
  let h=`<div class="grid kpis">`;
  h+=kpi('👥 Utilisateurs',nf(u.total),'',`${nf(u.newThisWeek)} cette semaine`);
  h+=kpi('💰 MRR',eur(rev.mrr),'grn',`ARR ${eur(rev.arr)}`);
  h+=kpi('📈 Conversion',u.conversionRate||'—','blu',`${nf(paid)} payants`);
  h+=kpi('⚡ Actifs 7 j',nf(u.activeLast7d),'amb',`${nf(u.activeLast30d)} sur 30 j`);
  h+=`</div>`;
  if(Array.isArray(d.funnel)&&d.funnel.length){
    const top=Math.max(1,...d.funnel.map(s=>s.count||0));
    h+=`<div class="sec-h">Entonnoir de conversion</div><div class="card"><div class="funnel">`;
    for(const s of d.funnel){ const w=Math.round((s.count||0)/top*100); const c=(s.conversionFromPrev==null)?'':`<b>${s.conversionFromPrev}%</b> vs préc.`;
      h+=`<div class="fstep"><div class="fl">${s.label}</div><div class="fbar-track"><div class="fbar" style="width:${Math.max(w,3)}%">${nf(s.count)}</div></div><div class="fconv">${c}</div></div>`; }
    h+=`</div><div class="note">Volumes d'événements (pas utilisateurs uniques). % = étape / étape précédente.</div></div>`;
  } else { h+=`<div class="sec-h">Entonnoir</div>`+soonCard('Entonnoir indisponible','Déploie la PR d\'instrumentation (#20) pour activer <code>funnel</code> et <code>daily</code> dans <code>/api/admin/stats</code>.'); }
  if(dd){ h+=`<div class="sec-h">14 derniers jours</div><div class="grid charts">`+chart('Inscriptions',dd.days,dd.user_registered)+chart('CV générés',dd.days,dd.cv_generated)+chart('Checkout lancés',dd.days,dd.checkout_started)+chart('Abonnements',dd.days,dd.plan_upgraded)+`</div>`; }
  $('sec-overview').innerHTML=h;

  // Revenue
  h=`<div class="grid kpis">`+kpi('💰 MRR',eur(rev.mrr),'grn')+kpi('📅 ARR',eur(rev.arr),'grn')+kpi('👤 Payants',nf(paid),'blu',u.conversionRate?`${u.conversionRate} conversion`:'' )+kpi('🧮 ARPU',paid>0?eur((rev.mrr/paid).toFixed(1)):'—','vio','par abonné/mois')+`</div>`;
  h+=`<div class="sec-h">Détail par plan</div><div class="card"><div class="rows">
    <div class="row"><span class="k">Pro — 24 €/mois</span><span class="v">${nf(plan.pro)} · ${eur(rev.proRevenue)}</span></div>
    <div class="row"><span class="k">Pack Campagne — 59 € les 3 mois</span><span class="v">${nf(plan.campagne||0)} · ${eur(rev.campagneRevenue||0)}</span></div>
    <div class="row"><span class="k">Intensif — 49 €/mois <em>(retiré de la vente)</em></span><span class="v">${nf(plan.intensif)} · ${eur(rev.intensifRevenue)}</span></div>
    <div class="row"><span class="k">Gratuit</span><span class="v">${nf(plan.free)}</span></div>
  </div><div class="note">Le Pack Campagne est un paiement unique de 59 €, compté dans le MRR à 19,67 €/mois sur ses 3 mois d'activité.</div>${u.sampleSize?`<div class="note">Réparti sur un échantillon de ${nf(u.sampleSize)}/${nf(u.sampleOf)} utilisateurs.</div>`:''}</div>`;
  $('sec-revenue').innerHTML=h;

  // Acquisition
  h=`<p class="lead">Nouveaux inscrits et canaux d'audience détenus. Les sources de trafic détaillées (organique/référents) se lisent dans Plausible.</p>`;
  h+=`<div class="grid kpis">`+kpi('🆕 Aujourd\'hui',nf(u.newToday))+kpi('🗓️ Cette semaine',nf(u.newThisWeek))+kpi('📨 Alertes',nf(oth.alertSubscribers),'blu')+kpi('✉️ Newsletter',nf(oth.newsletterSubscribers),'blu')+`</div>`;
  if(dd) h+=`<div class="sec-h">Inscriptions — 14 derniers jours</div><div class="grid charts">`+chart('Inscriptions',dd.days,dd.user_registered)+`</div>`;
  $('sec-acquisition').innerHTML=h;

  // SEO (no owned data source server-side)
  $('sec-seo').innerHTML=`<p class="lead">Le SEO est le principal levier d'acquisition d'Emploia (85 pages villes/métiers enrichies). Données Google Search Console (30 derniers jours).</p><div class="card"><div class="empty">Chargement des données Search Console…</div></div>`;
  loadSeo();
  loadAffiliates();

  // Retention
  const dau=u.activeLast7d||0, mau=u.activeLast30d||0;
  h=`<div class="grid kpis">`+kpi('⚡ Actifs 7 j',nf(u.activeLast7d),'amb')+kpi('📆 Actifs 30 j',nf(u.activeLast30d),'amb')+kpi('🔁 Ratio 7j/30j',mau>0?Math.round(dau/mau*100)+'%':'—','vio','proxy de rétention')+kpi('👥 Total',nf(u.total))+`</div>`;
  h+=`<div class="note">Basé sur <code>lastLoginAt</code> / <code>createdAt</code>. Les cohortes détaillées (rétention J1/J7/J30 par semaine d'inscription) nécessitent un historisation d'événements par utilisateur — à ajouter si besoin.</div>`;
  $('sec-retention').innerHTML=h;

  // Product & engagement
  h=`<div class="grid kpis">`+kpi('📄 CV',nf(ev.cvGenerated))+kpi('✉️ Lettres',nf(ev.letterGenerated))+kpi('🎯 Scores ATS',nf(ev.atsChecked))+kpi('🎤 Entretiens',nf(ev.interviewStarted))+`</div>`;
  h+=`<div class="sec-h">Vers la conversion</div><div class="grid kpis">`+kpi('🚧 Paywall vus',nf(ev.paywallViewed),'amb')+kpi('🛒 Checkout lancés',nf(ev.checkoutStarted),'amb')+kpi('✅ Abonnements',nf(ev.plansUpgraded),'grn')+`</div>`;
  if(dd) h+=`<div class="sec-h">14 derniers jours</div><div class="grid charts">`+chart('CV générés',dd.days,dd.cv_generated)+chart('Checkout lancés',dd.days,dd.checkout_started)+`</div>`;
  $('sec-product').innerHTML=h;

  // Automations (real config = the scheduled crons)
  const CRONS=[
    ['Alertes emploi quotidiennes','Tous les jours · 7h','send-alerts'],
    ['Nurture (onboarding)','Tous les jours · 11h','send-nurture'],
    ['Réactivation','Tous les jours · 12h','send-reactivation'],
    ['Réengagement','Tous les jours · 10h','send-reengagement'],
    ['Rappel fin d\'essai','Tous les jours · 9h','trial-reminder'],
    ['Digest hebdo (offres)','Lundi · 7h','send-weekly-digest'],
    ['Rapport hebdo utilisateur','Dimanche · 8h','send-weekly-user-report'],
    ['Agent recrutement','Mardi · 8h','agent/recruiting'],
    ['Agent reporting','Dimanche · 18h','agent/reporting'],
  ];
  h=`<p class="lead">Tâches planifiées réellement configurées (Vercel Cron). Elles tournent automatiquement en production. Les taux d'ouverture/clic par email se brancheront via les webhooks Resend.</p>`;
  h+=`<div class="card"><div class="rows">`+CRONS.map(c=>`<div class="row"><span class="k">${c[0]} <span style="color:var(--t3)">· <code>${c[2]}</code></span></span><span style="display:flex;gap:10px;align-items:center"><span class="v" style="color:var(--t2);font-weight:600">${c[1]}</span><span class="pill ok">actif</span></span></div>`).join('')+`</div></div>`;
  const em=d.email||{};
  if(em.configured){
    h+=`<div class="sec-h">Délivrabilité des emails</div><div class="grid kpis">`
      +kpi('📤 Envoyés',nf(em.sent))
      +kpi('📬 Délivrés',nf(em.delivered),'blu')
      +kpi('👁️ Taux d\'ouverture',em.openRate==null?'—':em.openRate+'%','grn',`${nf(em.opened)} ouvertures`)
      +kpi('🖱️ Taux de clic',em.clickRate==null?'—':em.clickRate+'%','amb',`${nf(em.clicked)} clics`)
      +`</div>`;
    if((em.bounced||0)+(em.complained||0)>0) h+=`<div class="note">${nf(em.bounced)} bounces · ${nf(em.complained)} plaintes. Source : webhooks Resend.</div>`;
  } else {
    h+=`<div class="sec-h">Délivrabilité des emails</div>`+soonCard('En attente des webhooks Resend','L\'endpoint <code>/api/resend-webhook</code> est prêt. Dans Resend → Webhooks, ajoute <code>https://emploia.eu/api/resend-webhook</code>, abonne-toi aux événements <code>email.*</code>, puis mets la clé de signature dans <code>RESEND_WEBHOOK_SECRET</code>. Les taux d\'ouverture et de clic s\'afficheront ici.');
  }
  $('sec-automations').innerHTML=h;

  // Referral
  const rf=d.referral||{};
  h=`<p class="lead">Chaque utilisateur a un code de parrainage : le parrain gagne +30 j Pro par filleul inscrit (max 6), le filleul reçoit +14 j. Compteurs en direct.</p>`;
  h+=`<div class="grid kpis">`+kpi('🎁 Parrainages',nf(rf.signups),'grn','filleuls inscrits')+kpi('🔗 Codes créés',nf(rf.codesCreated),'blu')+kpi('📈 Taux d\'activation',rf.conversion==null?'—':rf.conversion+'%','vio','inscrits / codes créés')+`</div>`;
  h+=`<div class="note">Source : <code>track:referral_signup</code> / <code>track:referral_code_created</code>. Le détail par parrain reste dans <code>/api/referral</code>.</div>`;
  $('sec-referral').innerHTML=h;
}

/* SEO — Google Search Console (separate endpoint) */
async function loadAffiliates(){
  let secret=''; try{secret=sessionStorage.getItem(SKEY)||'';}catch{}
  const lead=`<p class="lead">Codes créateurs TikTok. Le code donne <b>10 € de réduction</b> sur le Pack Campagne (59 € → 49 €) et sert de clé d'attribution. La commission est de <b>12 € par vente</b>, versée à la main : après avoir payé un créateur, clique « Marquer payé » pour remettre son solde à zéro.</p>`;
  try{
    const r=await fetch('/api/admin/affiliates',{headers:{'x-admin-secret':secret},cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const s=await r.json();
    const list=s.affiliates||[], tot=s.totals||{};
    let h=lead+`<div class="grid kpis">`
      +kpi('🛒 Ventes via créateurs',nf(tot.sales),'grn')
      +kpi('💶 Encaissé brut',eur(tot.grossRevenue),'blu')
      +kpi('📤 Commissions à verser',eur(tot.commissionOwed),'amb')
      +kpi('✅ Net après commissions',eur(tot.netRevenue),'vio')
      +`</div>`;
    h+=`<div class="sec-h">Par créateur</div><div class="card"><div class="rows">`;
    if(!list.length) h+=`<div class="empty" style="padding:16px">Aucune vente attribuée à un code pour l'instant. Crée un code promo dans Stripe, puis partage le lien <code>emploia.eu/?code=LECODE</code>.</div>`;
    else list.forEach(a=>{
      h+=`<div class="row"><span class="k"><b>${esc(a.code)}</b> · ${nf(a.sales)} vente${a.sales>1?'s':''} · ${nf(a.unpaidSales)} non réglée${a.unpaidSales>1?'s':''}</span>`
       +`<span class="v">${eur(a.commissionOwed)} dû · <button class="btn ghost" style="padding:4px 10px;font-size:12px" data-on-click="markPaid_this_getAttribute_dat_373f" data-arg-17ff-0="${esc(a.code)}" data-arg-17ff-1="${esc(JSON.stringify(a.sales))}">Marquer payé</button></span></div>`;
    });
    h+=`</div></div>`;
    $('sec-affiliates').innerHTML=h;
  }catch(e){
    $('sec-affiliates').innerHTML=lead+soonCard('Commissions indisponibles','Impossible de lire <code>/api/admin/affiliates</code>. Vérifie que <code>ADMIN_SECRET</code> est bien posé sur Vercel.');
  }
}

async function markPaid(code,sales){
  if(!confirm(`Confirmer le versement à ${code} ? Son solde repassera à 0 €.`)) return;
  let secret=''; try{secret=sessionStorage.getItem(SKEY)||'';}catch{}
  try{
    const r=await fetch('/api/admin/affiliates',{method:'POST',headers:{'x-admin-secret':secret,'Content-Type':'application/json'},body:JSON.stringify({code:code,paidSales:sales})});
    if(!r.ok) throw new Error('HTTP '+r.status);
    loadAffiliates();
  }catch(e){ alert('Échec de l\'enregistrement du versement. Réessaie.'); }
}

async function loadSeo(){
  let secret=''; try{secret=sessionStorage.getItem(SKEY)||'';}catch{}
  const lead=`<p class="lead">Le SEO est le principal levier d'acquisition d'Emploia (85 pages villes/métiers enrichies). Données Google Search Console (30 derniers jours).</p>`;
  try{
    const r=await fetch('/api/seo-metrics',{headers:{'x-admin-secret':secret},cache:'no-store'});
    const s=await r.json();
    if(!r.ok||s.configured===false){
      $('sec-seo').innerHTML=lead+soonCard('Brancher Google Search Console','Crée un <b>compte de service Google</b>, ajoute son email comme utilisateur de ta propriété dans Search Console, puis renseigne <code>GSC_CLIENT_EMAIL</code>, <code>GSC_PRIVATE_KEY</code> et <code>GSC_SITE_URL</code> sur Vercel. Les requêtes, clics et positions s\'afficheront ici automatiquement.');
      return;
    }
    if(s.error){ $('sec-seo').innerHTML=lead+soonCard('Search Console : erreur',esc(s.detail||s.error)+'. Vérifie que le compte de service a bien accès à la propriété.'); return; }
    const t=s.totals||{};
    let h=lead+`<div class="grid kpis">`
      +kpi('🖱️ Clics',nf(t.clicks),'grn')
      +kpi('👁️ Impressions',nf(t.impressions),'blu')
      +kpi('📊 CTR',(t.ctr==null?'—':t.ctr+'%'),'amb')
      +kpi('📍 Position moy.',(t.position==null?'—':t.position),'vio')
      +`</div>`;
    const tbl=(title,rows)=>{ let x=`<div class="sec-h">${title}</div><div class="card"><div class="rows">`;
      if(!rows||!rows.length) x+=`<div class="empty" style="padding:16px">Aucune donnée sur la période.</div>`;
      else rows.forEach(rw=>{ x+=`<div class="row"><span class="k" style="max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(rw.key)}</span><span class="v">${nf(rw.clicks)} clics · ${nf(rw.impressions)} imp · ${rw.position}</span></div>`; });
      return x+`</div></div>`; };
    h+=tbl('Top requêtes',s.topQueries)+tbl('Top pages',s.topPages);
    $('sec-seo').innerHTML=h;
  }catch(e){
    $('sec-seo').innerHTML=lead+soonCard('Search Console indisponible','Réessaie plus tard, ou vérifie la configuration <code>GSC_*</code> sur Vercel.');
  }
}
function esc(s){return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

/* auto-load if secret present */
(function(){ let s=''; try{s=sessionStorage.getItem(SKEY)||'';}catch{} if(s) load(); })();

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["if_event_key_Enter_login_8723"] = function (event) {
  if(event.key==='Enter')login()
};
EMP_H["load"] = function (event) {
  load()
};
EMP_H["login"] = function (event) {
  login()
};
EMP_H["logout"] = function (event) {
  logout()
};
EMP_H["markPaid_this_getAttribute_dat_373f"] = function (event) {
  markPaid(this.getAttribute("data-arg-17ff-0"),JSON.parse(this.getAttribute("data-arg-17ff-1")))
};
EMP_H["toggleSide"] = function (event) {
  toggleSide()
};
EMP_H["toggleSide_false_b401"] = function (event) {
  toggleSide(false)
};
