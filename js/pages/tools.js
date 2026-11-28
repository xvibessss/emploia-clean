function switchTool(name) {
  document.querySelectorAll('.tool-tab').forEach((t, i) => t.classList.toggle('active', ['linkedin','relance','outreach','negociation','debrief','entreprise','questions','ats'][i] === name));
  document.querySelectorAll('.tool-section').forEach(s => s.classList.remove('active'));
  document.getElementById('tool-' + name).classList.add('active');
}

function setLoading(btnId, loading, label) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading ? `<span class="spin"></span>Génération en cours…` : label;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function copyText(text) {
  // Même garde-fou que l'export d'app.html : on ne laisse pas partir un
  // texte encore truffé de marqueurs « [à compléter] » sans le signaler.
  if (!empConfirmIfIncomplete(text)) return;
  navigator.clipboard.writeText(text).then(() => empToast('Copié !', 'success')).catch(() => empToast('Copie impossible', 'error'));
}

// ── LINKEDIN SUMMARY ────────────────────────
async function generateLinkedin() {
  const profile = document.getElementById('li-profile').value.trim();
  if (!profile) return empToast('Collez d\'abord votre profil', 'error');
  setLoading('li-btn', true, 'Générer mon profil LinkedIn');
  try {
    const res = await fetch('/api/generate/linkedin-summary', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile,
        targetRole: document.getElementById('li-role').value.trim(),
        tone: document.getElementById('li-tone').value,
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      if (res.status === 401) return empRedirectToAuth();
      if (res.status === 402) return empShowUpgrade();
      return empToast(d.error || 'Erreur', 'error');
    }
    document.getElementById('li-placeholder').style.display = 'none';
    const out = document.getElementById('li-output');
    out.style.display = 'block';
    const saveRow = document.getElementById('li-save-row');
    if (saveRow) { saveRow.style.display = 'block'; const sb = document.getElementById('li-save-btn'); if (sb) { sb.disabled = false; sb.textContent = '📁 Sauvegarder dans mes docs'; } }
    out.innerHTML = `
      <div class="result-block">
        <div class="result-block-title" style="display:flex;justify-content:space-between;align-items:center">
          Section "À propos" <button class="copy-btn" data-on-click="copyText_JSON_parse_this_getAt_e441" data-arg-fabb-0="${esc(JSON.stringify(d.about))}">Copier</button>
        </div>
        <div class="result-block-body">${esc(d.about)}</div>
      </div>
      <div class="result-block">
        <div class="result-block-title" style="display:flex;justify-content:space-between;align-items:center">
          Titre LinkedIn <button class="copy-btn" data-on-click="copyText_JSON_parse_this_getAt_3384" data-arg-0f53-0="${esc(JSON.stringify(d.headline))}">Copier</button>
        </div>
        <div class="result-block-body" style="font-weight:700">${esc(d.headline)}</div>
      </div>
      <div class="result-block">
        <div class="result-block-title">Top 10 compétences LinkedIn</div>
        <div class="tag-list">${(d.skills || []).map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div>
      </div>
      <div class="result-block">
        <div class="result-block-title">Mots-clés recruteurs</div>
        <div class="tag-list">${(d.keywords || []).map(k => `<span class="tag" style="background:var(--bld);color:var(--blb)">${esc(k)}</span>`).join('')}</div>
      </div>
      ${d.tips?.length ? `<div class="result-block"><div class="result-block-title">Conseils d'optimisation</div>${d.tips.map(t => `<div class="tip-item">${esc(t)}</div>`).join('')}</div>` : ''}
    `;
    empRevisionPanel(out);
  } catch { empToast('Erreur réseau', 'error'); }
  finally { setLoading('li-btn', false, 'Générer mon profil LinkedIn'); }
}

// ── EMAIL DE RELANCE ─────────────────────────
async function generateRelance() {
  const company = document.getElementById('rel-company').value.trim();
  const job = document.getElementById('rel-job').value.trim();
  if (!company && !job) return empToast('Précisez au moins l\'entreprise ou le poste', 'error');
  setLoading('rel-btn', true, 'Générer l\'email de relance');
  try {
    const res = await fetch('/api/generate/follow-up', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobTitle: job,
        company,
        daysAgo: parseInt(document.getElementById('rel-days').value) || 14,
        senderName: document.getElementById('rel-name').value.trim(),
        contactName: document.getElementById('rel-contact').value.trim(),
        tone: document.getElementById('rel-tone').value,
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      if (res.status === 401) return empRedirectToAuth();
      if (res.status === 402) return empShowUpgrade();
      return empToast(d.error || 'Erreur', 'error');
    }
    document.getElementById('rel-placeholder').style.display = 'none';
    const out = document.getElementById('rel-output');
    out.style.display = 'block';
    const relAllText = `Objet : ${d.subject || ''}\n\n--- Version courte ---\n${d.short || ''}\n\n--- Version développée ---\n${d.long || ''}`;
    out.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
        <button data-on-click="copyText_JSON_parse_this_getAt_8cf9" data-arg-38e8-0="${esc(JSON.stringify(relAllText))}" class="emp-btn emp-btn-secondary emp-btn-sm">📋 Tout copier</button>
      </div>
      <div class="result-block">
        <div class="result-block-title" style="display:flex;justify-content:space-between;align-items:center">
          Objet <button class="copy-btn" data-on-click="copyText_JSON_parse_this_getAt_06a3" data-arg-16cc-0="${esc(JSON.stringify(d.subject))}">Copier</button>
        </div>
        <div class="result-block-body" style="font-weight:700">${esc(d.subject)}</div>
      </div>
      <div class="result-block">
        <div class="result-block-title" style="display:flex;justify-content:space-between;align-items:center">
          Version courte <button class="copy-btn" data-on-click="copyText_JSON_parse_this_getAt_a04a" data-arg-6c7e-0="${esc(JSON.stringify(d.short))}">Copier</button>
        </div>
        <div class="result-block-body">${esc(d.short)}</div>
      </div>
      <div class="result-block">
        <div class="result-block-title" style="display:flex;justify-content:space-between;align-items:center">
          Version développée <button class="copy-btn" data-on-click="copyText_JSON_parse_this_getAt_bc69" data-arg-7c0f-0="${esc(JSON.stringify(d.long))}">Copier</button>
        </div>
        <div class="result-block-body">${esc(d.long)}</div>
      </div>
      ${d.tips?.length ? `<div class="result-block"><div class="result-block-title">Conseils</div>${d.tips.map(t => `<div class="tip-item">${esc(t)}</div>`).join('')}</div>` : ''}
    `;
    empRevisionPanel(out);
  } catch { empToast('Erreur réseau', 'error'); }
  finally { setLoading('rel-btn', false, 'Générer l\'email de relance'); }
}

