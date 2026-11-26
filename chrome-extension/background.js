// Emploia — service worker
//
// L'offre est passée au générateur dans le FRAGMENT de l'URL (#offre=…) : le
// navigateur ne l'envoie jamais au serveur, elle n'apparaît donc dans aucun
// journal, et elle échappe aux limites de longueur des URL côté hébergeur.
// /app la lit, la colle dans le champ, puis efface le fragment.

const GENERATEUR = 'https://emploia.eu/app?source=extension';

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'OPEN_GENERATOR' && typeof msg.offre === 'string' && msg.offre.trim()) {
    chrome.tabs.create({
      url: `${GENERATEUR}#offre=${encodeURIComponent(msg.offre.slice(0, 8000))}`,
      index: sender.tab ? sender.tab.index + 1 : undefined,
    });
  }

  if (msg.type === 'AUTOFILL_DONE' && sender.tab?.id) {
    chrome.action.setBadgeText({ text: '✓', tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId: sender.tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: sender.tab.id }), 3000);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') chrome.action.setBadgeText({ text: '', tabId });
});
