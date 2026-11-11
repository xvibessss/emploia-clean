  const PATH_TO_SECTION = {
    '/legal/mentions': 'mentions',
    '/legal/privacy': 'privacy',
    '/legal/cgu': 'cgu',
    '/legal/cookies': 'cookies',
    '/legal': 'mentions',
  };

  const SECTIONS = ['mentions', 'privacy', 'cgu', 'cgv', 'cookies'];

  function showSection(id) {
    document.querySelectorAll('.legal-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.legal-tab').forEach(t => t.classList.remove('active'));
    const section = document.getElementById(id);
    if (section) section.classList.add('active');
    const tab = document.querySelector(`.legal-tab[data-section="${id}"]`);
    if (tab) tab.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Detect which section to show: URL hash first (les pieds de page du site
  // pointent vers /legal#mentions, #privacy, #cgu, #cgv), sinon le chemin.
  const hash = window.location.hash.replace('#', '');
  const path = window.location.pathname.replace(/\/$/, '');
  const sectionId = SECTIONS.includes(hash) ? hash : (PATH_TO_SECTION[path] || 'mentions');
  showSection(sectionId);

  window.addEventListener('hashchange', () => {
    const h = window.location.hash.replace('#', '');
    if (SECTIONS.includes(h)) showSection(h);
  });

  // Tab click handling (prevent full reload)
  document.querySelectorAll('.legal-tab').forEach(tab => {
    tab.addEventListener('click', e => {
      e.preventDefault();
      const id = tab.dataset.section;
      history.pushState(null, '', tab.href);
      showSection(id);
    });
  });