// ── LINKEDIN OUTREACH ────────────────────────
async function generateOutreach() {
  const company = document.getElementById('out-company').value.trim();
  if (!company) return empToast('Précisez l\'entreprise cible', 'error');
  setLoading('out-btn', true, 'Générer les messages');
  try {
    const res = await fetch('/api/generate/linkedin-outreach', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company,
        jobTitle: document.getElementById('out-job').value.trim(),
        senderName: document.getElementById('out-name').value.trim(),
        profile: document.getElementById('out-profile').value.trim(),
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      if (res.status === 401) return empRedirectToAuth();
      if (res.status === 402) return empShowUpgrade();
      return empToast(d.error || 'Erreur', 'error');
    }
    document.getElementById('out-placeholder').style.display = 'none';
    const out = document.getElementById('out-output');
    out.style.display = 'block';
    out.innerHTML = `
      <div class="result-block">
        <div class="result-block-title" style="display:flex;justify-content:space-between;align-items:center">
          Message RH / Recruteur <button class="copy-btn" data-on-click="copyText_JSON_parse_this_getAt_0f2f" data-arg-7728-0="${esc(JSON.stringify(d.direct))}">Copier</button>
        </div>
        <div class="result-block-body">${esc(d.direct)}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:4px">${(d.direct||'').length}/300 caractères</div>
      </div>
      <div class="result-block">
        <div class="result-block-title" style="display:flex;justify-content:space-between;align-items:center">
          Message employé du domaine <button class="copy-btn" data-on-click="copyText_JSON_parse_this_getAt_78f1" data-arg-b6a7-0="${esc(JSON.stringify(d.indirect))}">Copier</button>
        </div>
        <div class="result-block-body">${esc(d.indirect)}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:4px">${(d.indirect||'').length}/300 caractères</div>
      </div>
      ${d.tip ? `<div class="tip-item">${esc(d.tip)}</div>` : ''}
    `;
    empRevisionPanel(out);
  } catch { empToast('Erreur réseau', 'error'); }
  finally { setLoading('out-btn', false, 'Générer les messages'); }
}

