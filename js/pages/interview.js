  let level = 'junior';
  let messages = [];
  let questionCount = 0;
  let totalWords = 0;
  let startTime = null;
  let timerInterval = null;
  let isRecording = false;
  let isStreaming = false;
  let currentRole = '';
  let currentCompany = '';

  function setLevel(btn) {
    document.querySelectorAll('.lvl-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    level = btn.dataset.lvl;
  }

  function showMobile(btn, tab) {
    document.querySelectorAll('.iv-mt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const page = document.getElementById('ivPage');
    page.classList.remove('show-sidebar', 'show-coach');
    if (tab === 'sidebar') page.classList.add('show-sidebar');
    else if (tab === 'coach') page.classList.add('show-coach');
  }

  function autoResize(t) {
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 120) + 'px';
    document.getElementById('ivSendBtn').disabled = !t.value.trim() || isStreaming;
  }


  function pushMsg(role, text) {
    const ts = Date.now();
    messages.push({ role, content: text, ts });
    if (messages.length === 1) {
      document.getElementById('ivMessages').innerHTML = '';
    }
    const time = new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = 'iv-msg ' + (role === 'assistant' ? 'bot' : 'user');
    const avatarEl = document.createElement('div');
    avatarEl.className = 'iv-msg-avatar';
    avatarEl.textContent = role === 'assistant' ? '🤖' : '🧑';
    const bubble = document.createElement('div');
    bubble.className = 'iv-msg-bubble';
    bubble.innerHTML = esc(text).replace(/\n/g, '<br>');
    const timeEl = document.createElement('div');
    timeEl.className = 'iv-msg-time';
    if (role === 'user') timeEl.style.textAlign = 'right';
    timeEl.textContent = time;
    const wrapper = document.createElement('div');
    wrapper.append(bubble, timeEl);
    div.append(avatarEl, wrapper);
    document.getElementById('ivMessages').appendChild(div);
    document.getElementById('ivMessages').scrollTop = document.getElementById('ivMessages').scrollHeight;
  }

  function showTyping() {
    const div = document.createElement('div');
    div.id = 'typingIndicator';
    div.className = 'iv-typing iv-msg bot';
    div.innerHTML = `
      <div class="iv-msg-avatar">🤖</div>
      <div class="iv-msg-bubble">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>`;
    document.getElementById('ivMessages').appendChild(div);
    document.getElementById('ivMessages').scrollTop = document.getElementById('ivMessages').scrollHeight;
  }

  function hideTyping() {
    document.getElementById('typingIndicator')?.remove();
  }

  async function streamBotResponse() {
    isStreaming = true;
    document.getElementById('ivSendBtn').disabled = true;
    showTyping();

    const apiMessages = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch('/api/interview', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          role: currentRole || 'un poste',
          company: currentCompany,
          level,
        }),
      });

      if (!res.ok) {
        hideTyping();
        const err = await res.json().catch(() => ({}));
        empToast(err.error || 'Erreur de connexion', 'error');
        isStreaming = false;
        document.getElementById('ivSendBtn').disabled = !document.getElementById('ivInput').value.trim();
        return;
      }

      hideTyping();

      // Create streaming bubble
      const msgDiv = document.createElement('div');
      msgDiv.className = 'iv-msg bot';
      const avatarEl = document.createElement('div');
      avatarEl.className = 'iv-msg-avatar';
      avatarEl.textContent = '🤖';
      const bubble = document.createElement('div');
      bubble.className = 'iv-msg-bubble';
      const timeEl = document.createElement('div');
      timeEl.className = 'iv-msg-time';
      const wrapper = document.createElement('div');
      wrapper.append(bubble, timeEl);
      msgDiv.append(avatarEl, wrapper);
      document.getElementById('ivMessages').appendChild(msgDiv);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.chunk) {
              fullText += parsed.chunk;
              bubble.innerHTML = esc(fullText).replace(/\n/g, '<br>');
              document.getElementById('ivMessages').scrollTop = document.getElementById('ivMessages').scrollHeight;
            }
          } catch {}
        }
      }

      const ts = Date.now();
      timeEl.textContent = new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      messages.push({ role: 'assistant', content: fullText, ts });
      questionCount++;
      updateStats();

      // Extract italic feedback from response (_text_)
      const feedbackMatch = fullText.match(/_([^_\n]+)_/);
      if (feedbackMatch) addFeedback('💬', feedbackMatch[1].trim());

    } catch (err) {
      hideTyping();
      console.error(err);
      empToast('Erreur de connexion', 'error');
    }

    isStreaming = false;
    document.getElementById('ivSendBtn').disabled = !document.getElementById('ivInput').value.trim();
  }

  function startInterview() {
    currentRole = document.getElementById('cfgRole').value.trim() || 'un poste';
    currentCompany = document.getElementById('cfgCompany').value.trim();

    messages = [];
    questionCount = 0;
    totalWords = 0;
    document.getElementById('ivMessages').innerHTML = '';
    document.getElementById('feedbackList').innerHTML = '<div class="feedback-item"><span class="feedback-emoji">💡</span><div>Démarrez une session pour recevoir un feedback en temps réel.</div></div>';

    if (!startTime) {
      startTime = Date.now();
      timerInterval = setInterval(updateTimer, 1000);
      if (window.trackEvent) trackEvent('interview_started', { role: currentRole });
    }

    updateStats();
    // Hidden trigger message — not shown in UI, starts the conversation
    messages.push({ role: 'user', content: 'Je suis prêt pour commencer l\'entretien.', ts: Date.now() });
    streamBotResponse();
  }

  function quickStart(prompt) {
    document.getElementById('cfgRole').value = prompt;
    startInterview();
  }

  function loadTpl(btn, tpl) {
    document.querySelectorAll('.tpl-card').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const prompts = {
      rh: 'Entretien RH classique',
      tech: 'Entretien technique avec questions de code',
      compo: 'Entretien comportemental (méthode STAR)',
      manager: 'Entretien avec le manager hiérarchique',
      case: 'Étude de cas concret',
      salary: 'Négociation salariale et package'
    };
    document.getElementById('cfgRole').value = prompts[tpl] || '';
    empToast(`Template "${prompts[tpl]}" chargé`, 'info');
  }

  async function sendMsg() {
    if (isStreaming) return;
    const inp = document.getElementById('ivInput');
    const text = inp.value.trim();
    if (!text) return;

    if (!startTime) {
      startTime = Date.now();
      timerInterval = setInterval(updateTimer, 1000);
      currentRole = document.getElementById('cfgRole').value.trim() || 'un poste';
      currentCompany = document.getElementById('cfgCompany').value.trim();
    }

    pushMsg('user', text);
    totalWords += text.split(/\s+/).length;
    inp.value = '';
    autoResize(inp);
    updateStats();
    analyzeUserAnswer(text);

    await streamBotResponse();
  }

  function askQ(q) {
    if (!startTime) {
      startTime = Date.now();
      timerInterval = setInterval(updateTimer, 1000);
      currentRole = document.getElementById('cfgRole').value.trim() || 'un poste';
      currentCompany = document.getElementById('cfgCompany').value.trim();
    }
    pushMsg('assistant', `**${q}**\n\nPrenez votre temps pour répondre.`);
    questionCount++;
    updateStats();
  }

  function addFeedback(emoji, text, badges = []) {
    const list = document.getElementById('feedbackList');
    if (list.querySelector('.feedback-item')?.textContent.includes('Démarrez une session')) {
      list.innerHTML = '';
    }
    const item = document.createElement('div');
    item.className = 'feedback-item';
    const emojiEl = document.createElement('span');
    emojiEl.className = 'feedback-emoji';
    emojiEl.textContent = emoji;
    const textEl = document.createElement('div');
    textEl.innerHTML = badges.map(b => `<span class="fb-badge ${b.type}">${b.label}</span>`).join('') + esc(text);
    item.append(emojiEl, textEl);
    list.insertBefore(item, list.firstChild);
    if (list.children.length > 8) list.lastChild.remove();
  }

  function analyzeUserAnswer(text) {
    const words = text.split(/\s+/).length;
    const hasSTAR = /situation|tâche|action|résultat|j'ai|nous avons|j'étais|objectif/i.test(text);
    const hasNumbers = /\d+\s*%|\d+\s*k€|\d+\s*(ans|mois|jours|utilisateurs|projets|clients)/i.test(text);
    const hasFillers = /(euh|bon ben|en fait|voilà|donc euh)/i.test(text);
    const badges = [];
    if (hasSTAR) badges.push({ type: 'star', label: '✓ STAR' });
    if (hasNumbers) badges.push({ type: 'star', label: '📊 Chiffres' });
    if (words < 30) badges.push({ type: 'warn', label: '⚠ Court' });
    if (words > 200) badges.push({ type: 'warn', label: '⚠ Long' });
    if (hasFillers) badges.push({ type: 'warn', label: '⚠ Hésitations' });
    const feedback = words < 30 ? 'Réponse courte — développez avec un exemple concret'
      : words > 200 ? 'Trop long — résumez en 90-120 mots max'
      : hasSTAR ? 'Bonne structure STAR !'
      : 'Pensez à structurer : Situation → Action → Résultat';
    addFeedback('💬', `${words} mots — ${feedback}`, badges);
  }

  function updateStats() {
    document.getElementById('statQ').textContent = questionCount;
    document.getElementById('statW').textContent = totalWords;
    if (questionCount > 0) {
      const score = Math.min(60 + questionCount * 4 + Math.min(totalWords / 10, 20), 95);
      document.getElementById('statS').textContent = Math.round(score) + '%';
    }
  }

  function updateTimer() {
    if (!startTime) return;
    const sec = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    document.getElementById('statT').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function toggleMic() {
    const btn = document.getElementById('micBtn');
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      empToast('Reconnaissance vocale non supportée par votre navigateur', 'error');
      return;
    }
    isRecording = !isRecording;
    btn.classList.toggle('recording', isRecording);
    btn.textContent = isRecording ? '⏹' : '🎤';
    if (isRecording) {
      empToast('🎤 Enregistrement... cliquez pour arrêter', 'info');
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SR();
      rec.lang = 'fr-FR';
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = e => {
        const txt = [...e.results].map(r => r[0].transcript).join('');
        document.getElementById('ivInput').value = txt;
        autoResize(document.getElementById('ivInput'));
      };
      rec.onerror = () => { isRecording = false; btn.classList.remove('recording'); btn.textContent = '🎤'; };
      window._rec = rec;
      rec.start();
    } else {
      window._rec?.stop();
    }
  }

  async function exportChat() {
    const visible = messages.filter(m => m.role !== 'user' || messages.indexOf(m) > 0);
    if (!visible.length) return empToast('Aucun message à exporter', 'info');
    const txt = visible.map(m => `[${new Date(m.ts).toLocaleString('fr-FR')}] ${m.role === 'assistant' ? 'Coach IA' : 'Vous'}\n${m.content}\n`).join('\n---\n\n');
    empToast('📄 Génération du PDF…', 'info');
    try {
      if (!window.jspdf) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const role = currentRole || document.getElementById('cfgRole').value.trim() || 'Poste';
      const company = currentCompany || document.getElementById('cfgCompany').value.trim();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      doc.text(`Simulation d'entretien — ${role}${company ? ' @ ' + company : ''}`, 15, 20);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.setTextColor(120); doc.text(`Emploia · ${new Date().toLocaleDateString('fr-FR')} · ${questionCount} questions · Score ${document.getElementById('statS').textContent}`, 15, 28);
      doc.setTextColor(30); doc.setFontSize(10.5);
      let y = 38;
      for (const line of txt.split('\n')) {
        const wrapped = doc.splitTextToSize(line || ' ', 180);
        for (const wl of wrapped) {
          if (y > 282) { doc.addPage(); y = 15; }
          const isSpeaker = wl.startsWith('[') || wl === '---';
          doc.setFont('helvetica', isSpeaker ? 'bold' : 'normal');
          doc.setTextColor(isSpeaker ? 80 : 30);
          doc.text(wl, 15, y);
          y += 5.2;
        }
      }
      doc.save(`entretien-emploia-${new Date().toISOString().slice(0,10)}.pdf`);
      empToast('PDF exporté !', 'success');
    } catch {
      const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `entretien-emploia.txt`; a.click();
      empToast('Exporté (format texte)', 'info');
    }
  }

  // ── Session persistence ───────────────────────────────────────────────────
  const SESSION_KEY = 'emploia_interview_sessions';

  function saveSession() {
    if (!messages.length || !startTime) return;
    const scoreEl = document.getElementById('statS');
    const session = {
      id: Date.now(),
      role: currentRole || document.getElementById('cfgRole').value.trim() || 'Poste',
      company: currentCompany || document.getElementById('cfgCompany').value.trim() || '',
      date: new Date().toISOString(),
      duration: document.getElementById('statT').textContent,
      questions: questionCount,
      words: totalWords,
      score: scoreEl.textContent !== '—' ? parseInt(scoreEl.textContent) : null,
      messages: messages.slice(0, 40),
    };
    const sessions = JSON.parse(localStorage.getItem(SESSION_KEY) || '[]');
    sessions.unshift(session);
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessions.slice(0, 10)));
    if (session.score != null) {
      try {
        const KEY = 'emploia_scores_history';
        const hist = JSON.parse(localStorage.getItem(KEY) || '[]');
        hist.push({ type: 'interview', ts: session.id, score: session.score });
        localStorage.setItem(KEY, JSON.stringify(hist.slice(-50)));
      } catch {}
    }
    renderSessionHistory();
    empToast('Session sauvegardée !', 'success');
    // Show a post-session debrief CTA after saving
    const ctaId = 'debriefCta';
    if (!document.getElementById(ctaId)) {
      const cta = document.createElement('div');
      cta.id = ctaId;
      cta.style.cssText = 'background:linear-gradient(135deg,rgba(99,102,241,.08),rgba(59,130,246,.05));border:1px solid rgba(99,102,241,.2);border-radius:12px;padding:14px 18px;margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:12px';
      cta.innerHTML = `<div><div style="font-size:13px;font-weight:800;color:var(--t1)">🎤 Faites un bilan post-entretien</div><div style="font-size:11px;color:var(--t2);margin-top:2px">Analysez vos points forts, axes d'amélioration et obtenez un email de remerciement</div></div><a href="/tools" style="padding:8px 14px;border-radius:8px;font-size:11px;font-weight:700;color:#fff;background:linear-gradient(135deg,#6366f1,#3b82f6);text-decoration:none;flex-shrink:0">Bilan IA →</a>`;
      const histContainer = document.getElementById('sessionHistory')?.parentElement;
      if (histContainer) histContainer.insertBefore(cta, histContainer.firstChild);
    }
  }

  function renderSessionHistory() {
    const sessions = JSON.parse(localStorage.getItem(SESSION_KEY) || '[]');
    const container = document.getElementById('sessionHistory');
    const empty = document.getElementById('sessionHistoryEmpty');
    if (!sessions.length) { container.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    container.innerHTML = sessions.map(s => {
      const date = new Date(s.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      const scoreClass = s.score >= 75 ? 'good' : s.score >= 50 ? 'ok' : 'low';
      return `<div class="session-hist-item" data-on-click="loadSession_JSON_parse_this_ge_b66c" data-arg-0701-0="${esc(JSON.stringify(s.id))}">
        <div class="session-hist-role">${esc(s.role)}${s.company ? ' @ ' + esc(s.company) : ''}</div>
        <div class="session-hist-meta">
          <span>${date}</span>
          <span>${s.questions}Q</span>
          <span class="session-hist-score ${scoreClass}">${s.score ? s.score + '%' : '—'}</span>
        </div>
      </div>`;
    }).join('');
  }

  function loadSession(id) {
    const sessions = JSON.parse(localStorage.getItem(SESSION_KEY) || '[]');
    const s = sessions.find(s => s.id === id);
    if (!s) return;
    if (!confirm(`Charger la session "${s.role}" du ${new Date(s.date).toLocaleDateString('fr-FR')} ? La session actuelle sera perdue.`)) return;
    messages = s.messages || [];
    questionCount = s.questions || 0;
    totalWords = s.words || 0;
    currentRole = s.role; currentCompany = s.company;
    document.getElementById('cfgRole').value = s.role;
    document.getElementById('cfgCompany').value = s.company || '';
    const box = document.getElementById('ivMessages');
    box.innerHTML = '';
    messages.forEach(m => {
      const time = new Date(m.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const div = document.createElement('div');
      div.className = 'iv-msg ' + (m.role === 'assistant' ? 'bot' : 'user');
      div.innerHTML = `<div class="iv-msg-avatar">${m.role === 'assistant' ? '🤖' : '🧑'}</div><div class="iv-msg-bubble">${esc(m.content).replace(/\n/g,'<br>')}<div style="font-size:10px;color:var(--t3);margin-top:4px;text-align:right">${time}</div></div>`;
      box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight;
    updateStats();
    empToast('Session chargée', 'success');
  }

  function resetChat() {
    if (messages.length > 2) saveSession();
    if (!confirm('Réinitialiser cette session ?')) return;
    messages = [];
    questionCount = 0;
    totalWords = 0;
    startTime = null;
    isStreaming = false;
    currentRole = '';
    currentCompany = '';
    clearInterval(timerInterval);
    document.getElementById('statQ').textContent = '0';
    document.getElementById('statT').textContent = '00:00';
    document.getElementById('statW').textContent = '0';
    document.getElementById('statS').textContent = '—';
    document.getElementById('ivMessages').innerHTML = `
      <div class="iv-welcome">
        <div style="font-size:54px;margin-bottom:14px">🎤</div>
        <h2>Préparez-vous à briller</h2>
        <p>Configurez votre poste à gauche et démarrez votre simulation.</p>
      </div>`;
    document.getElementById('feedbackList').innerHTML = '<div class="feedback-item"><span class="feedback-emoji">💡</span><div>Démarrez une session pour recevoir un feedback en temps réel.</div></div>';
  }

  // Keyboard
  document.getElementById('ivInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMsg();
    }
  });

  // Pre-fill from URL params (from offre.html "Préparer l'entretien" link)
  (() => {
    const params = new URLSearchParams(location.search);
    if (params.get('role')) document.getElementById('cfgRole').value = params.get('role');
    if (params.get('company')) document.getElementById('cfgCompany').value = params.get('company');
  })();

  // Load session history
  renderSessionHistory();

  // Init — require auth
  document.getElementById('ivSendBtn').disabled = true;
  (async () => {
    try {
      const r = await fetch('/api/auth/me', { credentials: 'include' });
      if (!r.ok) {
        if (typeof empShowAuth === 'function') empShowAuth('login');
      }
    } catch {}
  })();

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["askQ_O_vous_voyez_vous_dans_5_ad22"] = function (event) {
  askQ('Où vous voyez-vous dans 5 ans ?')
};
EMP_H["askQ_Parlez_moi_de_vous_6027"] = function (event) {
  askQ('Parlez-moi de vous')
};
EMP_H["askQ_Pourquoi_cette_entreprise_b3e9"] = function (event) {
  askQ('Pourquoi cette entreprise ?')
};
EMP_H["askQ_Une_faiblesse_am_liorer_61d0"] = function (event) {
  askQ('Une faiblesse à améliorer ?')
};
EMP_H["askQ_Vos_plus_grandes_forces_3542"] = function (event) {
  askQ('Vos plus grandes forces ?')
};
EMP_H["autoResize_this_b319"] = function (event) {
  autoResize(this)
};
EMP_H["exportChat"] = function (event) {
  exportChat()
};
EMP_H["loadSession_JSON_parse_this_ge_b66c"] = function (event) {
  loadSession(JSON.parse(this.getAttribute("data-arg-0701-0")))
};
EMP_H["loadTpl_this_case_93a9"] = function (event) {
  loadTpl(this,'case')
};
EMP_H["loadTpl_this_compo_ea1b"] = function (event) {
  loadTpl(this,'compo')
};
EMP_H["loadTpl_this_manager_930d"] = function (event) {
  loadTpl(this,'manager')
};
EMP_H["loadTpl_this_rh_0874"] = function (event) {
  loadTpl(this,'rh')
};
EMP_H["loadTpl_this_salary_1595"] = function (event) {
  loadTpl(this,'salary')
};
EMP_H["loadTpl_this_tech_8d22"] = function (event) {
  loadTpl(this,'tech')
};
EMP_H["quickStart_Entretien_Product_M_d119"] = function (event) {
  quickStart('Entretien Product Manager')
};
EMP_H["quickStart_Entretien_pour_D_ve_d92d"] = function (event) {
  quickStart('Entretien pour Développeur Frontend Senior')
};
EMP_H["quickStart_Premier_emploi_sort_4671"] = function (event) {
  quickStart('Premier emploi sortie d\'études')
};
EMP_H["quickStart_Reconversion_vers_l_2d21"] = function (event) {
  quickStart('Reconversion vers la data')
};
EMP_H["resetChat"] = function (event) {
  resetChat()
};
EMP_H["saveSession"] = function (event) {
  saveSession()
};
EMP_H["sendMsg"] = function (event) {
  sendMsg()
};
EMP_H["setLevel_this_81e5"] = function (event) {
  setLevel(this)
};
EMP_H["showMobile_this_chat_d6bf"] = function (event) {
  showMobile(this,'chat')
};
EMP_H["showMobile_this_coach_e7cf"] = function (event) {
  showMobile(this,'coach')
};
EMP_H["showMobile_this_sidebar_5387"] = function (event) {
  showMobile(this,'sidebar')
};
EMP_H["startInterview"] = function (event) {
  startInterview()
};
EMP_H["toggleMic"] = function (event) {
  toggleMic()
};
