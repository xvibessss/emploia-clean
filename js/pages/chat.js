  /* ── CONSTANTS ─────────────────────────────────── */
  const STORAGE_KEY = 'emploia_chat_history';
  const MAX_CONVOS = 20;
  const MAX_MESSAGES = 16;
  const WELCOME_MSG = 'Salut ! Je suis **Orion**, ton copilote IA pour décrocher ton prochain emploi. Je connais le marché français sur le bout des doigts. Que puis-je faire pour toi ?';

  /* ── STATE ─────────────────────────────────────── */
  let conversations = [];
  let activeId = null;
  let isStreaming = false;

  /* ── INIT ──────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    loadConversations();
    if (conversations.length === 0) {
      newConversation();
    } else {
      loadConversation(conversations[0].id);
    }
    setupTextarea();
    setupMobileMenu();

    // Handle ?q= URL parameter (from dashboard quick links)
    const urlQ = new URLSearchParams(window.location.search).get('q');
    if (urlQ) {
      history.replaceState(null, '', '/chat');
      setTimeout(() => {
        const inp = document.getElementById('chatInput');
        if (inp) { inp.value = urlQ; inp.focus(); } // pré-rempli, pas envoyé : un lien tiers ne doit pas parler à la place de l'utilisateur
      }, 400);
    }
  });

  /* ── MOBILE SETUP ──────────────────────────────── */
  function setupMobileMenu() {
    const btn = document.getElementById('chatMenuBtn');
    if (window.innerWidth <= 767) {
      btn.style.display = 'flex';
    }
    window.addEventListener('resize', () => {
      btn.style.display = window.innerWidth <= 767 ? 'flex' : 'none';
      if (window.innerWidth > 767) {
        document.getElementById('chatSidebar').classList.remove('open');
        document.getElementById('chatSidebarOverlay').classList.remove('open');
      }
    });
  }

  function toggleMobileSidebar() {
    document.getElementById('chatSidebar').classList.toggle('open');
    document.getElementById('chatSidebarOverlay').classList.toggle('open');
  }

  function closeMobileSidebar() {
    document.getElementById('chatSidebar').classList.remove('open');
    document.getElementById('chatSidebarOverlay').classList.remove('open');
  }

  /* ── STORAGE ───────────────────────────────────── */
  function saveConversations() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch (e) {
      console.warn('Chat: localStorage write failed', e);
    }
  }

  /* ── LOAD CONVERSATIONS ────────────────────────── */
  function loadConversations() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      conversations = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(conversations)) conversations = [];
    } catch (e) {
      conversations = [];
    }
    renderSidebar();
  }

  /* ── RENDER SIDEBAR ────────────────────────────── */
  function renderSidebar(filter) {
    const list = document.getElementById('chatSidebarList');
    const query = (filter || document.getElementById('chatSearch')?.value || '').toLowerCase().trim();
    const filtered = query
      ? conversations.filter(c => c.title.toLowerCase().includes(query))
      : conversations;

    if (conversations.length === 0) {
      list.innerHTML = '<div class="chat-sidebar-empty">Aucune conversation.<br>Commencez une nouvelle session.</div>';
      return;
    }
    if (filtered.length === 0) {
      list.innerHTML = '<div class="chat-sidebar-empty">Aucune conversation ne correspond.</div>';
      return;
    }

    let html = '<div class="chat-sidebar-section-label">Conversations</div>';
    filtered.forEach(convo => {
      const isActive = convo.id === activeId;
      html += `
        <div
          class="chat-convo-item${isActive ? ' active' : ''}"
          data-on-click="loadConversation_this_getAttri_d0d5" data-arg-63d3-0="${esc(convo.id)}"
          title="${escapeHtml(convo.title)}"
        >
          <div class="chat-convo-icon">💬</div>
          <div class="chat-convo-title">${escapeHtml(convo.title)}</div>
          <button
            class="chat-convo-delete"
            data-on-click="deleteConversation_event_this_42ad" data-arg-c780-0="${esc(convo.id)}"
            title="Supprimer"
            aria-label="Supprimer cette conversation"
          >×</button>
        </div>
      `;
    });
    list.innerHTML = html;
  }

  function filterConversations(q) {
    renderSidebar(q);
  }

  /* ── NEW CONVERSATION ──────────────────────────── */
  function newConversation() {
    if (isStreaming) return;

    const id = Date.now().toString();
    const convo = {
      id,
      title: 'Nouvelle conversation',
      messages: [],
      createdAt: new Date().toISOString()
    };

    conversations.unshift(convo);
    if (conversations.length > MAX_CONVOS) {
      conversations = conversations.slice(0, MAX_CONVOS);
    }

    activeId = id;
    saveConversations();
    renderSidebar();
    renderMessages();
    closeMobileSidebar();

    // Show welcome message from Orion
    appendAssistantMessage(WELCOME_MSG);
    // Don't save the welcome message to history — it's cosmetic
    showQuickActions();
  }

  /* ── LOAD CONVERSATION ─────────────────────────── */
  function loadConversation(id) {
    if (isStreaming) return;
    const convo = conversations.find(c => c.id === id);
    if (!convo) return;

    activeId = id;
    renderSidebar();
    renderMessages();
    closeMobileSidebar();

    const messagesInner = document.getElementById('chatMessagesInner');
    messagesInner.innerHTML = '';

    const emptyState = document.getElementById('chatEmptyState');

    if (convo.messages.length === 0) {
      emptyState.style.display = 'flex';
      appendAssistantMessage(WELCOME_MSG);
      showQuickActions();
    } else {
      emptyState.style.display = 'none';
      hideQuickActions();
      convo.messages.forEach(msg => {
        appendMessageToDOM(msg.role, msg.content);
      });
      scrollToBottom();
    }
  }

  /* ── RENDER MESSAGES (clear + re-render) ────────── */
  function renderMessages() {
    document.getElementById('chatMessagesInner').innerHTML = '';
    document.getElementById('chatEmptyState').style.display = 'flex';
    hideQuickActions();
  }

  /* ── DELETE CONVERSATION ───────────────────────── */
  function deleteConversation(e, id) {
    e.stopPropagation();
    conversations = conversations.filter(c => c.id !== id);
    saveConversations();

    if (activeId === id) {
      activeId = null;
      document.getElementById('chatMessagesInner').innerHTML = '';
      document.getElementById('chatEmptyState').style.display = 'flex';
      hideQuickActions();

      if (conversations.length > 0) {
        loadConversation(conversations[0].id);
      } else {
        newConversation();
      }
    } else {
      renderSidebar();
    }
  }

  /* ── QUICK ACTIONS ─────────────────────────────── */
  function showQuickActions() {
    document.getElementById('chatQuickActions').style.display = 'block';
  }

  function hideQuickActions() {
    document.getElementById('chatQuickActions').style.display = 'none';
  }

  function quickAction(text) {
    const ta = document.getElementById('chatTextarea');
    ta.value = text;
    autoResizeTextarea(ta);
    updateSendBtn();
    ta.focus();
    sendMessage();
  }

  /* ── TEXTAREA SETUP ────────────────────────────── */
  function setupTextarea() {
    const ta = document.getElementById('chatTextarea');
    ta.addEventListener('input', () => updateSendBtn());
  }

  function autoResizeTextarea(ta) {
    ta.style.height = 'auto';
    const maxH = Math.round(3 * 1.55 * 14.5 + 24);
    ta.style.height = Math.min(ta.scrollHeight, maxH) + 'px';
  }

  function handleTextareaKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && document.getElementById('chatTextarea').value.trim()) {
        sendMessage();
      }
    }
  }

  function updateSendBtn() {
    const ta = document.getElementById('chatTextarea');
    const btn = document.getElementById('chatSendBtn');
    btn.disabled = isStreaming || !ta.value.trim();
  }

  /* ── SEND MESSAGE ──────────────────────────────── */
  async function sendMessage() {
    if (isStreaming) return;
    const ta = document.getElementById('chatTextarea');
    const text = ta.value.trim();
    if (!text) return;

    const convo = conversations.find(c => c.id === activeId);
    if (!convo) return;

    // Clear input
    ta.value = '';
    ta.style.height = 'auto';
    isStreaming = true;
    updateSendBtn();
    hideQuickActions();

    // Hide empty state
    document.getElementById('chatEmptyState').style.display = 'none';

    // Add user message to DOM and state
    convo.messages.push({ role: 'user', content: text });

    // Update title if first real message
    if (convo.title === 'Nouvelle conversation') {
      convo.title = text.length > 40 ? text.slice(0, 40) + '…' : text;
    }

    appendMessageToDOM('user', text);
    scrollToBottom();

    // Build messages payload (last MAX_MESSAGES)
    const payload = convo.messages.slice(-MAX_MESSAGES).map(m => ({
      role: m.role,
      content: m.content
    }));

    // Show typing indicator
    const typingEl = showTypingIndicator();

    // Stream from API
    let fullResponse = '';
    let assistantBubble = null;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      typingEl.remove();

      assistantBubble = createStreamingBubble();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.done) {
              break;
            }
            if (parsed.chunk) {
              fullResponse += parsed.chunk;
              assistantBubble.innerHTML = renderMarkdown(fullResponse);
              scrollToBottom();
            }
            if (parsed.error) {
              throw new Error(parsed.error);
            }
          } catch (parseErr) {
            // skip malformed lines
          }
        }
      }

    } catch (err) {
      if (typingEl.parentNode) typingEl.remove();

      const errMsg = err.message.includes('429')
        ? 'Vous avez atteint la limite de 30 messages par heure. Revenez dans un moment !'
        : err.message.includes('401')
        ? 'Connectez-vous pour utiliser Orion.'
        : 'Désolé, une erreur est survenue. Veuillez réessayer dans quelques instants.';

      if (assistantBubble) {
        fullResponse = errMsg;
        assistantBubble.innerHTML = renderMarkdown(fullResponse);
      } else {
        appendMessageToDOM('assistant', errMsg);
        fullResponse = errMsg;
      }
    }

    // Save assistant response
    if (fullResponse) {
      convo.messages.push({ role: 'assistant', content: fullResponse });
    }

    saveConversations();
    renderSidebar();

    isStreaming = false;
    updateSendBtn();
    ta.focus();
    scrollToBottom();
  }

  /* ── DOM HELPERS ───────────────────────────────── */
  function appendMessageToDOM(role, content) {
    const inner = document.getElementById('chatMessagesInner');
    const el = createMessageEl(role, content);
    inner.appendChild(el);
    return el;
  }

  function appendAssistantMessage(content) {
    appendMessageToDOM('assistant', content);
    scrollToBottom();
  }

  function createMessageEl(role, content) {
    const wrap = document.createElement('div');
    wrap.className = `chat-msg ${role}`;

    if (role === 'assistant') {
      const avatar = document.createElement('div');
      avatar.className = 'chat-msg-avatar';
      avatar.textContent = 'O';
      wrap.appendChild(avatar);
    }

    const bubble = document.createElement('div');
    bubble.className = 'chat-msg-bubble';
    bubble.innerHTML = renderMarkdown(content);
    wrap.appendChild(bubble);

    return wrap;
  }

  function createStreamingBubble() {
    const inner = document.getElementById('chatMessagesInner');
    const wrap = document.createElement('div');
    wrap.className = 'chat-msg assistant';

    const avatar = document.createElement('div');
    avatar.className = 'chat-msg-avatar';
    avatar.textContent = 'O';
    wrap.appendChild(avatar);

    const bubble = document.createElement('div');
    bubble.className = 'chat-msg-bubble';
    wrap.appendChild(bubble);
    inner.appendChild(wrap);

    return bubble;
  }

  function showTypingIndicator() {
    const inner = document.getElementById('chatMessagesInner');
    const el = document.createElement('div');
    el.className = 'chat-typing';
    el.innerHTML = `
      <div class="chat-typing-avatar">O</div>
      <div class="chat-typing-bubble">
        <div class="chat-typing-dot"></div>
        <div class="chat-typing-dot"></div>
        <div class="chat-typing-dot"></div>
      </div>
    `;
    inner.appendChild(el);
    scrollToBottom();
    return el;
  }

  function scrollToBottom() {
    const msgs = document.getElementById('chatMessages');
    msgs.scrollTop = msgs.scrollHeight;
  }

  /* ── MARKDOWN RENDERER ─────────────────────────── */
  function renderMarkdown(text) {
    if (!text) return '';

    // Escape HTML first
    let html = escapeHtml(text);

    // **bold**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Process line by line for bullets and paragraphs
    const lines = html.split('\n');
    const result = [];
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isBullet = /^- (.+)/.test(line);

      if (isBullet) {
        if (!inList) {
          result.push('<ul>');
          inList = true;
        }
        result.push('<li>' + line.replace(/^- /, '') + '</li>');
      } else {
        if (inList) {
          result.push('</ul>');
          inList = false;
        }
        if (line.trim() === '') {
          result.push('<br>');
        } else {
          result.push('<p>' + line + '</p>');
        }
      }
    }

    if (inList) result.push('</ul>');

    // Clean up adjacent <br><p> patterns
    let out = result.join('');
    out = out.replace(/<br><p>/g, '<p>');
    out = out.replace(/<p><\/p>/g, '');
    out = out.replace(/<br><br>/g, '<br>');

    return out;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["autoResizeTextarea_this_9927"] = function (event) {
  autoResizeTextarea(this)
};
EMP_H["closeMobileSidebar"] = function (event) {
  closeMobileSidebar()
};
EMP_H["deleteConversation_event_this_42ad"] = function (event) {
  deleteConversation(event, this.getAttribute("data-arg-c780-0"))
};
EMP_H["filterConversations_this_value_25b4"] = function (event) {
  filterConversations(this.value)
};
EMP_H["handleTextareaKey_event_d931"] = function (event) {
  handleTextareaKey(event)
};
EMP_H["loadConversation_this_getAttri_d0d5"] = function (event) {
  loadConversation(this.getAttribute("data-arg-63d3-0"))
};
EMP_H["newConversation"] = function (event) {
  newConversation()
};
EMP_H["quickAction_Analyse_mon_CV_2f3f"] = function (event) {
  quickAction('Analyse mon CV')
};
EMP_H["quickAction_N_gocie_mon_salair_7aef"] = function (event) {
  quickAction('Négocie mon salaire')
};
EMP_H["quickAction_Optimise_mon_Linke_ca96"] = function (event) {
  quickAction('Optimise mon LinkedIn')
};
EMP_H["quickAction_Pr_pare_moi_un_ent_0fd2"] = function (event) {
  quickAction('Prépare-moi à un entretien')
};
EMP_H["quickAction_R_dige_ma_lettre_d_8d8b"] = function (event) {
  quickAction('Rédige ma lettre de motivation')
};
EMP_H["quickAction_Reconversion_profe_05cd"] = function (event) {
  quickAction('Reconversion professionnelle')
};
EMP_H["sendMessage"] = function (event) {
  sendMessage()
};
EMP_H["toggleMobileSidebar"] = function (event) {
  toggleMobileSidebar()
};