// ── NÉGOCIATION SALARIALE ────────────────────
async function generateNegociation() {
  const job = document.getElementById('neg-job').value.trim();
  if (!job) return empToast('Précisez le poste concerné', 'error');
  const offer = parseInt(document.getElementById('neg-offer').value) || 0;
  const target = parseInt(document.getElementById('neg-target').value) || 0;
  if (target > 0 && offer > 0 && target <= offer) return empToast('Le salaire cible doit être supérieur à l\'offre', 'error');
  setLoading('neg-btn', true, 'Générer mon kit de négociation');
  try {
    const res = await fetch('/api/generate/salary-negotiation', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobTitle: job,
        company: document.getElementById('neg-company').value.trim(),
        offerAmount: offer,
        targetAmount: target,
        experience: document.getElementById('neg-args').value.trim(),
        senderName: document.getElementById('neg-name').value.trim(),
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      if (res.status === 401) return empRedirectToAuth();
      if (res.status === 403) {
        document.getElementById('neg-gate').style.display = 'block';
        document.getElementById('neg-form').style.display = 'none';
        return;
      }
      return empToast(d.error || 'Erreur', 'error');
    }
    document.getElementById('neg-placeholder').style.display = 'none';
    const out = document.getElementById('neg-output');
    out.style.display = 'block';
    out.innerHTML = `
      <div class="result-block">
        <div class="result-block-title" style="display:flex;justify-content:space-between;align-items:center">
          Email de négociation <button class="copy-btn" data-on-click="copyText_JSON_parse_this_getAt_ff15" data-arg-ccba-0="${esc(JSON.stringify(d.email))}">Copier</button>
        </div>
        <div class="result-block-body">${esc(d.email)}</div>
      </div>
      ${d.script ? `<div class="result-block"><div class="result-block-title" style="display:flex;justify-content:space-between;align-items:center">Script d'appel <button class="copy-btn" data-on-click="copyText_JSON_parse_this_getAt_302b" data-arg-7599-0="${esc(JSON.stringify(d.script))}">Copier</button></div><div class="result-block-body">${esc(d.script)}</div></div>` : ''}
      ${d.arguments?.length ? `<div class="result-block"><div class="result-block-title">Vos arguments clés</div>${d.arguments.map(a => `<div class="tip-item">${esc(a)}</div>`).join('')}</div>` : ''}
      ${d.marketContext ? `<div class="result-block"><div class="result-block-title">Contexte marché</div><div class="tip-item" style="background:var(--bld);color:var(--blb)">${esc(d.marketContext)}</div></div>` : ''}
      ${d.counterArguments?.length ? `<div class="result-block"><div class="result-block-title">Objections &amp; réponses</div>${d.counterArguments.map(c => `<div class="counter-item"><div class="counter-obj">❓ ${esc(c.objection)}</div><div class="counter-rep">→ ${esc(c.reponse)}</div></div>`).join('')}</div>` : ''}
      ${d.alternatives?.length ? `<div class="result-block"><div class="result-block-title">Si le salaire est bloqué</div>${d.alternatives.map(a => `<div class="tip-item">${esc(a)}</div>`).join('')}</div>` : ''}
      ${d.redLines?.length ? `<div class="result-block"><div class="result-block-title" style="color:#ef4444">À ne surtout pas dire</div>${d.redLines.map(r => `<div class="tip-item" style="background:rgba(239,68,68,.08);color:#ef4444">${esc(r)}</div>`).join('')}</div>` : ''}
    `;
    empRevisionPanel(out);
  } catch { empToast('Erreur réseau', 'error'); }
  finally { setLoading('neg-btn', false, 'Générer mon kit de négociation'); }
}

// ── INTERVIEW DEBRIEF ───────────────────────
async function generateDebrief() {
  const job = document.getElementById('db-job').value.trim();
  const notes = document.getElementById('db-notes').value.trim();
  if (!job) return empToast('Précisez le poste et l\'entreprise', 'error');
  if (!notes) return empToast('Décrivez comment s\'est passé l\'entretien', 'error');
  setLoading('debrief-btn', true, 'Analyser mon entretien ✨');
  try {
    const res = await fetch('/api/generate/interview-debrief', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobTitle: job,
        notes,
        jobDescription: document.getElementById('db-jd').value.trim(),
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      if (res.status === 401) return empRedirectToAuth();
      if (res.status === 403) {
        document.getElementById('debrief-gate').style.display = 'block';
        document.getElementById('debrief-form').style.display = 'none';
        return;
      }
      return empToast(d.error || 'Erreur', 'error');
    }
    document.getElementById('debrief-placeholder').style.display = 'none';
    const out = document.getElementById('debrief-output');
    out.style.display = 'block';
    const score = d.score ?? null;
    out.innerHTML = `
      ${score !== null ? `<div class="result-block" style="background:linear-gradient(135deg,rgba(99,102,241,.08),rgba(59,130,246,.05))"><div class="result-block-title">Score global</div><div style="font-size:32px;font-weight:900;color:var(--acc)">${score}/10</div><div style="font-size:13px;color:var(--t2);margin-top:4px">${esc(d.scoreComment||'')}</div></div>` : ''}
      ${d.strengths?.length ? `<div class="result-block"><div class="result-block-title" style="color:#22c55e">✅ Points forts</div>${d.strengths.map(s => `<div class="tip-item" style="background:rgba(34,197,94,.08);color:#22c55e">${esc(s)}</div>`).join('')}</div>` : ''}
      ${d.improvements?.length ? `<div class="result-block"><div class="result-block-title" style="color:#f59e0b">⚠️ Axes d'amélioration</div>${d.improvements.map(i => `<div class="tip-item" style="background:rgba(245,158,11,.08);color:#f59e0b">${esc(i)}</div>`).join('')}</div>` : ''}
      ${d.keyAnswers?.length ? `<div class="result-block"><div class="result-block-title">💡 Ce que vous auriez pu dire</div>${d.keyAnswers.map(k => `<div class="counter-item"><div class="counter-obj">${esc(k.question)}</div><div class="counter-rep">${esc(k.betterAnswer)}</div></div>`).join('')}</div>` : ''}
      ${d.thankYouEmail ? `<div class="result-block"><div class="result-block-title" style="display:flex;justify-content:space-between;align-items:center">Email de remerciement <button class="copy-btn" data-on-click="copyText_JSON_parse_this_getAt_8d7d" data-arg-6b7b-0="${esc(JSON.stringify(d.thankYouEmail))}">Copier</button></div><div class="result-block-body">${esc(d.thankYouEmail)}</div></div>` : ''}
      ${d.nextSteps?.length ? `<div class="result-block"><div class="result-block-title">🚀 Prochaines étapes</div>${d.nextSteps.map(s => `<div class="tip-item">${esc(s)}</div>`).join('')}</div>` : ''}
    `;
    empRevisionPanel(out);
  } catch { empToast('Erreur réseau', 'error'); }
  finally { setLoading('debrief-btn', false, 'Analyser mon entretien ✨'); }
}

// ── ANALYSE ENTREPRISE ───────────────────────
async function generateEntreprise() {
  const company = document.getElementById('ent-company').value.trim();
  if (!company) return empToast('Précisez le nom de l\'entreprise', 'error');
  setLoading('ent-btn', true, 'Analyser l\'entreprise');
  try {
    const res = await fetch('/api/company-insights', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company,
        jobTitle: document.getElementById('ent-job').value.trim(),
        jobDescription: document.getElementById('ent-jd').value.trim(),
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      if (res.status === 401) return empRedirectToAuth();
      return empToast(d.error || 'Erreur', 'error');
    }
    document.getElementById('ent-placeholder').style.display = 'none';
    const out = document.getElementById('ent-output');
    out.style.display = 'block';
    out.innerHTML = `
      <div class="result-block">
        <div class="result-block-title">🏢 Culture &amp; environnement</div>
        <div class="tip-item" style="font-weight:600">${esc(d.cultureType || '')}</div>
        <div class="result-block-body" style="margin-top:8px">${esc(d.cultureDesc || '')}</div>
      </div>
      <div class="result-block">
        <div class="result-block-title">🎤 Processus d'entretien probable</div>
        <div class="tip-item"><strong>Style :</strong> ${esc(d.interviewStyle || '')}</div>
        <div class="tip-item" style="margin-top:6px">${esc(d.interviewProcess || '')}</div>
      </div>
      ${d.toResearch?.length ? `<div class="result-block"><div class="result-block-title">📚 À connaître avant l'entretien</div>${d.toResearch.map(r => `<div class="tip-item">${esc(r)}</div>`).join('')}</div>` : ''}
      ${d.talkingPoints?.length ? `<div class="result-block"><div class="result-block-title">💡 Angles différenciants à valoriser</div>${d.talkingPoints.map(t => `<div class="tip-item" style="background:rgba(110,72,190,.08);color:var(--primary)">${esc(t)}</div>`).join('')}</div>` : ''}
      ${d.questionsToAsk?.length ? `<div class="result-block"><div class="result-block-title">❓ Questions à poser au recruteur</div>${d.questionsToAsk.map(q => `<div class="tip-item">${esc(q)}</div>`).join('')}</div>` : ''}
      ${d.salaryContext ? `<div class="result-block"><div class="result-block-title">💰 Contexte salarial</div><div class="tip-item" style="background:rgba(93,175,160,.1);color:#2d7a6e">${esc(d.salaryContext)}</div></div>` : ''}
      ${d.redFlags?.filter(Boolean).length ? `<div class="result-block"><div class="result-block-title" style="color:#ef4444">⚠️ Signaux d'alerte</div>${d.redFlags.filter(Boolean).map(r => `<div class="tip-item" style="background:rgba(239,68,68,.08);color:#ef4444">${esc(r)}</div>`).join('')}</div>` : ''}
    `;
    empRevisionPanel(out);
  } catch { empToast('Erreur réseau', 'error'); }
  finally { setLoading('ent-btn', false, 'Analyser l\'entreprise'); }
}

// ── QUESTIONS ENTRETIEN ──────────────────────
let iqLevel = 'mid';

function setIQLevel(level) {
  iqLevel = level;
  document.querySelectorAll('[data-iq]').forEach(b => b.classList.toggle('active', b.dataset.iq === level));
}

async function generateQuestions() {
  const jobTitle = document.getElementById('iq-job').value.trim();
  if (!jobTitle) return empToast('Précisez le poste visé', 'error');
  if (!window.empUser) return empShowAuth('login');
  setLoading('iq-btn', true, 'Générer les questions ✨');
  try {
    const res = await fetch('/api/generate/interview-questions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobTitle,
        company: document.getElementById('iq-company').value.trim(),
        level: iqLevel,
        jobDescription: document.getElementById('iq-jd').value.trim(),
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      if (res.status === 401) return empRedirectToAuth();
      if (res.status === 402) return empShowUpgrade();
      return empToast(d.error || 'Erreur', 'error');
    }
    document.getElementById('iq-placeholder').style.display = 'none';
    const out = document.getElementById('iq-output');
    out.style.display = 'block';

    const renderQ = (items, showTip) => items.map((item, i) => `
      <div class="tip-item" style="margin-bottom:10px">
        <div style="font-weight:600;color:var(--ink);margin-bottom:${showTip && item.tip ? '5px' : '0'}">${i+1}. ${esc(item.q || item)}</div>
        ${showTip && item.tip ? `<div style="font-size:11.5px;color:var(--slate);line-height:1.5;padding-left:14px;border-left:2px solid rgba(110,72,190,.25)">💡 ${esc(item.tip)}</div>` : ''}
      </div>`).join('');

    const allText = [
      '=== Questions comportementales (méthode STAR) ===',
      ...(d.behavioral||[]).map((q,i) => `${i+1}. ${q.q||q}\n   💡 ${q.tip||''}`),
      '\n=== Questions techniques ===',
      ...(d.technical||[]).map((q,i) => `${i+1}. ${q.q||q}\n   💡 ${q.tip||''}`),
      '\n=== Questions de motivation ===',
      ...(d.motivation||[]).map((q,i) => `${i+1}. ${q.q||q}`),
      '\n=== Questions à poser au recruteur ===',
      ...(d.toAsk||[]).map((q,i) => `${i+1}. ${q.q||q}`),
    ].join('\n');

    out.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button data-on-click="copyText_JSON_parse_this_getAt_3937" data-arg-8451-0="${esc(JSON.stringify(allText))}" class="emp-btn emp-btn-secondary emp-btn-sm">📋 Tout copier</button>
      </div>
      ${d.behavioral?.length ? `<div class="result-block"><div class="result-block-title">🧠 Questions comportementales</div>${renderQ(d.behavioral, true)}</div>` : ''}
      ${d.technical?.length ? `<div class="result-block"><div class="result-block-title">⚙️ Questions techniques</div>${renderQ(d.technical, true)}</div>` : ''}
      ${d.motivation?.length ? `<div class="result-block"><div class="result-block-title">💼 Questions de motivation &amp; fit</div>${renderQ(d.motivation, false)}</div>` : ''}
      ${d.toAsk?.length ? `<div class="result-block"><div class="result-block-title" style="color:var(--primary)">❓ Questions à poser au recruteur</div>${renderQ(d.toAsk, false)}</div>` : ''}
    `;
    empRevisionPanel(out);
  } catch { empToast('Erreur réseau', 'error'); }
  finally { setLoading('iq-btn', false, 'Générer les questions ✨'); }
}

