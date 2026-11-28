const AGENTS = [
  {
    id: 'legal', name: 'Maître Orion', icon: '⚖️', color: '#FEE2E2', iconColor: '#DC2626',
    tagline: 'Droit du travail français', category: 'juridique',
    topics: ['CDI / CDD / rupture', 'Conventions collectives', 'Prud\'hommes & indemnités'],
    params: [
      { key: 'contractType', placeholder: 'Type de contrat (ex: CDI)' },
      { key: 'sector', placeholder: 'Secteur (ex: Tech)' }
    ],
    tip: 'Ex : "Quelle est mon indemnité de rupture conventionnelle après 4 ans ?"'
  },
  {
    id: 'finance', name: 'Orion Finance', icon: '📊', color: '#DCFCE7', iconColor: '#16A34A',
    tagline: 'Finance, comptabilité & marchés', category: 'finance',
    topics: ['Analyse financière & ratios', 'M&A · DCF · LBO', 'Contrôle de gestion'],
    params: [
      { key: 'sector', placeholder: 'Secteur' },
      { key: 'role', placeholder: 'Poste visé' }
    ],
    tip: 'Ex : "Comment calculer l\'EV/EBITDA et l\'interpréter pour une biotech ?"'
  },
  {
    id: 'marketing', name: 'Orion Marketing', icon: '📣', color: '#FEF3C7', iconColor: '#D97706',
    tagline: 'Marketing, growth & acquisition', category: 'marketing',
    topics: ['SEO / SEA / Paid', 'Growth & AARRR', 'Analytics & CRO'],
    params: [
      { key: 'sector', placeholder: 'Secteur' },
      { key: 'channel', placeholder: 'Canal principal' }
    ],
    tip: 'Ex : "Comment réduire mon CAC Google Ads de 30% sans couper le budget ?"'
  },
  {
    id: 'operation', name: 'Orion Ops', icon: '⚙️', color: '#F3E8FF', iconColor: '#7C3AED',
    tagline: 'Opérations, Lean & excellence', category: 'operations',
    topics: ['Lean · Six Sigma · PDCA', 'KPIs opérationnels', 'Budget & make-or-buy'],
    params: [
      { key: 'sector', placeholder: 'Secteur (ex: Industrie)' },
      { key: 'role', placeholder: 'Poste visé' }
    ],
    tip: 'Ex : "Comment implémenter un système Kanban pour une équipe de 15 personnes ?"'
  },
  {
    id: 'supply-chain', name: 'Orion Supply', icon: '🚚', color: '#CFFAFE', iconColor: '#0891B2',
    tagline: 'Supply chain & logistique', category: 'operations',
    topics: ['MRP / DDMRP / stocks', 'Achats & incoterms', 'OTIF · fill rate · TCO'],
    params: [
      { key: 'sector', placeholder: 'Secteur' },
      { key: 'scope', placeholder: 'Périmètre (ex: Achats)' }
    ],
    tip: 'Ex : "Quelle méthode de gestion des stocks pour un produit saisonnier à forte variabilité ?"'
  },
  {
    id: 'compliance', name: 'Orion Comply', icon: '🛡️', color: '#F1F5F9', iconColor: '#334155',
    tagline: 'Conformité & réglementation', category: 'juridique',
    topics: ['RGPD · CNIL · DPO', 'Sapin II · ISO 27001', 'CSRD · NIS2 · DORA'],
    params: [
      { key: 'sector', placeholder: 'Secteur' },
      { key: 'regulation', placeholder: 'Réglementation (ex: RGPD)' }
    ],
    tip: 'Ex : "Quelles sont les obligations RGPD pour une startup SaaS B2B qui traite des données de ses clients ?"'
  },
  {
    id: 'customer-experience', name: 'Orion CX', icon: '⭐', color: '#FEF9C3', iconColor: '#CA8A04',
    tagline: 'Expérience client & satisfaction', category: 'people',
    topics: ['NPS · CSAT · CES', 'Customer journey', 'Churn & rétention'],
    params: [
      { key: 'sector', placeholder: 'Secteur' },
      { key: 'channel', placeholder: 'Canal CX principal' }
    ],
    tip: 'Ex : "Comment interpréter un NPS de 32 dans le SaaS B2C et quelles actions prioriser ?"'
  },
  {
    id: 'hr', name: 'Orion RH', icon: '👥', color: '#FCE7F3', iconColor: '#BE185D',
    tagline: 'Ressources humaines & talents', category: 'people',
    topics: ['Recrutement & sourcing', 'GEPP · formation · CPF', 'Droit social employeur'],
    params: [
      { key: 'sector', placeholder: 'Secteur' },
      { key: 'companySize', placeholder: 'Taille entreprise' }
    ],
    tip: 'Ex : "Comment structurer un entretien comportemental en méthode STAR pour un poste de manager ?"'
  },
  {
    id: 'tech', name: 'Orion Tech', icon: '💻', color: '#EFF6FF', iconColor: '#1D4ED8',
    tagline: 'Architecture, dev & DevOps', category: 'tech',
    topics: ['Architecture & design patterns', 'Cloud · Docker · K8s', 'Sécurité & OWASP'],
    params: [
      { key: 'stack', placeholder: 'Stack (ex: Node.js, AWS)' },
      { key: 'role', placeholder: 'Poste visé' }
    ],
    tip: 'Ex : "Quels trade-offs entre microservices et monolithe modulaire pour une équipe de 5 devs ?"'
  },
  {
    id: 'data', name: 'Orion Data', icon: '📈', color: '#FFF7ED', iconColor: '#C2410C',
    tagline: 'Data science, BI & analytics', category: 'tech',
    topics: ['ML · NLP · Deep learning', 'SQL · dbt · BigQuery', 'A/B testing & stats'],
    params: [
      { key: 'domain', placeholder: 'Domaine data' },
      { key: 'stack', placeholder: 'Stack (ex: Python, dbt)' }
    ],
    tip: 'Ex : "Comment détecter et corriger le data drift sur un modèle de scoring de crédit en production ?"'
  },
  {
    id: 'sales', name: 'Orion Sales', icon: '💰', color: '#ECFDF5', iconColor: '#059669',
    tagline: 'Sales, conversion & négociation', category: 'marketing',
    topics: ['Emails de conversion', 'Argumentaire & objections', 'Négociation & closing'],
    params: [
      { key: 'sector', placeholder: 'Secteur cible' },
      { key: 'role', placeholder: 'Poste visé' }
    ],
    tip: 'Ex : "Rédige un email de relance pour un prospect SaaS qui n\'a pas répondu depuis 10 jours."'
  },
  {
    id: 'support', name: 'Orion Support', icon: '💬', color: '#F5F3FF', iconColor: '#6E48BE',
    tagline: 'Aide sur Emploia', category: 'people',
    topics: ['Fonctionnalités Emploia', 'Plans & abonnements', 'Problèmes techniques'],
    params: [],
    tip: 'Ex : "Comment fonctionne le score ATS et comment l\'améliorer ?"'
  },
];

