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
      '<div class="ml" title="Balance générale Pennylane, entités LAB + RÉSEAU, comptes 601, 6022, 6026, 607, 6061000009, 6062000003 (hors 6013), net = débit − crédit, avoirs et RFA déduits. Même chiffre que le Contrôle comptable du Bridge. Toutes boutiques : non filtrable par site.">Total facturé HT</div>' +
      '<div class="mv" id="m-total-fac">—</div>' +
      '<div class="ms" id="m-fac-sub">Balance comptable Pennylane</div>' +
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
    if (etat === 'charge') { mv.textContent = '…'; sub.textContent = 'Lecture de Pennylane…'; det.innerHTML = ''; return; }
    if (etat === 'erreur') { mv.textContent = '—'; sub.textContent = 'Pennylane non joignable'; det.title = d || ''; det.innerHTML = '<div style="margin-top:6px;font-size:11px;color:var(--tx3)">' + String(d || '').replace(/</g, '&lt;') + '</div>'; return; }
    mv.textContent = eur(d.total);
    sub.textContent = 'Balance du ' + jour(d.start) + ' au ' + jour(d.end);
    det.innerHTML = '<div class="rc-lines">' +
      '<div class="rc-lb"><i style="background:#1f3a5f"></i>LAB</div><div class="rc-v">' + eur(d.lab || 0) + '</div>' +
      '<div class="rc-lb"><i style="background:#c8a96e"></i>RÉSEAU</div><div class="rc-v">' + eur(d.reseau || 0) + '</div></div>';
    var t = tuile(), f = el('m-src-fac');
    if (!f) { f = document.createElement('div'); f.id = 'm-src-fac'; f.className = 'tfb-foot'; }
    if (f.parentNode !== t || f !== t.lastElementChild) t.appendChild(f);
    f.innerHTML = 'Source : ' + (d.source || 'Pennylane') + (d.maj ? '<br>Donnée du ' + horodatage(d.maj) : '');
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
    var memo = null; try { memo = JSON.parse(localStorage.getItem('tfb-fac-' + cle) || 'null'); } catch (x) {}
    if (memo && memo.ok) afficher('ok', memo); else afficher('charge');
    fetch('/api/facture-bridge?start=' + encodeURIComponent(debut) + '&end=' + encodeURIComponent(fin))
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); })
      .then(function (j) { cache[cle] = j; try { localStorage.setItem('tfb-fac-' + cle, JSON.stringify(j)); } catch (x) {} if (cleCourante === cle) afficher('ok', j); })
      .catch(function (err) { if (cleCourante === cle) { cleCourante = null; afficher('erreur', String(err && err.message || err)); } });
  }

  function planifier() { clearTimeout(minuterie); minuterie = setTimeout(rafraichir, 60); }

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
  function planifier() { clearTimeout(minut); minut = setTimeout(maj, 60); }
  function demarrer() {
    var obs = new MutationObserver(planifier);
    var r = el('metrics-row'); if (r) obs.observe(r, { childList: true, subtree: true, characterData: true });
    var c = el('clast'); if (c) obs.observe(c, { childList: true, subtree: true, characterData: true });
    planifier();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();

/* Logo de la source devant le titre des tuiles : Inpulse pour commandé et reçu, Pennylane pour facturé.
   Icônes officielles des deux sites, servies par le service de favicons de Google. */
(function () {
  var G = 'https://www.google.com/s2/favicons?sz=64&domain=';
  var L = [['m-total', 'inpulse.ai', 'Inpulse'], ['m-total-recv', 'inpulse.ai', 'Inpulse'], ['m-total-fac', 'pennylane.com', 'Pennylane']];
  function poser() {
    L.forEach(function (x) {
      var e = document.getElementById(x[0]);
      var t = e && e.closest('.metric');
      var ml = t && t.querySelector('.ml');
      if (!ml || ml.querySelector('.src-logo')) return;
      var i = document.createElement('img');
      i.className = 'src-logo';
      i.src = G + x[1];
      i.alt = x[2];
      i.title = 'Source : ' + x[2];
      i.style.cssText = 'width:16px;height:16px;border-radius:3px;vertical-align:-3px;margin-right:6px';
      ml.insertBefore(i, ml.firstChild);
    });
  }
  function demarrer() {
    var r = document.getElementById('metrics-row');
    if (r) new MutationObserver(poser).observe(r, { childList: true, subtree: true });
    poser();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();

/* Tuiles du haut, même modèle pour les trois : logo + titre + (i) explicatif, montant, nombre de
   commandes, bloc LAB / RÉSEAU, puis source et heure. LAB = sites labo, RÉSEAU = boutiques
   (pour le facturé : entités comptables Pennylane). */
(function () {
  var INFO = {
    'm-total': "Source : Inpulse, bons de commande.\nCalcul : somme des Total HT (BDC) des commandes passées dans la période (date de commande), filtres groupe, site et fournisseur inclus, hors transferts Chalifert et brouillons.\nLAB = sites labo, RÉSEAU = boutiques.\nÀ noter : en base « date de livraison », le tableau des commandes liste les commandes réceptionnées, un périmètre différent de cette tuile.",
    'm-total-recv': "Source : Inpulse, réceptions.\nCalcul : commandes dont la livraison tombe dans la période (date de livraison), filtres inclus, hors transferts. Montant reçu quand la réception est pointée, sinon montant du bon de commande.\nRéceptionné : réception pointée. Non pointé : date prévue passée, réception jamais saisie. À venir ce mois : livraison prévue d’ici la fin du mois.\nLAB = sites labo, RÉSEAU = boutiques.",
    'm-total-fac': "Source : Pennylane, balance générale, lue en direct.\nCalcul : comptes d’achats 601, 6022, 6026, 607, 6061000009 et 6062000003 (hors 6013), net = débit − crédit, avoirs et RFA déduits, en date comptable. Même chiffre que le Contrôle comptable du Bridge.\nLAB et RÉSEAU = entités comptables. La balance ne contient pas de commandes et ne suit pas les filtres groupe, site ou fournisseur."
  };
  var C_LAB = '#1f3a5f', C_RES = '#c8a96e';

  function el(id) { return document.getElementById(id); }
  function eur(v) { try { return fmtEur(v); } catch (e) { return Math.round(v).toLocaleString('fr-FR') + ' €'; } }
  function nb(n) { return n + ' commande' + (n > 1 ? 's' : ''); }

  var st = document.createElement('style');
  st.textContent =
    '.tfb-i{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;border:1px solid var(--tx3);color:var(--tx3);font:600 9px/1 Inter,system-ui,sans-serif;font-style:normal;margin-left:6px;cursor:help;position:relative;vertical-align:1px;text-transform:none;letter-spacing:0}' +
    '.tfb-i:hover,.tfb-i:focus{color:var(--tx);border-color:var(--tx);outline:none}' +
    '.tfb-i .tfb-pop{display:none;position:absolute;top:20px;left:50%;transform:translateX(-50%);width:300px;background:var(--sur,#fff);color:var(--tx);border:1px solid var(--bor);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.14);padding:10px 12px;font:400 11.5px/1.5 Inter,system-ui,sans-serif;text-align:left;white-space:pre-line;z-index:60;cursor:default}' +
    '.tfb-i:hover .tfb-pop,.tfb-i:focus .tfb-pop{display:block}' +
    '#m-cmd-note{display:none !important}' +
    '#metrics-row .rc-lines{min-width:200px}' +
    '.tfb-foot{margin-top:auto;padding-top:10px;font-size:11px;color:var(--tx3);line-height:1.4;text-align:left}';
  document.head.appendChild(st);

  function info(id) {
    var x = el(id), t = x && x.closest('.metric'), ml = t && t.querySelector('.ml');
    if (!ml || ml.querySelector('.tfb-i')) return;
    var i = document.createElement('span');
    i.className = 'tfb-i'; i.tabIndex = 0; i.setAttribute('aria-label', 'Explications');
    i.innerHTML = 'i<span class="tfb-pop"></span>';
    i.querySelector('.tfb-pop').textContent = INFO[id];
    ml.removeAttribute('title');
    ml.appendChild(i);
  }

  function lignes(rows) {
    return '<div class="rc-lines">' + rows.map(function (r) {
      return '<div class="rc-lb"><i style="background:' + r[0] + '"></i>' + r[1] + (r[2] != null ? '<span class="rc-n">(' + r[2] + ')</span>' : '') + '</div><div class="rc-v">' + eur(r[3]) + '</div>';
    }).join('') + '</div>';
  }

  function bloc(t, id, apres, html) {
    var b = el(id);
    if (!b) { b = document.createElement('div'); b.id = id; b.className = 'tfb-split'; }
    if (apres && b.previousElementSibling !== apres) apres.insertAdjacentElement('afterend', b);
    if (b._h !== html) { b.innerHTML = html; b._h = html; }
    return b;
  }

  function commande() {
    var o = { lab: 0, res: 0, nl: 0, nr: 0 }, p;
    try { p = getPeriodDates(); } catch (e) { return o; }
    if (!p || !p.startDate || !p.endDate) return o;
    var pool = (window.__POOL && window.__POOL.orders && window.__POOL.orders.length) ? window.__POOL.orders : (S.orders || []);
    pool.forEach(function (r) {
      if (!r || r.status === 'DRAFT' || r.isTransfer || !tfbPassesNonDate(r)) return;
      var od = String(r.orderDate || '').slice(0, 10);
      if (!od || od < p.startDate || od > p.endDate) return;
      if (isLaboRow(r)) { o.lab += r.total || 0; o.nl++; } else { o.res += r.total || 0; o.nr++; }
    });
    return o;
  }
  function recu() {
    var o = { lab: 0, res: 0, nl: 0, nr: 0 }, rm = tfbRecvByOrder();
    (S.filtered || []).forEach(function (r) {
      if (r.isTransfer) return;
      var v = tfbMontantRecu(r, rm);
      if (isLaboRow(r)) { o.lab += v; o.nl++; } else { o.res += v; o.nr++; }
    });
    return o;
  }

  function maj() {
    try {
      ['m-total', 'm-total-recv', 'm-total-fac'].forEach(info);
      var tc = el('m-total') && el('m-total').closest('.metric');
      if (tc) {
        var c = commande();
        bloc(tc, 'm-cmd-split', el('m-total-fc') || el('m-cmd-sub'), lignes([[C_LAB, 'LAB', c.nl, c.lab], [C_RES, 'RÉSEAU', c.nr, c.res]]));
      }
      var tr = el('m-total-recv') && el('m-total-recv').closest('.metric');
      if (tr && typeof tfbBasis === 'function' && tfbBasis() === 'reception') {
        var r = recu();
        var n = el('m-recv-n');
        if (!n) { n = document.createElement('div'); n.id = 'm-recv-n'; n.className = 'ms'; }
        if (n.previousElementSibling !== el('m-total-recv')) el('m-total-recv').insertAdjacentElement('afterend', n);
        var txt = nb(r.nl + r.nr);
        if (n.textContent !== txt) n.textContent = txt;
        bloc(tr, 'm-recv-split', el('m-recv-sub'), lignes([[C_LAB, 'LAB', r.nl, r.lab], [C_RES, 'RÉSEAU', r.nr, r.res]]));
      }
      ['m-src-cmd', 'm-src-recv', 'm-src-fac'].forEach(function (id) { var f = el(id); if (f && f.className !== 'tfb-foot') f.className = 'tfb-foot'; });
    } catch (e) { console.warn('tuiles', e); }
  }
  var minut = null;
  function planifier() { clearTimeout(minut); minut = setTimeout(maj, 60); }
  function demarrer() {
    var r = el('metrics-row');
    if (r) new MutationObserver(planifier).observe(r, { childList: true, subtree: true, characterData: true });
    planifier();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();

/* Mise en page des tuiles du haut : les 3 totaux sur toute la largeur, taux de service masqués,
   transferts Chalifert en pastille compacte sous les tuiles, et ligne « FC hors inventaire ».
   FC hors inventaire = montant de la tuile / ventes HT, avec les règles de la page Food Cost :
   CA HT par boutique depuis le Sheet (route /api/sheet), + B2B et événements en vue toutes boutiques,
   labos sans ventes propres. Mois en cours dans la période : mention « prévisionnel ». */
(function () {
  var VERS_SHEET = { BGP: 'BCJ' };
  var ventesData = null, ventesCharge = false;

  function el(id) { return document.getElementById(id); }
  function pct(v) { return (v == null || !isFinite(v)) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %'; }

  var st = document.createElement('style');
  st.textContent =
    '#metrics-row{grid-template-columns:repeat(3,minmax(0,1fr)) !important}' +
    '#metrics-row > .tfb-hide{display:none !important}' +
    '#m-fac-sub:empty{display:none}' +
    '#trf-bar{display:flex;justify-content:flex-end;margin:-6px 0 14px}' +
    '#trf-bar > .metric{display:inline-flex !important;flex-direction:row !important;align-items:center;gap:8px;padding:4px 12px !important;border-radius:999px !important;min-height:0 !important;cursor:pointer}' +
    '#trf-bar > .metric .ml{margin:0 !important;font-size:10px !important}' +
    '#trf-bar > .metric .mv{font-size:13px !important;letter-spacing:0 !important}' +
    '#trf-bar > .metric .ms{font-size:11px !important;margin:0 !important}' +
    '#trf-bar > .metric > *:not(.ml):not(.mv):not(.ms){display:none !important}' +
    '.tfb-fc{display:inline-flex;align-self:center;align-items:center;gap:6px;margin-top:8px;padding:3px 11px;border:1px solid var(--bor);border-radius:999px;background:var(--sur2,#f5f6f8);font-size:11.5px;color:var(--tx2);cursor:help}' +
    '.tfb-fc b{color:var(--tx);font-weight:700;font-variant-numeric:tabular-nums}' +
    '.tfb-fc .tfb-prev{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#b45309;background:#fef3c7;border:1px solid #fde68a;border-radius:4px;padding:0 5px}';
  document.head.appendChild(st);

  function chargerVentes() {
    if (ventesCharge) return; ventesCharge = true;
    try { var m = JSON.parse(localStorage.getItem('tfb-ventes-v1') || 'null'); if (m && m.byCodeMonth) ventesData = m; } catch (x) {}
    fetch('/api/sheet').then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.byCodeMonth) { ventesData = { byCodeMonth: j.byCodeMonth, extraVentes: j.extraVentes, lastDay: j.lastDay, byCodeDay: j.byCodeDay, b2bByDay: j.b2bByDay }; try { localStorage.setItem('tfb-ventes-v1', JSON.stringify(ventesData)); } catch (x) {} planifier(); } })
      .catch(function (e) { console.warn('ventes', e); ventesCharge = false; });
  }

  function filtres() {
    var site = (el('f-site') || {}).value || 'all', src = (el('f-src') || {}).value || 'all', q = (el('f-q') || {}).value || '';
    var fourn = !!(S.fournSel && S.fournSel.size);
    return { site: site, groupe: S.group, fourn: fourn || src !== 'all' || !!q, tout: S.group === 'all' && site === 'all' };
  }
  function ventes(mois) {
    if (!ventesData) return null;
    if (window.__tfbCA) { var rc = window.__tfbCA(ventesData); return rc ? rc.total : null; }
    var f = filtres(), codes;
    if (f.site !== 'all') codes = [f.site];
    else { try { codes = perimeterSites().map(function (s) { return s.code; }); } catch (e) { codes = Object.keys(ventesData.byCodeMonth); } }
    var v = 0;
    codes.forEach(function (c) {
      var o = ventesData.byCodeMonth[VERS_SHEET[c] || c]; if (!o) return;
      mois.forEach(function (m) { v += +o[m] || 0; });
    });
    if (f.tout) mois.forEach(function (m) { var e = (ventesData.extraVentes || {})[m]; if (e) v += (+e.b2b || 0) + (+e.evenement || 0); });
    return v;
  }
  function montant(id) {
    var t = (el(id) || {}).textContent || '';
    var n = parseFloat(t.replace(/[^\d,-]/g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  function pastille(tuileId, apresId, fac) {
    var x = el(tuileId), t = x && x.closest('.metric'); if (!t) return;
    var b = el(tuileId + '-fc');
    if (!b) { b = document.createElement('div'); b.id = tuileId + '-fc'; b.className = 'tfb-fc'; }
    var apres = el(apresId) || x;
    if (b.previousElementSibling !== apres) apres.insertAdjacentElement('afterend', b);
    var mois = []; try { mois = periodMonthKeys(); } catch (e) {}
    var cur = new Date(); var cle = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0');
    var prev = mois.indexOf(cle) >= 0;
    var f = filtres(), v = ventes(mois), a = montant(tuileId), fc = null, aide;
    if (fac && !f.tout) aide = 'Non calculé : la balance comptable ne suit pas les filtres groupe ou boutique.';
    else if (f.fourn) aide = 'Non calculé avec un filtre fournisseur.';
    else if (v == null) aide = 'Chargement des ventes…';
    else if (!(v > 0)) aide = 'Pas de ventes HT sur la période.';
    else { fc = a / v * 100; aide = 'FC hors inventaire = ' + Math.round(a).toLocaleString('fr-FR') + ' € / ' + Math.round(v).toLocaleString('fr-FR') + ' € de ventes HT. Ventes : mêmes règles que la page Food Cost (CA HT du Sheet' + (f.tout ? ', + B2B et événements' : '') + '), sans variation de stock.' + (prev ? ' Mois en cours : ventes et achats encore incomplets, chiffre prévisionnel.' : ''); }
    var html = 'FC hors inventaire <b>' + pct(fc) + '</b>' + (prev && fc != null ? '<span class="tfb-prev">prévisionnel</span>' : '');
    if (b._h !== html) { b.innerHTML = html; b._h = html; }
    if (b.title !== aide) b.title = aide;
  }

  function mise() {
    try {
      var row = el('metrics-row'); if (!row) return;
      [].slice.call(row.children).forEach(function (c) {
        var ml = c.querySelector('.ml'), txt = ml ? ml.textContent.toLowerCase() : '';
        if (txt.indexOf('taux de service') >= 0 && !c.classList.contains('tfb-hide')) c.classList.add('tfb-hide');
      });
      var trf = el('m-trf-tile');
      if (trf) {
        var bar = el('trf-bar');
        if (!bar) { bar = document.createElement('div'); bar.id = 'trf-bar'; }
        if (bar.previousElementSibling !== row) row.insertAdjacentElement('afterend', bar);
        if (trf.parentNode !== bar) bar.appendChild(trf);
      }
      var fs = el('m-fac-sub'); if (fs && fs.textContent && /^Balance du /.test(fs.textContent)) fs.textContent = '';
      chargerVentes();
      pastille('m-total', 'm-cmd-sub', false);
      pastille('m-total-recv', 'm-recv-n', false);
      pastille('m-total-fac', 'm-fac-sub', true);
    } catch (e) { console.warn('mise en page tuiles', e); }
  }
  var minut = null;
  function planifier() { clearTimeout(minut); minut = setTimeout(mise, 60); }
  function demarrer() {
    var r = el('metrics-row');
    if (r) new MutationObserver(planifier).observe(r, { childList: true, subtree: true, characterData: true });
    planifier();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();

/* Disposition en deux colonnes alignées d'une tuile à l'autre :
   à gauche titre, montant, nombre de commandes, bloc LAB / RÉSEAU (et détail par statut du reçu) ;
   à droite la pastille FC hors inventaire (à hauteur du montant) et, en bas, la source et l'heure.
   Lignes de grille identiques dans les trois tuiles : les mêmes données tombent à la même hauteur. */
(function () {
  var st = document.createElement('style');
  st.textContent =
    '#metrics-row > .tfb-tile{display:grid !important;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:auto auto auto auto auto 1fr;column-gap:18px;row-gap:0;text-align:left;align-items:start}' +
    '.tfb-tile > *{grid-column:1}' +
    '.tfb-tile > .ml{grid-row:1}' +
    '.tfb-tile > .mv{grid-row:2}' +
    '.tfb-tile > #m-cmd-sub,.tfb-tile > #m-recv-n,.tfb-tile > #m-fac-sub{grid-row:3;display:block !important;min-height:18px}' +
    '.tfb-tile > #m-recv-sub:empty{display:none !important}' +
    '.tfb-tile > .tfb-split,.tfb-tile > #m-fac-detail{grid-row:4}' +
    '.tfb-tile > #m-recv-detail{grid-row:5}' +
    '.tfb-tile > .tfb-fc{grid-column:2;grid-row:1 / span 3;align-self:center;justify-self:end;margin-top:0}' +
    '.tfb-tile > .tfb-foot{grid-column:2;grid-row:4 / span 3;align-self:end;justify-self:end;text-align:right;margin:0;padding:0 0 2px}' +
    '.tfb-tile .rc-lines{min-width:220px}';
  document.head.appendChild(st);
  function poser() {
    ['m-total', 'm-total-recv', 'm-total-fac'].forEach(function (id) {
      var e = document.getElementById(id), t = e && e.closest('.metric');
      if (t && !t.classList.contains('tfb-tile')) t.classList.add('tfb-tile');
    });
  }
  var minut = null;
  function planifier() { clearTimeout(minut); minut = setTimeout(poser, 60); }
  function demarrer() {
    var r = document.getElementById('metrics-row');
    if (r) new MutationObserver(planifier).observe(r, { childList: true });
    planifier();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();

/* FC hors inventaire en grand dans la colonne de droite : libellé au-dessus, valeur en gros. */
(function () {
  var st = document.createElement('style');
  st.textContent =
    '.tfb-tile > .tfb-fc{flex-direction:column;align-items:flex-end;gap:3px;padding:8px 14px;border-radius:10px;font-size:11px}' +
    '.tfb-tile > .tfb-fc b{font-size:24px;line-height:1.1;letter-spacing:-.3px}' +
    '.tfb-tile > .tfb-fc .tfb-prev{margin-top:1px}';
  document.head.appendChild(st);
})();

/* Affichage d'un seul coup : la ligne de tuiles reste masquée (place réservée) tant que tout n'est pas
   prêt — données Inpulse, balance Pennylane, ventes pour le FC, blocs LAB / RÉSEAU, mise en colonnes,
   pastille des transferts — puis apparaît directement dans son état final. Garde-fou : 8 s maximum.
   Le masquage initial est posé dans le <head> de la page (style #tfb-gate) pour éviter tout flash. */
(function () {
  var t0 = Date.now();
  function el(id) { return document.getElementById(id); }
  function rempli(id, mauvais) { var e = el(id); if (!e) return false; var t = (e.textContent || '').trim(); return !!t && mauvais.indexOf(t) < 0; }
  function pret() {
    if (!el('metrics-row')) return true;
    if (!rempli('m-total', ['—', '…'])) return false;
    if (!rempli('m-total-recv', ['—', '…'])) return false;
    /* Pennylane et les ventes (Sheet) ne bloquent pas l'affichage : leurs valeurs arrivent ensuite, à place fixe. */
    if (!el('m-cmd-split')) return false;
    if (document.querySelectorAll('.tfb-tile').length < 3) return false;
    if (!el('m-total-fac') || !el('m-total-recv-fc')) return false;
    if (el('m-trf-tile') && !document.querySelector('#trf-bar #m-trf-tile')) return false;
    return true;
  }
  function montrer() {
    ['metrics-row', 'trf-bar'].forEach(function (id) { var e = el(id); if (e) e.classList.add('tfb-pret'); });
    var g = el('tfb-gate'); if (g) g.textContent = '#trf-bar:not(.tfb-pret){visibility:hidden}';
  }
  (function boucle() {
    if (pret() || Date.now() - t0 > 8000) { setTimeout(montrer, 30); return; }
    setTimeout(boucle, 50);
  })();
})();

/* Trois colonnes par tuile : 1) achats (montant, commandes, LAB / RÉSEAU, source), 2) CA HT de la même
   période et du même périmètre (ventes boutiques, B2B, événements, sources), 3) FC hors inventaire.
   CA : mêmes règles que la page Food Cost (ventes boutiques du Sheet DATA DAILY ; B2B lu dans la base de
   l'app B2B ; événements du suivi mensuel ; B2B et événements seulement en vue toutes boutiques). */
(function () {
  var VERS_SHEET = { BGP: 'BCJ' };
  function el(id) { return document.getElementById(id); }
  function eur(v) { try { return fmtEur(v); } catch (e) { return Math.round(v).toLocaleString('fr-FR') + ' €'; } }
  function jour(iso) { var p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
  var st = document.createElement('style');
  st.textContent =
    '#metrics-row > .tfb-tile{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) minmax(0,.75fr) !important;column-gap:16px !important}' +
    '.tfb-tile > .tfb-ca{grid-column:2 !important;grid-row:1 / span 6 !important;display:flex;flex-direction:column;align-self:stretch;border-left:1px solid var(--bor);padding-left:16px;min-width:0}' +
    '.tfb-ca .tfb-ca-t{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--tx3);margin-bottom:8px;line-height:16px}' +
    '.tfb-ca .tfb-ca-v{font-size:22px;font-weight:600;color:var(--tx);letter-spacing:-.5px;font-variant-numeric:tabular-nums}' +
    '.tfb-ca .tfb-ca-s{font-size:12px;color:var(--tx3);margin-top:3px;min-height:18px}' +
    '.tfb-ca .rc-lines{min-width:0 !important}' +
    '.tfb-ca .tfb-foot{margin-top:auto;padding-top:10px;text-align:left}' +
    '.tfb-tile > .tfb-fc{grid-column:3 !important;grid-row:1 / span 6 !important;align-self:center !important;justify-self:center !important}' +
    '.tfb-tile > .tfb-foot{grid-column:1 !important;grid-row:6 !important;justify-self:start !important;align-self:end !important;text-align:left !important}' +
    '.tfb-tile > .tfb-split .rc-lines{min-width:0 !important}';
  document.head.appendChild(st);
  function lire() { try { return JSON.parse(localStorage.getItem('tfb-ventes-v1') || 'null'); } catch (e) { return null; } }
  function ca() {
    var d = lire(); if (!d || !d.byCodeMonth) return null;
    if (window.__tfbCA) return window.__tfbCA(d);
    var mois = []; try { mois = periodMonthKeys(); } catch (e) {}
    var site = (el('f-site') || {}).value || 'all', tout = S.group === 'all' && site === 'all', codes;
    if (site !== 'all') codes = [site]; else { try { codes = perimeterSites().map(function (s) { return s.code; }); } catch (e) { codes = Object.keys(d.byCodeMonth); } }
    codes = codes.filter(function (c) { return d.byCodeMonth[VERS_SHEET[c] || c]; });
    var btq = 0, b2b = 0, ev = 0;
    codes.forEach(function (c) { var o = d.byCodeMonth[VERS_SHEET[c] || c]; mois.forEach(function (m) { btq += +o[m] || 0; }); });
    if (tout) mois.forEach(function (m) { var e = (d.extraVentes || {})[m]; if (e) { b2b += +e.b2b || 0; ev += +e.evenement || 0; } });
    return { btq: btq, b2b: b2b, ev: ev, total: btq + b2b + ev, tout: tout, n: codes.length, lastDay: d.lastDay };
  }
  function li(c, lb, v) { return '<div class="rc-lb"><i style="background:' + c + '"></i>' + lb + '</div><div class="rc-v">' + eur(v) + '</div>'; }
  function bloc(id) {
    var x = el(id), t = x && x.closest('.metric'); if (!t) return;
    var b = el(id + '-ca');
    if (!b) { b = document.createElement('div'); b.id = id + '-ca'; b.className = 'tfb-ca'; }
    if (b.parentNode !== t) t.appendChild(b);
    var c = ca(), html;
    if (!c) html = '<div class="tfb-ca-t">CA HT</div><div class="tfb-ca-v">…</div>';
    else html = '<div class="tfb-ca-t">CA HT</div><div class="tfb-ca-v">' + eur(c.total) + '</div>' +
      '<div class="tfb-ca-s">' + c.n + ' boutique' + (c.n > 1 ? 's' : '') + '</div>' +
      '<div class="rc-lines">' + li('#c8a96e', 'Ventes boutiques', c.btq) + (c.tout ? li('#2563eb', 'B2B', c.b2b) + li('#8b5cf6', 'Événement', c.ev) : '') + '</div>' +
      '<div class="tfb-foot">Source : ventes boutiques · Sheet DATA DAILY' + (c.lastDay ? ' (jusqu’au ' + jour(c.lastDay) + ')' : '') +
      (c.tout ? '<br>B2B · app B2B · Événement · suivi mensuel' : '<br>B2B et événements : vue toutes boutiques uniquement') + (c.prorata ? '<br>Période partielle : événements (et B2B antérieur à sept. 2026) au prorata des jours' : '') + '</div>';
    if (b._h !== html) { b.innerHTML = html; b._h = html; }
  }
  function maj() { ['m-total', 'm-total-recv', 'm-total-fac'].forEach(bloc); }
  var minut = null;
  function planifier() { clearTimeout(minut); minut = setTimeout(maj, 60); }
  function demarrer() {
    var r = el('metrics-row'); if (r) new MutationObserver(planifier).observe(r, { childList: true, subtree: true, characterData: true });
    planifier();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();

/* CA HT de la période exacte, partagé par la colonne CA et le FC des tuiles. Mois complets : montants
   mensuels (comme la page Food Cost). Mois partiels (7 derniers jours, dates libres…) : ventes boutiques et
   B2B jour par jour ; événements, et B2B avant septembre 2026 (historique mensuel), au prorata des jours. */
(function () {
  var VERS_SHEET = { BGP: 'BCJ' };
  function pad(n) { return String(n).padStart(2, '0'); }
  function jours(a, b) { var out = [], d = new Date(a + 'T00:00:00Z'), f = new Date(b + 'T00:00:00Z'); while (d <= f) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } return out; }
  window.__tfbCA = function (d) {
    if (!d || !d.byCodeMonth) return null;
    var p; try { p = getPeriodDates(); } catch (e) { return null; }
    if (!p || !p.startDate || !p.endDate) return null;
    var s = p.startDate, e = p.endDate;
    var site = (document.getElementById('f-site') || {}).value || 'all', tout = S.group === 'all' && site === 'all', codes;
    if (site !== 'all') codes = [site]; else { try { codes = perimeterSites().map(function (x) { return x.code; }); } catch (x) { codes = Object.keys(d.byCodeMonth); } }
    codes = codes.filter(function (c) { return d.byCodeMonth[VERS_SHEET[c] || c]; });
    var btq = 0, b2b = 0, ev = 0, prorata = false;
    var y = +s.slice(0, 4), m = +s.slice(5, 7);
    for (var i = 0; i < 240; i++) {
      var mo = y + '-' + pad(m), der = new Date(Date.UTC(y, m, 0)).getUTCDate();
      var deb = mo + '-01', fin = mo + '-' + pad(der);
      if (deb > e) break;
      var a = s > deb ? s : deb, b = e < fin ? e : fin, complet = (a === deb && b === fin);
      var ratio = complet ? 1 : jours(a, b).length / der, lesJours = complet ? null : jours(a, b);
      codes.forEach(function (c) {
        var k = VERS_SHEET[c] || c;
        if (complet || !d.byCodeDay) { btq += (+((d.byCodeMonth[k] || {})[mo]) || 0) * ratio; if (!complet) prorata = true; }
        else lesJours.forEach(function (j) { btq += +((d.byCodeDay[j] || {})[k]) || 0; });
      });
      if (tout) {
        var ex = (d.extraVentes || {})[mo] || {};
        if (complet) b2b += +ex.b2b || 0;
        else if (d.b2bByDay && mo >= '2026-09') lesJours.forEach(function (j) { b2b += +d.b2bByDay[j] || 0; });
        else { b2b += (+ex.b2b || 0) * ratio; if (+ex.b2b) prorata = true; }
        ev += (+ex.evenement || 0) * ratio; if (!complet && +ex.evenement) prorata = true;
      }
      m++; if (m > 12) { m = 1; y++; }
    }
    return { btq: btq, b2b: b2b, ev: ev, total: btq + b2b + ev, tout: tout, n: codes.length, lastDay: d.lastDay, prorata: prorata };
  };
})();

/* Sélecteur de période : raccourcis (7 derniers jours, mois, trimestres, depuis janvier, 12 derniers mois,
   année précédente), choix d'un mois par année, et dates « du / au ». Il pilote le sélecteur d'origine
   (#f-period, #date-start, #date-end), masqué, puis relance le chargement de l'app : aucun calcul ne change. */
(function () {
  var CLE = 'tfb:periode-bar';
  var MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  var annee = null;
  function el(id) { return document.getElementById(id); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function finMois(y, m) { return new Date(y, m + 1, 0); }
  function presets() {
    var t = new Date(), y = t.getFullYear(), m = t.getMonth(), q = Math.floor(m / 3) * 3;
    var j7 = new Date(t); j7.setDate(t.getDate() - 6);
    var a12 = new Date(t); a12.setFullYear(y - 1); a12.setDate(a12.getDate() + 1);
    return [
      { k: '7j', l: '7 derniers jours', s: iso(j7), e: iso(t) },
      { k: 'mc', l: 'Mois en cours', s: iso(new Date(y, m, 1)), e: iso(finMois(y, m)) },
      { k: 'mp', l: 'Mois précédent', s: iso(new Date(y, m - 1, 1)), e: iso(finMois(y, m - 1)) },
      { k: 'tc', l: 'Trimestre en cours', s: iso(new Date(y, q, 1)), e: iso(finMois(y, q + 2)) },
      { k: 'tp', l: 'Trimestre précédent', s: iso(new Date(y, q - 3, 1)), e: iso(finMois(y, q - 1)) },
      { k: 'ytd', l: 'Depuis janvier', s: y + '-01-01', e: iso(t) },
      { k: '12m', l: '12 derniers mois', s: iso(a12), e: iso(t) },
      { k: 'ap', l: 'Année précédente', s: (y - 1) + '-01-01', e: (y - 1) + '-12-31' }
    ];
  }
  function moisRange(y, m) { return { k: 'm-' + y + '-' + pad(m + 1), s: iso(new Date(y, m, 1)), e: iso(finMois(y, m)) }; }
  function courant() { try { var p = getPeriodDates(); return { s: p.startDate, e: p.endDate }; } catch (x) { return { s: '', e: '' }; } }
  function appliquer(r, enregistrer) {
    var sel = el('f-period'), ds = el('date-start'), de = el('date-end');
    if (!sel || !ds || !de) return;
    var ok = r.k && [].some.call(sel.options, function (o) { return o.value === r.k; });
    if (ok) sel.value = r.k; else { sel.value = 'custom'; ds.value = r.s; de.value = r.e; }
    if (enregistrer !== false) { try { localStorage.setItem(CLE, JSON.stringify({ k: r.k || '', s: r.s, e: r.e })); } catch (x) {} }
    annee = +r.s.slice(0, 4);
    rendre();
    try { if (typeof reloadWithPeriod === 'function') reloadWithPeriod(); } catch (x) { console.warn('periode', x); }
  }
  var st = document.createElement('style');
  st.textContent =
    '#f-period, #custom-dates{display:none !important}' +
    '#periode-bar{flex:0 0 100%;width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;margin:0 0 14px;padding:10px 14px;background:var(--sur);border:1px solid var(--bor);border-radius:var(--r,10px)}' +
    '#periode-bar .pb-l{display:flex;align-items:center;gap:6px;flex-wrap:wrap}' +
    '#periode-bar .pb-t{font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--tx3);width:62px;flex:0 0 62px}' +
    '#periode-bar button{font:500 12.5px/1 Inter,system-ui,sans-serif;padding:7px 11px;border:1px solid var(--bor);border-radius:7px;background:var(--sur);color:var(--tx);cursor:pointer}' +
    '#periode-bar button:hover:not(:disabled):not(.on){background:var(--sur2,#f5f6f8)}' +
    '#periode-bar button.on{background:#2f4759;border-color:#2f4759;color:#fff}' +
    '#periode-bar button:disabled{color:var(--tx3);opacity:.5;cursor:default}' +
    '#periode-bar .pb-an{font-weight:700;font-size:13px;min-width:38px;text-align:center}' +
    '#periode-bar .pb-nav{padding:7px 9px}' +
    '#periode-bar .pb-sep{flex:1}' +
    '#periode-bar label{font-size:10.5px;font-weight:600;letter-spacing:.06em;color:var(--tx3);margin:0 4px 0 6px}' +
    '#periode-bar input[type=date]{font:500 12.5px Inter,system-ui,sans-serif;padding:5px 8px;border:1px solid var(--bor);border-radius:7px;background:var(--sur);color:var(--tx)}';
  document.head.appendChild(st);
  function rendre() {
    var bar = el('periode-bar'); if (!bar) return;
    var c = courant(), t = new Date(), aujMois = t.getFullYear() * 12 + t.getMonth();
    if (annee == null) annee = +(c.s || iso(t)).slice(0, 4);
    var h = '<div class="pb-l"><span class="pb-t">Période</span>';
    presets().forEach(function (p) { h += '<button type="button" data-p="' + p.k + '" class="' + (p.s === c.s && p.e === c.e ? 'on' : '') + '">' + p.l + '</button>'; });
    h += '</div><div class="pb-l"><span class="pb-t">Mois</span>' +
      '<button type="button" class="pb-nav" data-an="-1" title="Année précédente">‹</button><span class="pb-an">' + annee + '</span>' +
      '<button type="button" class="pb-nav" data-an="1" title="Année suivante"' + (annee >= t.getFullYear() ? ' disabled' : '') + '>›</button>';
    for (var m = 0; m < 12; m++) {
      var r = moisRange(annee, m), fut = annee * 12 + m > aujMois;
      h += '<button type="button" data-m="' + m + '" class="' + (r.s === c.s && r.e === c.e ? 'on' : '') + '"' + (fut ? ' disabled' : '') + '>' + MOIS[m] + '</button>';
    }
    h += '<span class="pb-sep"></span><label for="pb-du">DU</label><input type="date" id="pb-du" value="' + c.s + '"><label for="pb-au">AU</label><input type="date" id="pb-au" value="' + c.e + '"></div>';
    bar.innerHTML = h;
  }
  function installer() {
    var sel = el('f-period'), row = el('metrics-row'); if (!sel || !row) return false;
    if (el('periode-bar')) return true;
    var bar = document.createElement('div'); bar.id = 'periode-bar';
    row.parentNode.insertBefore(bar, row);
    bar.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.p) { var p = presets().filter(function (x) { return x.k === b.dataset.p; })[0]; if (p) appliquer(p); }
      else if (b.dataset.an) { annee += +b.dataset.an; rendre(); }
      else if (b.dataset.m != null) appliquer(moisRange(annee, +b.dataset.m));
    });
    bar.addEventListener('change', function (ev) {
      if (ev.target.id !== 'pb-du' && ev.target.id !== 'pb-au') return;
      var s = el('pb-du').value, e = el('pb-au').value;
      if (s && e && s <= e) appliquer({ k: '', s: s, e: e });
    });
    rendre();
    /* Dernière période choisie : les raccourcis relatifs (mois en cours, 7 jours…) sont recalculés au jour même. */
    try {
      var m = JSON.parse(localStorage.getItem(CLE) || 'null');
      if (m && m.s && m.e) {
        var p = m.k && presets().filter(function (x) { return x.k === m.k; })[0];
        var r = p || { k: m.k, s: m.s, e: m.e }, c = courant();
        if (r.s !== c.s || r.e !== c.e) setTimeout(function () { appliquer(r, false); }, 0);
      }
    } catch (x) {}
    return true;
  }
  if (!installer()) { var n = 0, t = setInterval(function () { if (installer() || ++n > 40) clearInterval(t); }, 250); }
})();