function empRedirectToAuth() {
  empShowAuth('login');
}

// Check auth + show Pro gates
function applyProGates(user) {
  if (!user) return;
  if (user.plan === 'free' || !user.plan) {
    document.getElementById('neg-gate').style.display = 'block';
    document.getElementById('neg-form').style.display = 'none';
    document.getElementById('debrief-gate').style.display = 'block';
    document.getElementById('debrief-form').style.display = 'none';
  }
}
window.addEventListener('empUserLoaded', e => { applyProGates(e.detail); autoFillFromContext(e.detail); });
window.addEventListener('empAuthChange', e => { applyProGates(e.detail?.user); autoFillFromContext(e.detail?.user); });

// ── AUTO-FILL PROFILE & NAME ──────────────────
function autoFillFromContext(user) {
  // Auto-fill profile textarea from saved profile (set in /app)
  const savedProfile = localStorage.getItem('emploia_profile_text') || '';
  const liProfile = document.getElementById('li-profile');
  if (liProfile && !liProfile.value && savedProfile) {
    liProfile.value = savedProfile;
  }
  // Auto-fill user name into name fields
  const userName = user?.name || '';
  if (userName) {
    ['rel-name','out-name','neg-name'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.value) el.value = userName.split(' ')[0] || userName;
    });
  }
}

