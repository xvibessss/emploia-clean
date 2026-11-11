/* ── Creator code → visible discount on the Pack Campagne ──
   A TikTok viewer arrives on /?code=LEA10. The discount is applied for real by
   Stripe at checkout; this only makes it visible on the card, because a code
   the visitor cannot see on the page reads as a code that did not work.
   Purely cosmetic: it never decides the amount charged, and it stays silent
   when no code was captured. The server is still free to reject the code, in
   which case the buyer sees 59 € on Stripe's page — hence "sous réserve". */
(function () {
  var code = window.empCreatorCode ? window.empCreatorCode() : '';
  if (!code) return;
  var price = document.getElementById('packPrice');
  var per = document.getElementById('packPer');
  if (!price || !per) return;
  price.innerHTML = '<span style="text-decoration:line-through;opacity:.45;font-size:.6em;margin-right:8px">59€</span>49€<small> les 3 mois</small>';
  per.innerHTML = 'Code <strong>' + code.replace(/[^A-Z0-9]/g, '') + '</strong> appliqué · −10€ · paiement unique';
})();
