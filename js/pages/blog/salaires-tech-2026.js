document.addEventListener('scroll', () => {
  const h = document.documentElement;
  const el = document.getElementById('read-progress');
  if (el) el.style.width = Math.min((h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100, 100) + '%';
});