// ── SAVE LINKEDIN RESULT TO VAULT ────────────
async function saveLinkedinToVault() {
  if (!window.empUser) { empShowAuth('login'); return; }
  const out = document.getElementById('li-output');
  if (!out || out.style.display === 'none') return;
  const about = document.getElementById('li-profile')?.value.slice(0, 50) || '';
  const name = `LinkedIn "À propos" — ${new Date().toLocaleDateString('fr-FR')}`;
  const content = out.innerText || out.textContent || '';
  if (!content.trim()) return;
  const btn = document.getElementById('li-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sauvegarde…'; }
  try {
    const res = await fetch('/api/cv-versions', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content, type: 'other' }),
    });
    const d = await res.json();
    if (!res.ok) return empToast(d.error || 'Erreur', 'error');
    empToast('Sauvegardé dans vos documents !', 'success');
    if (btn) btn.textContent = '✅ Sauvegardé';
  } catch { empToast('Erreur réseau', 'error'); }
  finally { if (btn) btn.disabled = false; }
}

// ── SCORE ATS ────────────────────────────────
let lastAtsResult = null;

async function generateAts() {
  const cvText = document.getElementById('ats-cv').value.trim();
  const jobOffer = document.getElementById('ats-job').value.trim();
  if (!cvText) return empToast('Collez d\'abord votre CV', 'error');
  if (!jobOffer) return empToast('Collez l\'offre d\'emploi', 'error');
  if (!window.empUser) return empShowAuth('login');
  setLoading('ats-btn', true, 'Analyser mon CV ✨');
  try {
    const res = await fetch('/api/generate/ats-score', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cvText, jobOffer }),
    });
    const d = await res.json();
    if (!res.ok) {
      if (res.status === 401) return empRedirectToAuth();
      if (res.status === 402) return empShowUpgrade();
      return empToast(d.error || 'Erreur', 'error');
    }
    lastAtsResult = d;
    document.getElementById('ats-placeholder').style.display = 'none';
    document.getElementById('ats-actions').style.display = 'flex';
    const out = document.getElementById('ats-output');
    out.style.display = 'block';

    const score = Math.min(100, Math.max(0, Number(d.score) || 0));
    const color = score >= 70 ? '#16a34a' : score >= 55 ? '#d97706' : '#dc2626';
    const grade = score >= 85 ? 'Excellent' : score >= 70 ? 'Très bon' : score >= 55 ? 'Correct' : 'À améliorer';

    const barsHtml = Array.isArray(d.bars) && d.bars.length
      ? `<div class="ats-bars">${d.bars.map(b => {
          const v = Math.min(100, Math.max(0, Number(b.val) || 0));
          return `<div class="ats-bar">
            <div class="ats-bar-name">${esc(String(b.name||''))}</div>
            <div class="ats-bar-track"><div class="ats-bar-fill" style="width:${v}%;background:${color}"></div></div>
            <div class="ats-bar-val">${v}%</div>
          </div>`;
        }).join('')}</div>` : '';

    const missingKw = Array.isArray(d.keywords) && d.keywords.length
      ? `<div class="result-block"><div class="result-block-title">🔴 Mots-clés manquants</div><div class="ats-chips">${d.keywords.map(k => `<span class="ats-chip ats-chip-missing">${esc(k)}</span>`).join('')}</div></div>` : '';

    const presentKw = Array.isArray(d.keywordsPresent) && d.keywordsPresent.length
      ? `<div class="result-block"><div class="result-block-title">🟢 Mots-clés présents</div><div class="ats-chips">${d.keywordsPresent.map(k => `<span class="ats-chip ats-chip-present">${esc(k)}</span>`).join('')}</div></div>` : '';

    const recosHtml = Array.isArray(d.recommendations) && d.recommendations.length
      ? `<div class="result-block"><div class="result-block-title">✅ Recommandations</div>${d.recommendations.map(r => `<div class="tip-item">${esc(r)}</div>`).join('')}</div>` : '';

    const strengthsHtml = Array.isArray(d.strengths) && d.strengths.length
      ? `<div class="result-block"><div class="result-block-title">💪 Points forts</div>${d.strengths.map(s => `<div class="tip-item" style="background:rgba(22,163,74,.08);color:#166534">${esc(s)}</div>`).join('')}</div>` : '';

    const atsRiskHtml = Array.isArray(d.atsRisk) && d.atsRisk.length
      ? `<div class="result-block"><div class="result-block-title" style="color:#dc2626">⚠️ Risques ATS détectés</div>${d.atsRisk.map(r => `<div class="tip-item" style="background:rgba(239,68,68,.08);color:#dc2626">${esc(r)}</div>`).join('')}</div>` : '';

    const verdictHtml = d.verdict
      ? `<div class="result-block" style="background:linear-gradient(135deg,rgba(110,72,190,.06),rgba(59,130,246,.04));border:1px solid rgba(110,72,190,.15);border-radius:12px;padding:14px"><div class="result-block-title" style="color:var(--primary)">🏆 Verdict expert</div><div style="font-size:13px;color:var(--ink);line-height:1.65">${esc(d.verdict)}</div></div>` : '';

    out.innerHTML = `
      <div class="ats-ring-wrap">
        <div class="ats-ring" style="background:conic-gradient(${color} ${score*3.6}deg, var(--hairline) 0)">
          <span class="ats-ring-num" style="color:${color}">${score}<span class="ats-ring-pct">%</span></span>
        </div>
        <div class="ats-grade" style="color:${color}">${grade}</div>
      </div>
      ${barsHtml}
      ${missingKw}
      ${presentKw}
      ${recosHtml}
      ${strengthsHtml}
      ${atsRiskHtml}
      ${verdictHtml}
    `;
    empRevisionPanel(out);
  } catch { empToast('Erreur réseau', 'error'); }
  finally { setLoading('ats-btn', false, 'Analyser mon CV ✨'); }
}

