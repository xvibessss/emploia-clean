  window.addEventListener('scroll', () => {
    const d = document.documentElement;
    const pct = (d.scrollTop / (d.scrollHeight - d.clientHeight)) * 100;
    document.getElementById('readProgress').style.width = pct + '%';
  });
  function subscribeNewsletter(e) {
    e.preventDefault();
    const email = document.getElementById('nlEmail').value;
    fetch('/api/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      .then(r => r.json()).then(() => {
        e.target.innerHTML = '<p style="color:#10b981;font-weight:700">✓ Vous êtes inscrit !</p>';
      }).catch(() => {
        e.target.innerHTML = '<p style="color:#10b981;font-weight:700">✓ Vous êtes inscrit !</p>';
      });
  }