let openId = null;
const chats = {};

function buildGrid(filter) {
  const grid = document.getElementById('agentsGrid');
  grid.innerHTML = '';
  const filtered = filter === 'all' ? AGENTS : AGENTS.filter(a => a.category === filter);
  filtered.forEach(agent => {
    const wrap = document.createElement('div');
    wrap.className = 'agent-wrap';
    wrap.id = `wrap-${agent.id}`;

    const contextInputs = agent.params.map(p =>
      `<input type="text" id="ctx-${agent.id}-${p.key}" placeholder="${p.placeholder}" maxlength="80" autocomplete="off"/>`
    ).join('');

    wrap.innerHTML = `
      <div class="agent-card" id="card-${agent.id}" data-on-click="toggleChat_this_getAttribute_d_da4d" data-arg-0f26-0="${esc(agent.id)}" role="button" aria-expanded="false" tabindex="0">
        <div class="agent-icon" style="background:${agent.color}"><span style="font-size:22px">${agent.icon}</span></div>
        <div class="agent-name">${agent.name}</div>
        <div class="agent-tagline">${agent.tagline}</div>
        <div class="agent-topics">${agent.topics.map(t => `<span class="agent-topic">${t}</span>`).join('')}</div>
        <div class="agent-cta">
          <span>Consulter →</span>
          <span class="agent-chevron">▾</span>
        </div>
      </div>
      <div class="agent-chat" id="chat-${agent.id}">
        ${agent.params.length ? `<div class="chat-context">${contextInputs}</div>` : ''}
        <div class="chat-messages" id="msgs-${agent.id}">
          <div class="chat-empty" id="empty-${agent.id}">${agent.tip}</div>
        </div>
        <form class="chat-form" data-on-submit="sendMsg_event_this_getAttribut_4ba3" data-arg-a9e6-0="${esc(agent.id)}">
          <textarea class="chat-input" id="inp-${agent.id}" placeholder="Votre question…" rows="1" aria-label="Question"></textarea>
          <button type="submit" class="chat-send" id="send-${agent.id}" aria-label="Envoyer">
            <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </form>
        <div class="chat-footer">
          <span id="limit-${agent.id}" style="color:var(--slate);opacity:.7">5 questions/h · <a href="/app" style="color:var(--primary);text-decoration:none;font-weight:600">Pro : 20/h illimités</a></span>
        </div>
      </div>
    `;
    grid.appendChild(wrap);

    const inp = document.getElementById(`inp-${agent.id}`);
    if (inp) {
      inp.addEventListener('input', () => {
        inp.style.height = 'auto';
        inp.style.height = Math.min(inp.scrollHeight, 80) + 'px';
      });
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById(`send-${agent.id}`)?.click(); }
      });
    }
  });
}

