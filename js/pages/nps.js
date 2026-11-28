    (function () {
      const app = document.getElementById('app');

      // --- Helpers ---
      function getParam(name) {
        return new URLSearchParams(window.location.search).get(name);
      }

      function showMessage(emoji, text) {
        app.innerHTML = `
          <div class="message-box">
            <div class="emoji">${emoji}</div>
            <p>${text}</p>
          </div>
        `;
      }

      function thankYouMessage(score) {
        if (score <= 6) return { emoji: '🙏', text: 'Merci pour ton honnêteté. On va s\'améliorer.' };
        if (score <= 8) return { emoji: '😊', text: 'Merci ! On est curieux de savoir ce qu\'on pourrait améliorer.' };
        return { emoji: '🎉', text: 'Merci ! Ça fait vraiment plaisir.' };
      }

      // --- State ---
      const userId = getParam('uid');
      let selectedScore = null;

      // --- Render NPS form ---
      function renderForm() {
        app.innerHTML = `
          <h1>De 0 à 10, recommanderais-tu Emploia à un ami en recherche d'emploi&nbsp;?</h1>

          <div>
            <div class="score-grid" id="score-grid">
              ${Array.from({ length: 11 }, (_, i) =>
                `<button class="score-btn" data-score="${i}" aria-label="Note ${i}">${i}</button>`
              ).join('')}
            </div>
            <div class="score-labels">
              <span>Pas du tout probable</span>
              <span>Très probable</span>
            </div>
          </div>

          <div class="comment-section" id="comment-section" style="display:none;">
            <label for="comment">Tu peux nous en dire plus&nbsp;? <span style="font-weight:400;color:var(--text-muted,#94a3b8)">(optionnel)</span></label>
            <textarea id="comment" placeholder="Ton retour nous aide à nous améliorer…"></textarea>
            <button class="btn-submit" id="btn-submit">Envoyer mon avis</button>
          </div>
        `;

        // Score buttons
        document.getElementById('score-grid').addEventListener('click', function (e) {
          const btn = e.target.closest('.score-btn');
          if (!btn) return;
          selectedScore = parseInt(btn.dataset.score, 10);

          document.querySelectorAll('.score-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');

          document.getElementById('comment-section').style.display = 'flex';
        });

        // Submit
        document.getElementById('btn-submit').addEventListener('click', async function () {
          if (selectedScore === null) return;
          const comment = document.getElementById('comment').value.trim();
          const submitBtn = document.getElementById('btn-submit');

          submitBtn.disabled = true;
          submitBtn.textContent = 'Envoi…';

          try {
            const res = await fetch('/api/nps', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: userId || 'anonymous', score: selectedScore, comment }),
            });

            if (res.ok) {
              const msg = thankYouMessage(selectedScore);
              showMessage(msg.emoji, msg.text);
            } else {
              const data = await res.json().catch(() => ({}));
              if (res.status === 409) {
                showMessage('✅', 'Tu as déjà répondu, merci&nbsp;!');
              } else {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Envoyer mon avis';
                alert(data.error || 'Une erreur est survenue. Réessaie dans un moment.');
              }
            }
          } catch {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Envoyer mon avis';
            alert('Erreur réseau. Vérifie ta connexion et réessaie.');
          }
        });
      }

      // --- Init ---
      async function init() {
        // Show a minimal loading state
        app.innerHTML = '<p style="text-align:center;color:var(--text-muted,#94a3b8);padding:16px 0;">Chargement…</p>';

        if (userId) {
          try {
            const res = await fetch(`/api/nps?uid=${encodeURIComponent(userId)}`);
            if (res.ok) {
              const data = await res.json();
              if (data.alreadyAnswered) {
                showMessage('✅', 'Tu as déjà répondu, merci&nbsp;!');
                return;
              }
            }
          } catch {
            // Network issue — show form anyway
          }
        }

        renderForm();
      }

      init();
    })();
  
