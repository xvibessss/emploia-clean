/* Calculateur de sièges. Les montants affichés sont indicatifs : aucun paiement
   ne part de cette page, les devis Écoles & RH sont établis à la main. Les
   paliers doivent rester alignés sur le tableau « Grille complète » ci-dessus
   et sur le JSON-LD en tête de page. */
(function () {
  // Barème par tranches, et non par volume : chaque tranche de sièges est
  // facturée à son propre taux, comme un barème d'impôt. Une tarification par
  // volume — un taux unique appliqué à tout l'effectif selon le palier
  // atteint — rendait un effectif supérieur moins cher (499 sièges à 22 €
  // coûtaient 2 478 € de plus que 500 sièges à 17 €), ce qu'un acheteur
  // repère immédiatement. L'écart entre les taux rend cette inversion
  // intrinsèque au modèle par volume : aucun choix de seuil ne la supprime.
  // Ne pas revenir à un taux unique.
  var BRACKETS = [
    { upTo: 500,      price: 22 },
    { upTo: 1000,     price: 17 },
    { upTo: Infinity, price: 12 }
  ];
  // Le forfait plateforme couvre ce qui ne dépend pas de l'effectif (SSO,
  // tableau de bord, personnalisation, cadrage, support nommé). Il ne
  // s'applique qu'au modèle par siège : les deux modèles outplacement se
  // déploient sur un cabinet déjà équipé, sans cohorte à ouvrir.
  var PLATFORM = 2500;
  var FLOOR = 3500;        // plancher de facturation, tous modèles confondus
  var OUTPL_USAGE = 190;   // € par candidat effectivement accompagné
  var OUTPL_LICENCE = 1500; // € par consultant et par an, candidats illimités
  var THRESHOLD = 40000;   // seuil HT de mise en concurrence
  var WORKDAYS = 218;      // jours ouvrés par an, convention de paie

  var kind = 'ecole';   // 'ecole' | 'cfa' | 'outpl'
  var mode = 'usage';   // outplacement seulement : 'usage' | 'licence'
  var $ = function (id) { return document.getElementById(id); };
  var seats = $('ecSeats'), range = $('ecRange'), advisor = $('ecAdvisor');
  if (!seats || !range || !advisor) return;

  function eur(n, d) {
    return n.toLocaleString('fr-FR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }) + ' €';
  }
  function int(n) { return Math.round(n).toLocaleString('fr-FR'); }
  function dec(n, d) { return n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }); }

  // Somme des tranches, et taux marginal du dernier siège — c'est ce taux
  // marginal qui est annoncé au visiteur, le coût moyen étant par
  // construction inférieur dès qu'on dépasse 500 sièges.
  function seatCost(n) {
    var total = 0, from = 0, marginal = BRACKETS[0].price;
    for (var i = 0; i < BRACKETS.length; i++) {
      var span = Math.min(n, BRACKETS[i].upTo) - from;
      if (span <= 0) break;
      total += span * BRACKETS[i].price;
      marginal = BRACKETS[i].price;
      from = BRACKETS[i].upTo;
    }
    return { total: total, marginal: marginal };
  }

  function bracketHint(n) {
    if (n <= 500) return 'Les 500 premiers sièges à 22 € par siège et par an, plus le forfait plateforme de 2 500 €.';
    if (n <= 1000) return 'Barème par tranches : les 500 premiers sièges à 22 €, les suivants à 17 €, plus le forfait plateforme de 2 500 €.';
    return 'Barème par tranches : les 500 premiers sièges à 22 €, de 501 à 1 000 à 17 €, au-delà de 1 000 à 12 €, plus le forfait plateforme de 2 500 €.';
  }

  // Renvoie le devis indicatif pour un effectif donné. `raw` est le montant
  // avant plancher — conservé pour pouvoir dire au visiteur que le plancher
  // s'applique, plutôt que de lui afficher un total inexpliqué.
  function quote(n) {
    if (kind === 'outpl') {
      if (mode === 'licence') {
        return { unit: OUTPL_LICENCE, platform: 0, raw: n * OUTPL_LICENCE, averaged: false,
          hint: 'Licence consultant : 1 500 € par consultant et par an, nombre de candidats accompagnés illimité.' };
      }
      return { unit: OUTPL_USAGE, platform: 0, raw: n * OUTPL_USAGE, averaged: false,
        hint: 'Facturation à l’usage : 190 € par candidat effectivement accompagné, sans forfait plateforme.' };
    }
    var s = seatCost(n);
    var raw = s.total + PLATFORM;
    // Le coût moyen par siège se calcule sur le budget **réellement facturé**,
    // forfait plateforme et plancher compris. Un acheteur divise le montant du
    // devis par son effectif : toute autre définition le ferait arriver à un
    // nombre différent de celui qu'on affiche. C'est exactement l'écart qui a
    // fait vivre « 22,00 € » dans le tableau en face de 11 300 € pour 400
    // sièges, alors que le devis donne 28,25 €.
    return { unit: s.marginal, platform: PLATFORM, raw: raw,
      averaged: true, average: Math.max(FLOOR, raw) / n, hint: bracketHint(n) };
  }

  function render() {
    var n = Math.max(1, Math.min(8000, parseInt(seats.value, 10) || 1));
    var adv = Math.max(1, parseInt(advisor.value, 10) || 42000);
    var q = quote(n);
    var floored = q.raw < FLOOR;
    var total = floored ? FLOOR : q.raw;
    var isLicence = kind === 'outpl' && mode === 'licence';
    var noun = isLicence ? 'consultants' : (kind === 'outpl' ? 'candidats' : 'étudiants');
    var unitNoun = isLicence ? ' par consultant' : (kind === 'outpl' ? ' par candidat' : ' par siège');

    $('ecTotal').textContent = eur(total);
    // Quand on annonce une moyenne par siège, elle porte déjà le forfait : le
    // répéter derrière ferait lire au visiteur un forfait ajouté deux fois.
    $('ecTotalUnit').textContent = 'par an, pour ' + int(n) + ' ' + noun + ' — '
      + (q.averaged
          ? eur(total / n, 2) + ' par siège en moyenne, forfait plateforme compris'
          : eur(q.unit, q.unit % 1 ? 2 : 0) + unitNoun)
      + (q.platform && !q.averaged ? ' plus ' + eur(q.platform) + ' de forfait plateforme' : '')
      + (floored ? ' (plancher de facturation de ' + eur(FLOOR) + ' appliqué)' : '');
    $('ecTierHint').textContent = q.hint;

    // Le coût unitaire mensuel ne veut rien dire sur une licence consultant,
    // dont l'intérêt est justement d'être décorrélée du volume accompagné.
    if (isLicence) {
      $('ecPerMonthK').textContent = 'Par consultant et par mois';
      $('ecPerMonth').textContent = dec(total / n / 12, 2) + ' €';
    } else {
      $('ecPerMonthK').textContent = kind === 'outpl' ? 'Par candidat accompagné' : 'Par étudiant et par mois';
      $('ecPerMonth').textContent = kind === 'outpl'
        ? dec(total / n, 2) + ' €'
        : dec(total / n / 12, 2) + ' €';
    }
    $('ecPct').textContent = dec(total / adv * 100, 1) + ' %';
    $('ecDays').textContent = int(total / (adv / WORKDAYS)) + ' jours';
    $('ecBadge').textContent = total < THRESHOLD
      ? 'Sous le seuil de 40 000 € HT : passation possible de gré à gré, sans mise en concurrence formalisée.'
      : 'Au-delà de 40 000 € HT : une procédure de mise en concurrence sera probablement requise. Nous vous accompagnons sur le dossier.';
  }

  // Le repère de droite compare la dépense au coût d'un équivalent interne.
  // Pour un cabinet, l'équivalent n'est pas un chargé d'insertion d'école mais
  // un consultant : même raisonnement, autre métier, donc autre libellé.
  function syncLabels() {
    var isOutpl = kind === 'outpl';
    var isLicence = isOutpl && mode === 'licence';
    $('ecModeField').hidden = !isOutpl;
    $('ecSeatsLabel').textContent = isLicence
      ? 'Nombre de consultants'
      : (isOutpl ? 'Nombre de candidats accompagnés par an' : 'Nombre d’étudiants');
    $('ecAdvisorLabel').textContent = isOutpl
      ? 'Coût employeur d’un consultant (€/an)'
      : 'Coût employeur d’un chargé d’insertion (€/an)';
    $('ecPctK').textContent = isOutpl
      ? 'Part du coût d’un consultant'
      : 'Part du coût d’un chargé d’insertion';
    // Une licence se compte en consultants, pas en centaines de sièges : le
    // curseur garderait sinon une échelle inutilisable.
    range.max = isLicence ? '40' : '3000';
    range.step = isLicence ? '1' : '10';
    seats.step = isLicence ? '1' : '10';
    if (isLicence && Number(seats.value) > 40) { seats.value = 4; }
    if (Number(seats.value) <= Number(range.max)) range.value = seats.value;
  }

  seats.addEventListener('input', function () {
    var v = parseInt(seats.value, 10);
    if (v >= Number(range.min) && v <= Number(range.max)) range.value = v;
    render();
  });
  range.addEventListener('input', function () { seats.value = range.value; render(); });
  advisor.addEventListener('input', render);

  Array.prototype.forEach.call(document.querySelectorAll('#ecKind button'), function (b) {
    b.addEventListener('click', function () {
      kind = b.getAttribute('data-kind');
      Array.prototype.forEach.call(document.querySelectorAll('#ecKind button'), function (o) {
        o.setAttribute('aria-pressed', String(o === b));
      });
      syncLabels();
      render();
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('#ecMode button'), function (b) {
    b.addEventListener('click', function () {
      mode = b.getAttribute('data-mode');
      Array.prototype.forEach.call(document.querySelectorAll('#ecMode button'), function (o) {
        o.setAttribute('aria-pressed', String(o === b));
      });
      syncLabels();
      render();
    });
  });

  // Exposé pour la sonde de non-régression (scripts/pricing/ecoles.test.mjs) :
  // les trois exemples de la grille sont des engagements commerciaux, pas des
  // valeurs d'affichage, et doivent casser la CI s'ils dérivent.
  window.__ecQuote = function (k, m, n) {
    var pk = kind, pm = mode;
    kind = k; mode = m;
    var q = quote(n);
    kind = pk; mode = pm;
    return Math.max(FLOOR, q.raw);
  };

  // Le coût moyen par siège est la colonne de droite du tableau « Ce que cela
  // donne ». Il est exposé séparément parce que diviser __ecQuote() par
  // l'effectif dans la sonde ne prouverait rien : la sonde recalculerait sa
  // propre définition au lieu de confronter celle de la page. C'est cette
  // absence qui a laissé « 22,00 € » vivre en face de 11 300 €.
  window.__ecAverage = function (k, m, n) {
    var pk = kind, pm = mode;
    kind = k; mode = m;
    var q = quote(n);
    kind = pk; mode = pm;
    return q.averaged ? q.average : Math.max(FLOOR, q.raw) / n;
  };

  syncLabels();
  render();
})();
