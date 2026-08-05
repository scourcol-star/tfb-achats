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

  function measure(t, hr) {
    var w = [], i, x;
    for (i = 0; i < hr.cells.length; i++) {
      x = hr.cells[i].getBoundingClientRect().width;
      w.push(Math.max(MIN_COL, Math.round(x * 10) / 10));
    }
    return w;
  }

  function lock(t, w) {
    var cg = t.querySelector('colgroup[data-tfb]'), i, col, total = 0;
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
      total += w[i];
    }
    t.classList.add('tfb-fixed');
    t.style.width = Math.round(total) + 'px';
    t.style.minWidth = '100%';
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
      var w = measure(t, hr);
      var total = 0, i;
      for (i = 0; i < w.length; i++) total += w[i];
      if (!total) return;
      store[k] = rec = { w: w, n: n };
    } else if (t.classList.contains('tfb-fixed') && sameWidths(currentWidths(t), rec.w)) {
      return; /* deja verrouille : rien a faire */
    }
    lock(t, rec.w);
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