function copyAts() {
  if (!lastAtsResult) return;
  const lines = [
    `Score ATS : ${lastAtsResult.score}%`,
    '',
    lastAtsResult.recommendations?.length ? '── Recommandations ──\n' + lastAtsResult.recommendations.map(r => `• ${r}`).join('\n') : '',
    lastAtsResult.keywords?.length ? '\n── Mots-clés manquants ──\n' + lastAtsResult.keywords.join(', ') : '',
    lastAtsResult.strengths?.length ? '\n── Points forts ──\n' + lastAtsResult.strengths.map(s => `• ${s}`).join('\n') : '',
    lastAtsResult.verdict ? '\n── Verdict ──\n' + lastAtsResult.verdict : '',
  ].filter(Boolean).join('\n');
  navigator.clipboard.writeText(lines).then(() => empToast('Analyse copiée !', 'success')).catch(() => empToast('Copie impossible', 'error'));
}

// Run auto-fill immediately with any already-loaded user
if (window.empUser) autoFillFromContext(window.empUser);

// ── KEYBOARD SHORTCUT: Ctrl/Cmd+Enter to generate ──
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    const btnMap = { linkedin:'li-btn', relance:'rel-btn', outreach:'out-btn', negociation:'neg-btn', debrief:'debrief-btn', entreprise:'ent-btn', questions:'iq-btn', ats:'ats-btn' };
    const tabs = ['linkedin','relance','outreach','negociation','debrief','entreprise','questions','ats'];
    const idx = [...document.querySelectorAll('.tool-tab')].findIndex(t => t.classList.contains('active'));
    if (idx >= 0) document.getElementById(btnMap[tabs[idx]])?.click();
  }
});

