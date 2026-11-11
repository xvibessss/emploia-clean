function calcNet() {
  const brut = parseFloat(document.getElementById('brutAnnuel').value);
  const coeff = parseFloat(document.getElementById('statut').value);
  const res = document.getElementById('calcResult');
  if (!brut || isNaN(brut)) { res.style.display = 'none'; return; }
  const netAnnuel = Math.round(brut * coeff);
  const netMensuel = Math.round(netAnnuel / 12);
  document.getElementById('netMensuel').textContent = netMensuel.toLocaleString('fr-FR') + ' €';
  document.getElementById('netAnnuel').textContent = netAnnuel.toLocaleString('fr-FR') + ' €';
  res.style.display = 'flex';
}

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["calcNet"] = function (event) {
  calcNet()
};
