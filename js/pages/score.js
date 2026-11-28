    (function () {
      // ── Helpers ────────────────────────────────────────────────────
      const CIRCUMFERENCE = 2 * Math.PI * 65; // ≈ 408.41

      function scoreColor(score) {
        if (score >= 80) return '#10b981'; // green
        if (score >= 60) return '#f97316'; // orange
        return '#ef4444';                  // red
      }

      function scoreMessage(score) {
        if (score >= 80) return 'Excellent score ! Ce CV passe les filtres ATS';
        if (score >= 60) return 'Score correct — améliorable pour maximiser les chances';
        return 'Score insuffisant — la plupart des ATS filtrent ce CV';
      }

      function animateCounter(el, target, duration) {
        const start = performance.now();
        function step(now) {
          const progress = Math.min((now - start) / duration, 1);
          // ease-out cubic
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.round(eased * target);
          if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }

      function animateGauge(fillEl, score, duration) {
        const target = CIRCUMFERENCE * (1 - score / 100);
        const start = performance.now();
        fillEl.style.strokeDashoffset = CIRCUMFERENCE; // reset
        function step(now) {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          fillEl.style.strokeDashoffset = CIRCUMFERENCE - eased * (CIRCUMFERENCE - target);
          if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }

      // ── Fetch & render ─────────────────────────────────────────────
      const token = window.location.pathname.split('/').pop();
      const pageUrl = window.location.href;

      async function loadScore() {
        if (!token) { showError(); return; }

        let data;
        try {
          const res = await fetch('/api/share-score?token=' + encodeURIComponent(token));
          if (res.status === 404) { showError(); return; }
          if (!res.ok) { showError(); return; }
          data = await res.json();
        } catch {
          showError();
          return;
        }

        renderScore(data);
      }

      function renderScore({ score, jobTitle }) {
        const color = scoreColor(score);
        const label = jobTitle ? 'Score ATS de ' + jobTitle : 'Score ATS de votre candidature';
        const message = scoreMessage(score);

        // Update meta OG tags
        const ogTitle = 'J\'ai obtenu ' + score + '/100 sur Emploia !';
        document.getElementById('og-title').setAttribute('content', ogTitle + ' — Emploia');
        document.getElementById('og-desc').setAttribute('content', 'Analyse ton CV gratuitement avec Emploia et optimise-le pour les ATS.');
        document.getElementById('tw-title').setAttribute('content', ogTitle);
        document.getElementById('tw-desc').setAttribute('content', 'Analyse ton CV gratuitement avec Emploia.');
        document.title = ogTitle + ' — Emploia';

        // DOM updates
        document.getElementById('score-label').textContent = label;
        document.getElementById('score-message').textContent = message;

        const gaugeFill = document.getElementById('gauge-fill');
        gaugeFill.style.stroke = color;
        gaugeFill.style.strokeDasharray = CIRCUMFERENCE;

        // Share links
        const tweetText = 'J\'ai obtenu ' + score + '/100 sur Emploia ! Analyse ton CV gratuitement 👇';
        document.getElementById('btn-linkedin').href =
          'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(pageUrl);
        document.getElementById('btn-twitter').href =
          'https://twitter.com/intent/tweet?text=' + encodeURIComponent(tweetText) +
          '&url=' + encodeURIComponent(pageUrl);

        document.getElementById('btn-copy').addEventListener('click', () => {
          navigator.clipboard.writeText(pageUrl).then(() => {
            const lbl = document.getElementById('copy-label');
            const btn = document.getElementById('btn-copy');
            lbl.textContent = 'Lien copié !';
            btn.classList.add('copied');
            setTimeout(() => {
              lbl.textContent = 'Copier le lien';
              btn.classList.remove('copied');
            }, 2000);
          });
        });

        // Show content, hide loader
        document.getElementById('loading-msg').style.display = 'none';
        const content = document.getElementById('score-content');
        content.style.display = 'flex';

        // Animate
        animateCounter(document.getElementById('gauge-number'), score, 1200);
        animateGauge(gaugeFill, score, 1200);
      }

      function showError() {
        document.getElementById('loading-msg').style.display = 'none';
        document.getElementById('error-msg').style.display = 'block';
      }

      loadScore();
    })();
  
