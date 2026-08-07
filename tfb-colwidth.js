/* TFB - Pilotage achats : largeurs de colonnes figees (tfb-colwidth.js)
 * ---------------------------------------------------------------------
 * Chaque tableau passe en "table-layout:fixed". La largeur de chaque colonne
 * est mesuree UNE FOIS sur le jeu de donnees complet puis verrouillee via un
 * <colgroup>. Resultat : taper dans un filtre de colonne (loupe), trier ou
 * masquer des lignes ne deplace plus les colonnes.
 * Les largeurs sont uniquement recalculees si le tableau recoit PLUS de lignes
 * qu'auparavant (nouvelles donnees) ou si la fenetre est redimensionnee.
 * Script partage par toutes les pages de l'app (aucune config a faire).
 */
(function () {
  'use strict';
  if (window.__tfbColWidth) return;
  window.__tfbColWidth = true;

  var FILTER_ROW = /(^|\s)(cf-row|colfilt|colf-row|filter-row)(\s|$)/;
  var MIN_COL = 28;
  var PAD = 2; /* marge anti "..." reservee aux tableaux a defilement horizontal */
  var store = Object.create(null);
  var lastVW = window.innerWidth;
  var timer = null;

  function injectCss() {
    if (document.getElementById('tfb-colwidth-css')) return;
    var s = document.createElement('style');
    s.id = 'tfb-colwidth-css';
    s.textContent =
      'table.tfb-fixed{table-layout:fixed}' +
      'table.tfb-fixed>thead>tr>th{overflow:hidden;text-overflow:ellipsis}' +
      'table.tfb-fixed>tbody>tr>td{overflow:hidden;text-overflow:ellipsis}' +
      'table.tfb-fixed>tbody>tr>td[colspan]{overflow:visible}' +
      'table.tfb-fixed>thead>tr>th[colspan]{overflow:visible}';
    (document.head || document.documentElement).appendChild(s);
  }

  /* Premiere ligne d'en-tete "reelle" (on ignore la ligne des filtres) */
  function headerRow(t) {
    if (!t.tHead) return null;
    var rows = t.tHead.rows;
    for (var i = 0; i < rows.length; i++) {
      if (!FILTER_ROW.test(rows[i].className || '')) return rows[i];
    }
    return null;
  }

  /* On ne touche pas aux tableaux imbriques (lignes de detail) */
  function isNested(t) {
    for (var p = t.parentNode; p && p.nodeType === 1; p = p.parentNode) {
      if (p.tagName === 'TABLE') return true;
    }
    return false;
  }

  function hasColspan(tr) {
    for (var i = 0; i < tr.cells.length; i++) if (tr.cells[i].colSpan > 1) return true;
    return false;
  }

  function rowCount(t) {
    var n = 0;
    for (var i = 0; i < t.tBodies.length; i++) n += t.tBodies[i].rows.length;
    return n;
  }

  function sum(w) {
    var s = 0, i;
    for (i = 0; i < w.length; i++) s += w[i];
    return s;
  }

  function keyOf(t, hr) {
    var l = [];
    for (var i = 0; i < hr.cells.length; i++) l.push((hr.cells[i].textContent || '').trim());
    return (t.id || t.className || 'tbl') + '#' + hr.cells.length + '#' + l.join('~');
  }

  function currentWidths(t) {
    var cg = t.querySelector('colgroup[data-tfb]');
    if (!cg) return null;
    var w = [], i;
    for (i = 0; i < cg.children.length; i++) w.push(parseFloat(cg.children[i].style.width) || 0);
    return w;
  }

  function sameWidths(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 0.6) return false;
    return true;
  }

  function unlock(t) {
    var cg = t.querySelector('colgroup[data-tfb]');
    if (cg && cg.parentNode) cg.parentNode.removeChild(cg);
    t.classList.remove('tfb-fixed');
    t.style.width = '';
    t.style.minWidth = '';
    void t.offsetWidth; /* force le recalcul en mode auto */
  }

  function measure(hr) {
    var w = [], i, x;
    for (i = 0; i < hr.cells.length; i++) {
      x = hr.cells[i].getBoundingClientRect().width;
      w.push(Math.max(MIN_COL, Math.ceil(x)));
    }
    return w;
  }

  /* Les largeurs mesurees sont arrondies vers le haut (Math.ceil) et la barre de
     defilement verticale peut apparaitre apres la mesure : la somme des colonnes
     depasse alors le conteneur de quelques pixels, ce qui fait surgir une barre de
     defilement horizontale inutile. On rend ce surplus a la colonne la plus large,
     un pixel a la fois, pour ne jamais ecraser une petite colonne. */
  function trimToFit(w, avail) {
    if (!avail || !w.length) return w;
    var over = Math.round(sum(w) - avail), guard = 0, i, bi, bv;
    while (over > 0 && guard++ < 600) {
      bi = -1; bv = MIN_COL;
      for (i = 0; i < w.length; i++) if (w[i] > bv) { bv = w[i]; bi = i; }
      if (bi < 0) break;
      w[bi] -= 1;
      over -= 1;
    }
    return w;
  }

  /* Verification apres coup : si le conteneur defile encore horizontalement de
     quelques pixels, on absorbe l'ecart et on reverrouille. */
  function fitAfterLock(t, rec) {
    var p = t.parentNode;
    if (!p || !rec || !rec.fit || !rec.w.length) return;
    var over = p.scrollWidth - p.clientWidth;
    if (over <= 0 || over > 60) return;
    rec.w = trimToFit(rec.w.slice(), sum(rec.w) - over);
    lock(t, rec.w, true);
  }

  function lock(t, w, fit) {
    var cg = t.querySelector('colgroup[data-tfb]'), i, col;
    if (!cg) {
      cg = document.createElement('colgroup');
      cg.setAttribute('data-tfb', '1');
      t.insertBefore(cg, t.firstChild);
    }
    while (cg.children.length > w.length) cg.removeChild(cg.lastChild);
    for (i = 0; i < w.length; i++) {
      col = cg.children[i];
      if (!col) { col = document.createElement('col'); cg.appendChild(col); }
      col.style.width = w[i] + 'px';
    }
    t.classList.add('tfb-fixed');
    if (fit) {
      /* le tableau tenait dans son conteneur : on reste a 100% (pas de debordement) */
      t.style.width = '100%';
      t.style.minWidth = '';
    } else {
      /* tableau plus large que son conteneur : on conserve le defilement horizontal */
      t.style.width = Math.round(sum(w)) + 'px';
      t.style.minWidth = '100%';
    }
  }

  function process(t) {
    var hr = headerRow(t);
    if (!hr || !hr.cells.length) return;
    if (isNested(t) || hasColspan(hr)) return;
    if (!t.getClientRects().length) return; /* onglet masque : on attendra */

    var k = keyOf(t, hr);
    var n = rowCount(t);
    var rec = store[k];

    if (!rec || n > rec.n) {
      unlock(t);
      var nat = measure(hr);
      if (!sum(nat)) return;
      var natW = t.getBoundingClientRect().width;
      var avail = t.parentNode && t.parentNode.clientWidth ? t.parentNode.clientWidth : 0;
      var fit = !(avail && natW > avail + 2);
      var w = nat, i;
      if (!fit) { w = []; for (i = 0; i < nat.length; i++) w.push(nat[i] + PAD); }
      else { w = trimToFit(nat.slice(), avail); }
      store[k] = rec = { w: w, n: n, fit: fit };
    } else if (t.classList.contains('tfb-fixed') && sameWidths(currentWidths(t), rec.w)) {
      fitAfterLock(t, rec);
      return; /* deja verrouille : rien a faire */
    }
    lock(t, rec.w, rec.fit);
    fitAfterLock(t, rec);
  }

  function run() {
    injectCss();
    var ts = document.getElementsByTagName('table');
    for (var i = 0; i < ts.length; i++) {
      try { process(ts[i]); } catch (e) { /* ignore */ }
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; run(); }, 80);
  }

  if (window.MutationObserver) {
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  }

  window.addEventListener('resize', function () {
    if (Math.abs(window.innerWidth - lastVW) < 2) return;
    lastVW = window.innerWidth;
    store = Object.create(null);
    var ts = document.getElementsByTagName('table');
    for (var i = 0; i < ts.length; i++) { try { unlock(ts[i]); } catch (e) {} }
    schedule();
  });

  /* changement d'onglet / de vue : les tableaux masques deviennent mesurables */
  document.addEventListener('click', schedule, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule);
  else schedule();
  setTimeout(schedule, 600);
  setTimeout(schedule, 2000);
})();
