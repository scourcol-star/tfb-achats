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
  function jour(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; }
  function horodatage(iso) {
    var x = new Date(iso);
    if (isNaN(x)) return iso;
    return x.toLocaleDateString('fr-FR') + ' à ' + x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

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
      '<div class="ml" title="Même chiffre que « Achats facturés HT » du Dashboard du Bridge : factures fournisseurs Pennylane LAB + RÉSEAU, en date de facture, fournisseurs Inpulse uniquement, avoirs et doublons certains déduits. Toutes boutiques : non filtrable par site.">Total facturé HT</div>' +
      '<div class="mv" id="m-total-fac">—</div>' +
      '<div class="ms" id="m-fac-sub">Achats facturés · via Bridge</div>' +
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
    if (etat === 'erreur') { mv.textContent = '—'; sub.textContent = 'Bridge non joignable'; det.title = d || ''; det.innerHTML = '<div style="margin-top:6px;font-size:11px;color:var(--tx3)">' + String(d || '').replace(/</g, '&lt;') + '</div>'; return; }
    mv.textContent = eur(d.total);
    sub.textContent = 'Du ' + jour(d.start) + ' au ' + jour(d.end);
    det.innerHTML = '<div style="border-top:1px solid var(--bor);margin-top:10px;padding-top:6px;text-align:left">' +
      ligne('#1f3a5f', 'LAB', eur(d.lab || 0)) +
      ligne('#c8a96e', 'RÉSEAU', eur(d.reseau || 0)) +
      '<div style="margin-top:8px;font-size:11px;color:var(--tx3);line-height:1.4">Source : ' + (d.source || 'Pennylane via Bridge') +
      (d.factures != null ? '<br>' + d.factures + ' factures · avoirs ' + eur(d.avoirs || 0) + (d.doublons ? ' · doublons −' + eur(d.doublons) : '') : '') +
      (d.maj ? '<br>Donnée du ' + horodatage(d.maj) : '') + '</div></div>';
  }

  function rafraichir() {
    if (!tuile()) return;
    var p = null;
    try { if (typeof window.getPeriodDates === 'function') p = window.getPeriodDates(); } catch (x) { p = null; }
    var s = el('date-start'), e = el('date-end');
    var debut = (p && p.startDate) || (s && s.value), fin = (p && p.endDate) || (e && e.value);
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

/* Alignement : les montants des tuiles sont tous à la même hauteur (titre en haut, montant juste dessous), quel que soit le détail affiché en dessous. */
(function () {
  var st = document.createElement('style');
  st.textContent = '#metrics-row > .metric{justify-content:flex-start !important}';
  document.head.appendChild(st);
})();

/* Source et dernière actualisation sous « Total commandé HT » et « Total HT reçu », comme sur « Total facturé HT ».
   L'horodatage est celui du dernier chargement Inpulse affiché dans le bandeau (#clast). */
(function () {
  function el(id) { return document.getElementById(id); }
  function horodatage() {
    var t = (el('clast') && el('clast').textContent) || '';
    var m = t.match(/(\d{2})\/(\d{2})\/(\d{2,4})\s*à\s*(\d{1,2}:\d{2})/);
    if (!m) return '';
    var an = m[3].length === 2 ? '20' + m[3] : m[3];
    return m[1] + '/' + m[2] + '/' + an + ' à ' + m[4];
  }
  function note(tuileId, noteId, source) {
    var x = el(tuileId);
    var t = x && x.closest('.metric');
    if (!t) return;
    var n = el(noteId);
    if (!n) {
      n = document.createElement('div');
      n.id = noteId;
      n.style.cssText = 'margin-top:8px;font-size:11px;color:var(--tx3);line-height:1.4;text-align:left';
      t.appendChild(n);
    } else if (n.parentNode !== t || n !== t.lastElementChild) {
      t.appendChild(n);
    }
    var h = horodatage();
    var html = 'Source : ' + source + (h ? '<br>Donnée du ' + h : '');
    if (n.innerHTML !== html) n.innerHTML = html;
  }
  function maj() {
    note('m-total', 'm-src-cmd', 'Inpulse · bons de commande (date de commande)');
    note('m-total-recv', 'm-src-recv', 'Inpulse · réceptions (date de livraison)');
  }
  var minut = null;
  function planifier() { clearTimeout(minut); minut = setTimeout(maj, 300); }
  function demarrer() {
    var obs = new MutationObserver(planifier);
    var r = el('metrics-row'); if (r) obs.observe(r, { childList: true, subtree: true, characterData: true });
    var c = el('clast'); if (c) obs.observe(c, { childList: true, subtree: true, characterData: true });
    planifier();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
