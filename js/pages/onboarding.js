  let currentStep = 1;
  let generatedResult = '';
  let selectedProfile = 'jeune-diplome';

  function validateStep1() {
    const name = document.getElementById('firstName').value.trim();
    if (!name) {
      const input = document.getElementById('firstName');
      input.style.borderColor = '#f87171';
      input.placeholder = 'Votre prénom est requis';
      input.focus();
      setTimeout(() => { input.style.borderColor = ''; }, 2500);
      return;
    }
    goStep(2);
  }

  function goStep(n) {
    document.getElementById('step-'+currentStep).classList.remove('active');
    // Update sidebar
    ['nav-1','nav-2','nav-3'].forEach((id,i) => {
      const el = document.getElementById(id);
      el.classList.remove('active','done');
      if (i+1 < n) el.classList.add('done');
      if (i+1 === n) el.classList.add('active');
    });
    currentStep = n;
    document.getElementById('step-'+n).classList.add('active');
    const prog = { 1: '5%', 2: '40%', 3: '75%' };
    document.getElementById('progressBar').style.width = prog[n] || '5%';

    // Personalize step 2
    if (n === 2) {
      const name = document.getElementById('firstName').value.trim();
      document.getElementById('step2title').textContent = name ? `${name}, quelle offre vous intéresse ?` : 'Quelle offre vous intéresse ?';
    }
  }

  function selectProfile(el) {
    document.querySelectorAll('.profile-opt').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    selectedProfile = el.dataset.value;
  }

  async function startGeneration() {
    const jobOffer = document.getElementById('jobOffer').value.trim();
    const userProfile = document.getElementById('userProfile').value.trim();
    if (!jobOffer || !userProfile) {
      const emptyEl = !jobOffer ? document.getElementById('jobOffer') : document.getElementById('userProfile');
      emptyEl.style.borderColor = '#f87171';
      emptyEl.placeholder = 'Ce champ est requis';
      emptyEl.focus();
      setTimeout(() => { emptyEl.style.borderColor = ''; }, 2500);
      return;
    }
    goStep(3);
    runLoadingAnimation();

    try {
      const res = await fetch('/api/generate/cv', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobOffer, profile: userProfile, profileType: selectedProfile, stream: true }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        finishLoading();
        document.getElementById('step3sub').textContent = 'Erreur : ' + (d.error || 'Veuillez réessayer.');
        return;
      }

      // Streaming response
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', result = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.chunk) result += evt.chunk;
            if (evt.done && evt.fullText) result = evt.fullText;
          } catch {}
        }
      }

      finishLoading();
      if (result) {
        generatedResult = result;
        if (window.plausible) plausible('onboarding_cv_generated');
        showResult(result);
        const credits = parseInt(localStorage.getItem('emploia_credits') ?? '5') - 1;
        localStorage.setItem('emploia_credits', Math.max(0, credits));
      } else {
        document.getElementById('step3sub').textContent = 'Erreur lors de la génération. Réessayez.';
      }
    } catch(e) {
      finishLoading();
      document.getElementById('step3sub').textContent = 'Erreur réseau. Vérifiez votre connexion.';
    }
  }

  let loadingTimer;
  function runLoadingAnimation() {
    const items = ['li1','li2','li3','li4'];
    let i = 0;
    items.forEach(id => document.getElementById(id).className = 'li-item');
    document.getElementById('li1').classList.add('active');
    loadingTimer = setInterval(() => {
      if (i < items.length - 1) {
        document.getElementById(items[i]).className = 'li-item done';
        i++;
        document.getElementById(items[i]).classList.add('active');
      }
    }, 1500);
  }

  function finishLoading() {
    clearInterval(loadingTimer);
    ['li1','li2','li3','li4'].forEach(id => document.getElementById(id).className = 'li-item done');
  }

  function showResult(text) {
    document.getElementById('progressBar').style.width = '100%';
    document.getElementById('resultBody').textContent = text;
    document.getElementById('resultWrap').classList.add('vis');

    // Extract ATS score
    const match = text.match(/Score\s*:\s*(\d+)\/100/i) || text.match(/SCORE ATS[^:]*:\s*(\d+)/i);
    document.getElementById('atsBadge').textContent = match ? `Score ATS : ${match[1]}/100 ✓` : 'CV ATS-ready ✓';

    setTimeout(() => {
      document.getElementById('loadingList').classList.remove('vis');
      document.getElementById('step3sub').textContent = '';
      const name = document.getElementById('firstName').value.trim();
      document.getElementById('successTitle').textContent = name ? `${name}, votre CV est prêt !` : 'Votre CV est prêt !';
      document.getElementById('successBlock').style.display = 'block';
    }, 800);
  }

  function copyResult() {
    if (!generatedResult) return;
    navigator.clipboard.writeText(generatedResult).then(() => {
      const btn = document.getElementById('copyBtn');
      btn.textContent = '✅ Copié !'; btn.classList.add('ok');
      setTimeout(() => { btn.textContent = '📋 Copier'; btn.classList.remove('ok'); }, 2000);
    });
  }
