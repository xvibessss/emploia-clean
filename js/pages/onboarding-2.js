if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["copyResult"] = function (event) {
  copyResult()
};
EMP_H["goStep_1_326e"] = function (event) {
  goStep(1)
};
EMP_H["selectProfile_this_fe82"] = function (event) {
  selectProfile(this)
};
EMP_H["startGeneration"] = function (event) {
  startGeneration()
};
EMP_H["validateStep1"] = function (event) {
  validateStep1()
};
