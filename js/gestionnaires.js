/* ── Gestionnaires déclarés ──────────────────────────────────────────────────
   Le HTML ne porte plus d'attribut on* (onclick, onsubmit…) : la politique de
   sécurité du site (CSP) interdit le JavaScript écrit dans le balisage, parce
   que c'est par là qu'une donnée mal échappée devient du code exécuté.

   À la place, un élément déclare un NOM :

       <button data-on-click="ouvrirPreferences">…</button>

   et le JavaScript de la page associe ce nom à une fonction :

       EMP_H.ouvrirPreferences = function (event) { … };

   Dans la fonction, `this` est l'élément et `event` l'événement ; `return
   false` annule l'action par défaut — exactement comme dans un attribut on*.
   Une valeur propre à l'élément (un identifiant d'offre, par exemple) voyage
   dans un attribut data-* échappé avec esc(), lu par this.getAttribute(…) :
   elle reste une donnée et ne peut plus être interprétée comme du code.

   Le balisage injecté après coup (innerHTML) est relié de la même façon, par
   l'observateur ci-dessous. Un nom absent du registre ne fait rien, sinon un
   avertissement dans la console.

   Ce bloc existe à l'identique en tête de shared.js (pour toutes les pages) et
   dans js/gestionnaires.js (pour les rares pages sans shared.js). Le garde CI
   [23] vérifie que les deux copies ne divergent pas. */
window.EMP_H = window.EMP_H || {};
(function () {
  if (window.__empGestionnaires) return;
  window.__empGestionnaires = true;
  var TYPES = ['click', 'dblclick', 'change', 'input', 'submit', 'keydown', 'keyup', 'focus', 'blur',
    'mouseover', 'mouseout', 'mouseenter', 'mouseleave', 'dragstart', 'dragenter', 'dragover', 'dragleave',
    'dragend', 'drop', 'load', 'error'];
  var SELECTEUR = TYPES.map(function (t) { return '[data-on-' + t + ']'; }).join(',');
  var relies = new WeakSet();

  function relier(el) {
    if (relies.has(el)) return;
    relies.add(el);
    TYPES.forEach(function (type) {
      var nom = el.getAttribute('data-on-' + type);
      if (!nom) return;
      el.addEventListener(type, function (event) {
        var fn = window.EMP_H[nom];
        if (typeof fn !== 'function') {
          console.warn('[emploia] gestionnaire inconnu : ' + nom);
          return;
        }
        if (fn.call(el, event) === false) event.preventDefault();
      });
      // Une image du HTML d'origine peut avoir échoué AVANT que ce script ne
      // tourne : un attribut onerror l'aurait vu, un écouteur posé après coup
      // non. On rejoue donc l'échec déjà constaté.
      if (type === 'error' && el.tagName === 'IMG' && el.complete && el.naturalWidth === 0 && el.getAttribute('src')) {
        var fn = window.EMP_H[nom];
        if (typeof fn === 'function') fn.call(el, new Event('error'));
      }
    });
  }

  function parcourir(racine) {
    if (!racine || racine.nodeType !== 1) return;
    if (racine.matches(SELECTEUR)) relier(racine);
    var liste = racine.querySelectorAll(SELECTEUR);
    for (var i = 0; i < liste.length; i++) relier(liste[i]);
  }

  new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var ajoutes = mutations[i].addedNodes;
      for (var j = 0; j < ajoutes.length; j++) parcourir(ajoutes[j]);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  parcourir(document.documentElement);
})();
