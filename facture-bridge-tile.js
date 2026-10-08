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
  function planifier() { clearTimeout(minut); minut = setTimeout(maj, 350); }
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
    fetch('/api/sheet').then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.byCodeMonth) { ventesData = j; planifier(); } })
      .catch(function (e) { console.warn('ventes', e); ventesCharge = false; });
  }

  function filtres() {
    var site = (el('f-site') || {}).value || 'all', src = (el('f-src') || {}).value || 'all', q = (el('f-q') || {}).value || '';
    var fourn = !!(S.fournSel && S.fournSel.size);
    return { site: site, groupe: S.group, fourn: fourn || src !== 'all' || !!q, tout: S.group === 'all' && site === 'all' };
  }
  function ventes(mois) {
    if (!ventesData) return null;
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
  function planifier() { clearTimeout(minut); minut = setTimeout(mise, 400); }
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
  function planifier() { clearTimeout(minut); minut = setTimeout(poser, 300); }
  function demarrer() {
    var r = document.getElementById('metrics-row');
    if (r) new MutationObserver(planifier).observe(r, { childList: true });
    planifier();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
