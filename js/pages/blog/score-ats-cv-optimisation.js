    const rp = document.getElementById('rp');
    window.addEventListener('scroll', () => {
      const h = document.documentElement;
      const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
      rp.style.width = pct + '%';
    }, { passive: true });
  
