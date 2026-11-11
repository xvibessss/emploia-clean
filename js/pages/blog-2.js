if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["closeArticle"] = function (event) {
  closeArticle()
};
EMP_H["filterByCategory_cv_return_fal_e4ef"] = function (event) {
  filterByCategory('cv');return false;
};
EMP_H["filterByCategory_entretien_ret_e9e9"] = function (event) {
  filterByCategory('entretien');return false;
};
EMP_H["filterByCategory_recherche_ret_88f4"] = function (event) {
  filterByCategory('recherche');return false;
};
EMP_H["filterByCategory_salaire_retur_abad"] = function (event) {
  filterByCategory('salaire');return false;
};
EMP_H["filterCat_this_8e44"] = function (event) {
  filterCat(this)
};
EMP_H["handleNlSubmit_event_9900"] = function (event) {
  handleNlSubmit(event)
};
EMP_H["if_event_target_this_closeArti_4a27"] = function (event) {
  if(event.target===this)closeArticle()
};
