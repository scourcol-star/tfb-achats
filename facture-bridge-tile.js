/* Tuile « Total facturé HT » : à droite de « Total HT reçu ».
   Donnée : balance des comptes d'achats Pennylane, lue via le Bridge Commandes & Factures
   (même chiffre que son bloc « Contrôle comptable »), sur la période choisie (date-start / date-end).
   Script autonome : il ne touche pas au calcul existant, il se recale à chaque rafraîchissement des tuiles. */
(function () {
  var cache = {};
  var cleCourante = null;
  var minuterie = null;

  function eur(v) { return Math.round(v).toLocaleString('fr-FR') + ' €'; }
  function el(id) { return document.getElementById(id); }

  function tuile() {
    var t = el('m-fac-tile');
    if (t) return t;
    var recu = el('m-total-recv');
    var hote = recu && recu.closest('.metric');
    if (!hote) return null;
    t = document.createElement('div');
    t.className = 'metric accent';
    t.id = 'm-fac-tile';
    t.innerHTML =
      '<div class="ml" title="Balance générale Pennylane, entités LAB + RÉSEAU, comptes 601, 6022, 6026, 607, 6061000009, 6062000003 (hors 6013), net = débit − crédit, avoirs et RFA déduits. Même chiffre que le Contrôle comptable du Bridge. Toutes boutiques : non filtrable par site.">Total facturé HT</div>' +
      '<div class="mv" id="m-total-fac">—</div>' +
      '<div class="ms" id="m-fac-sub">Balance achats Pennylane · via Bridge</div>' +
      '<div id="m-fac-detail"></div>';
    hote.insertAdjacentElement('afterend', t);
    return t;
  }

  function ligne(couleur, libelle, valeur) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12px;margin-top:4px">' +
      '<span style="display:flex;align-items:center;gap:6px;color:var(--tx2)"><span style="width:7px;height:7px;border-radius:50%;background:' + couleur + '"></span>' + libelle + '</span>' +
      '<b style="font-variant-numeric:tabular-nums">' + valeur + '</b></div>';
  }

  function afficher(etat, d) {
    if (!tuile()) return;
    var mv = el('m-total-fac'), sub = el('m-fac-sub'), det = el('m-fac-detail');
    if (etat === 'vide') { mv.textContent = '—'; sub.textContent = 'Choisir une période'; det.innerHTML = ''; return; }
    if (etat === 'charge') { mv.textContent = '…'; sub.textContent = 'Lecture du Bridge…'; det.innerHTML = ''; return; }
    if (etat === 'erreur') { mv.textContent = '—'; sub.textContent = 'Bridge non joignable'; det.title = d || ''; det.innerHTML = ''; return; }
    mv.textContent = eur(d.total);
    sub.textContent = 'Balance achats Pennylane · via Bridge';
    det.innerHTML = '<div style="border-top:1px solid var(--bor);margin-top:10px;padding-top:6px;text-align:left">' +
      ligne('#1f3a5f', 'LAB', eur(d.lab || 0)) +
      ligne('#c8a96e', 'RÉSEAU', eur(d.reseau || 0)) + '</div>';
  }

  function rafraichir() {
    if (!tuile()) return;
    var s = el('date-start'), e = el('date-end');
    var debut = s && s.value, fin = e && e.value;
    if (!debut || !fin) { cleCourante = null; afficher('vide'); return; }
    var cle = debut + '|' + fin;
    if (cle === cleCourante) return;
    cleCourante = cle;
    if (cache[cle]) { afficher('ok', cache[cle]); return; }
    afficher('charge');
    fetch('/api/facture-bridge?start=' + encodeURIComponent(debut) + '&end=' + encodeURIComponent(fin))
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); })
      .then(function (j) { cache[cle] = j; if (cleCourante === cle) afficher('ok', j); })
      .catch(function (err) { if (cleCourante === cle) { cleCourante = null; afficher('erreur', String(err && err.message || err)); } });
  }

  function planifier() { clearTimeout(minuterie); minuterie = setTimeout(rafraichir, 250); }

  function demarrer() {
    var rangee = el('metrics-row');
    if (rangee) new MutationObserver(planifier).observe(rangee, { childList: true, subtree: true, characterData: true });
    ['date-start', 'date-end'].forEach(function (id) { var x = el(id); if (x) x.addEventListener('change', planifier); });
    planifier();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