function toggleChat(id) {
  const card = document.getElementById(`card-${id}`);
  const chat = document.getElementById(`chat-${id}`);
  if (!card || !chat) return;
  const isOpen = card.classList.contains('open');

  if (openId && openId !== id) {
    const prevCard = document.getElementById(`card-${openId}`);
    const prevChat = document.getElementById(`chat-${openId}`);
    prevCard?.classList.remove('open');
    prevChat?.classList.remove('open');
    prevCard?.setAttribute('aria-expanded', 'false');
  }

  card.classList.toggle('open', !isOpen);
  chat.classList.toggle('open', !isOpen);
  card.setAttribute('aria-expanded', String(!isOpen));
  openId = !isOpen ? id : null;

  if (!isOpen) {
    setTimeout(() => {
      document.getElementById(`inp-${id}`)?.focus();
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  }
}

function addMsg(agentId, text, who) {
  const msgs = document.getElementById(`msgs-${agentId}`);
  const empty = document.getElementById(`empty-${agentId}`);
  if (empty) empty.remove();
  const div = document.createElement('div');
  div.className = `chat-msg ${who}`;
  div.innerHTML = text.replace(/\n/g, '<br>');
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

async function sendMsg(e, agentId) {
  e.preventDefault();
  const inp = document.getElementById(`inp-${agentId}`);
  const send = document.getElementById(`send-${agentId}`);
  const msgs = document.getElementById(`msgs-${agentId}`);
  const q = inp.value.trim();
  if (!q || send.disabled) return;

  send.disabled = true;
  addMsg(agentId, q, 'user');
  inp.value = '';
  inp.style.height = 'auto';

  const agent = AGENTS.find(a => a.id === agentId);
  const body = { question: q };
  agent?.params.forEach(p => {
    const val = document.getElementById(`ctx-${agentId}-${p.key}`)?.value.trim();
    if (val) body[p.key] = val;
  });

  const typing = document.createElement('div');
  typing.className = 'chat-typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  msgs.appendChild(typing);
  msgs.scrollTop = msgs.scrollHeight;

  try {
    const res = await fetch(`/api/agent/${agentId}`, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    typing.remove();
    if (res.status === 429) {
      addMsg(agentId, '⚠️ Limite atteinte. <a href="/app" style="color:var(--primary)">Passez Pro</a> pour 20 questions/heure.', 'bot');
    } else {
      addMsg(agentId, data.answer || 'Impossible de répondre. Réessayez.', 'bot');
    }
  } catch {
    typing.remove();
    addMsg(agentId, 'Service momentanément indisponible. Réessayez dans quelques secondes.', 'bot');
  } finally {
    send.disabled = false;
    inp.focus();
  }
}

/* Filter */
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    openId = null;
    buildGrid(btn.dataset.filter);
  });
});

/* Init */
buildGrid('all');

/* Update limit label when user is Pro */
window.addEventListener('empUserLoaded', e => {
  const u = e.detail;
  if (u && u.plan && u.plan !== 'free') {
    document.querySelectorAll('[id^="limit-"]').forEach(el => {
      el.innerHTML = `<span style="color:var(--brand-green);font-weight:600">✓ Pro · 20 questions/heure</span>`;
    });
  }
});

/* Keyboard nav on cards */
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.classList.contains('agent-card')) {
    const id = e.target.id.replace('card-', '');
    toggleChat(id);
  }
});

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["sendMsg_event_this_getAttribut_4ba3"] = function (event) {
  sendMsg(event,this.getAttribute("data-arg-a9e6-0"))
};
EMP_H["toggleChat_this_getAttribute_d_da4d"] = function (event) {
  toggleChat(this.getAttribute("data-arg-0f26-0"))
};