// ── URL PARAMS: auto-switch tab + pre-fill from offre/jobs ──
(function() {
  const p = new URLSearchParams(window.location.search);
  const tab = p.get('tab');
  const tabs = ['linkedin','relance','outreach','negociation','debrief','entreprise','questions','ats'];
  if (tab && tabs.includes(tab)) switchTool(tab);

  const job = (p.get('job') || p.get('role') || '').trim();
  const company = (p.get('company') || '').trim();

  // Also read from sessionStorage (set by /app redirect flow)
  let prefillJob = job, prefillCompany = company;
  if (!prefillJob || !prefillCompany) {
    try {
      const pf = JSON.parse(sessionStorage.getItem('emp_prefill') || '{}');
      if (!prefillJob && pf.title) prefillJob = pf.title;
      if (!prefillCompany && pf.company) prefillCompany = pf.company;
    } catch {}
  }

  if (prefillJob) {
    ['iq-job','rel-job','neg-job','out-job','ent-job'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.value) el.value = prefillJob;
    });
    const dbJob = document.getElementById('db-job');
    if (dbJob && !dbJob.value && prefillCompany) dbJob.value = `${prefillJob} chez ${prefillCompany}`;
  }
  if (prefillCompany) {
    ['iq-company','rel-company','neg-company','out-company','ent-company'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.value) el.value = prefillCompany;
    });
  }
})();

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["copyAts"] = function (event) {
  copyAts()
};
EMP_H["copyText_JSON_parse_this_getAt_06a3"] = function (event) {
  copyText(JSON.parse(this.getAttribute("data-arg-16cc-0")))
};
EMP_H["copyText_JSON_parse_this_getAt_0f2f"] = function (event) {
  copyText(JSON.parse(this.getAttribute("data-arg-7728-0")))
};
EMP_H["copyText_JSON_parse_this_getAt_302b"] = function (event) {
  copyText(JSON.parse(this.getAttribute("data-arg-7599-0")))
};
EMP_H["copyText_JSON_parse_this_getAt_3384"] = function (event) {
  copyText(JSON.parse(this.getAttribute("data-arg-0f53-0")))
};
EMP_H["copyText_JSON_parse_this_getAt_3937"] = function (event) {
  copyText(JSON.parse(this.getAttribute("data-arg-8451-0")))
};
EMP_H["copyText_JSON_parse_this_getAt_78f1"] = function (event) {
  copyText(JSON.parse(this.getAttribute("data-arg-b6a7-0")))
};
EMP_H["copyText_JSON_parse_this_getAt_8cf9"] = function (event) {
  copyText(JSON.parse(this.getAttribute("data-arg-38e8-0")))
};
EMP_H["copyText_JSON_parse_this_getAt_8d7d"] = function (event) {
  copyText(JSON.parse(this.getAttribute("data-arg-6b7b-0")))
};
EMP_H["copyText_JSON_parse_this_getAt_a04a"] = function (event) {
  copyText(JSON.parse(this.getAttribute("data-arg-6c7e-0")))
};
EMP_H["copyText_JSON_parse_this_getAt_bc69"] = function (event) {
  copyText(JSON.parse(this.getAttribute("data-arg-7c0f-0")))
};
EMP_H["copyText_JSON_parse_this_getAt_e441"] = function (event) {
  copyText(JSON.parse(this.getAttribute("data-arg-fabb-0")))
};
EMP_H["copyText_JSON_parse_this_getAt_ff15"] = function (event) {
  copyText(JSON.parse(this.getAttribute("data-arg-ccba-0")))
};
EMP_H["generateAts"] = function (event) {
  generateAts()
};
EMP_H["generateDebrief"] = function (event) {
  generateDebrief()
};
EMP_H["generateEntreprise"] = function (event) {
  generateEntreprise()
};
EMP_H["generateLinkedin"] = function (event) {
  generateLinkedin()
};
EMP_H["generateNegociation"] = function (event) {
  generateNegociation()
};
EMP_H["generateOutreach"] = function (event) {
  generateOutreach()
};
EMP_H["generateQuestions"] = function (event) {
  generateQuestions()
};
EMP_H["generateRelance"] = function (event) {
  generateRelance()
};
EMP_H["saveLinkedinToVault"] = function (event) {
  saveLinkedinToVault()
};
EMP_H["setIQLevel_junior_f881"] = function (event) {
  setIQLevel('junior')
};
EMP_H["setIQLevel_manager_1572"] = function (event) {
  setIQLevel('manager')
};
EMP_H["setIQLevel_mid_cfbd"] = function (event) {
  setIQLevel('mid')
};
EMP_H["setIQLevel_senior_362e"] = function (event) {
  setIQLevel('senior')
};
EMP_H["switchTool_ats_61f8"] = function (event) {
  switchTool('ats')
};
EMP_H["switchTool_debrief_ae80"] = function (event) {
  switchTool('debrief')
};
EMP_H["switchTool_entreprise_c625"] = function (event) {
  switchTool('entreprise')
};
EMP_H["switchTool_linkedin_2942"] = function (event) {
  switchTool('linkedin')
};
EMP_H["switchTool_negociation_48bf"] = function (event) {
  switchTool('negociation')
};
EMP_H["switchTool_outreach_0a2d"] = function (event) {
  switchTool('outreach')
};
EMP_H["switchTool_questions_edcf"] = function (event) {
  switchTool('questions')
};
EMP_H["switchTool_relance_23aa"] = function (event) {
  switchTool('relance')
};
