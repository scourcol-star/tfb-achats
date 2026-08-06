/* TFB - Inventaires : sous-page "Recap mensuel" (4e onglet)
 * ---------------------------------------------------------------------------
 * Ajoute l'onglet "Recap mensuel" a droite de "Par site" dans la barre
 * d'onglets de la page Inventaires. Il affiche un tableau croise
 * BOUTIQUE x MOIS du Total HT, en ne retenant QUE les inventaires qui ont une
 * "Categorie manuelle" renseignee (le mois choisi dans la colonne du meme nom,
 * blob serveur "mcat"). Les inventaires manuels sont inclus.
 *
 * Mise a jour automatique :
 *   - recalcul a chaque rendu du panneau (filtres site/groupe/periode,
 *     recherche, rechargement des donnees, tri) ;
 *   - recalcul immediat des qu'une categorie manuelle est modifiee ;
 *   - resynchronisation du blob "mcat" toutes les 60 s et au retour sur
 *     l'onglet du navigateur.
 *
 * Un clic sur un montant mensuel d'une boutique deroule, sous le tableau, la
 * liste des inventaires qui composent ce montant (date, reference, total HT,
 * statut). Re-clic ou croix pour refermer.
 *
 * Ce module ne stocke rien : tout est derive de S.filtered, S.manualF et de
 * window.__mcGet(). Aucune modification du reste de la page n'est necessaire.
 */
(function () {
  'use strict';
  if (window.__tfbRecapMensuel) return;
  window.__tfbRecapMensuel = true;

  var TAB = 'recap';
  var LABEL = 'R\u00e9cap mensuel';
  var MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
                'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

  /* ---------- utilitaires ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function eur(n) {
    try { if (typeof fmtEur2 === 'function') return fmtEur2(n); } catch (e) {}
    return (Math.round((n || 0) * 100) / 100)
      .toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20ac';
  }
  function gclass(g) {
    try { if (typeof groupClass === 'function') return groupClass(g); } catch (e) {}
    return '';
  }
  function car(st, k) {
    try { if (typeof carat === 'function') return carat(st, k); } catch (e) {}
    return '<span class="car">' + (st.k === k ? (st.d > 0 ? '\u25b2' : '\u25bc') : '\u2195') + '</span>';
  }
  function mcat(id) {
    try { return (window.__mcGet ? window.__mcGet(id) : '') || ''; } catch (e) { return ''; }
  }
  /* "juillet 2026" -> 24319 (tri chronologique). null si libelle non reconnu. */
  function rank(label) {
    var m = String(label || '').toLowerCase().match(/^\s*(\S+)\s+(\d{4})\s*$/);
    if (!m) return null;
    var noAcc = m[1].normalize ? m[1].normalize('NFD').replace(/[\u0300-\u036f]/g, '') : m[1];
    var i = MONTHS.indexOf(noAcc);
    return i < 0 ? null : (+m[2]) * 12 + i;
  }
  function plural(n, s) { return n > 1 ? s + 's' : s; }

  /* S est declare avec "const" dans la page : visible en portee lexicale mais
     PAS via window. On y accede donc par identifiant nu, sous garde typeof. */
  function ST() {
    try { return (typeof S !== 'undefined' && S) ? S : null; } catch (e) { return null; }
  }

  function state() {
    var s = ST();
    if (!s) return { k: 'site', d: 1 };
    s.sort = s.sort || {};
    if (!s.sort.recap) s.sort.recap = { k: 'site', d: 1 };
    if (s.sort.recap.k === 'total') s.sort.recap = { k: 'site', d: 1 };
    return s.sort.recap;
  }

  /* ---------- agregation ---------- */
  function build() {
    var src = [];
    var s0 = ST();
    if (s0) { try { src = (s0.manualF || []).concat(s0.filtered || []); } catch (e) {} }

    var monthsMap = {}, sitesMap = {}, order = [], kept = 0, i, r, mo, site, s, v;
    for (i = 0; i < src.length; i++) {
      r = src[i];
      if (!r) continue;
      mo = mcat(r.id);
      if (!mo) continue;                 /* <- seuls les inventaires categorises */
      kept++;
      site = r.site || '\u2014';
      v = +r.total || 0;
      if (!monthsMap[mo]) monthsMap[mo] = { label: mo, rank: rank(mo), total: 0, n: 0 };
      s = sitesMap[site];
      if (!s) {
        s = sitesMap[site] = { site: site, group: r.group || '', v: {}, c: {}, det: {}, total: 0, n: 0 };
        order.push(site);
      }
      if (!s.group && r.group) s.group = r.group;
      s.v[mo] = (s.v[mo] || 0) + v;
      s.c[mo] = (s.c[mo] || 0) + 1;
      (s.det[mo] = s.det[mo] || []).push(r);
      s.total += v; s.n++;
      monthsMap[mo].total += v; monthsMap[mo].n++;
    }

    var months = Object.keys(monthsMap).map(function (k) { return monthsMap[k]; });
    months.sort(function (a, b) {
      if (a.rank == null && b.rank == null) return String(a.label).localeCompare(String(b.label), 'fr');
      if (a.rank == null) return 1;
      if (b.rank == null) return -1;
      return a.rank - b.rank;
    });
    return {
      rows: order.map(function (k) { return sitesMap[k]; }),
      months: months,
      kept: kept
    };
  }

  function sortRows(rows, st) {
    var d = st.d || 1, k = st.k || 'site';
    var byName = function (a, b) { return String(a.site).localeCompare(String(b.site), 'fr'); };
    return rows.slice().sort(function (a, b) {
      if (k === 'site') return byName(a, b) * d;
      if (k === 'group') return (String(a.group).localeCompare(String(b.group), 'fr') * d) || byName(a, b);
      var x, y;
      if (k === 'total') { x = a.total; y = b.total; }
      else if (k === 'n') { x = a.n; y = b.n; }
      else if (k.indexOf('m:') === 0) { x = a.v[k.slice(2)] || 0; y = b.v[k.slice(2)] || 0; }
      else return byName(a, b) * d;
      return ((x - y) * d) || byName(a, b);
    });
  }

  /* ---------- rendu ---------- */
  function render() {
    var panel = document.getElementById('panel');
    if (!panel) return;
    var d = build(), st = state();

    try {
      if (typeof __sh === 'function') {
        __sh('sh-title').textContent = 'R\u00e9cap mensuel par boutique';
        __sh('sh-sub').textContent = d.kept
          ? d.kept + ' ' + plural(d.kept, 'inventaire') + ' ' + plural(d.kept, 'cat\u00e9goris\u00e9')
            + ' \u00b7 ' + d.months.length + ' mois \u00b7 ' + d.rows.length + ' ' + plural(d.rows.length, 'boutique')
          : 'aucun inventaire avec cat\u00e9gorie manuelle';
      }
    } catch (e) {}

    if (!d.kept) {
      panel.innerHTML = '<div class="empty">Aucun inventaire avec une cat\u00e9gorie manuelle pour ce filtre.'
        + '<br><span style="opacity:.65">Renseignez la colonne \u00ab Cat\u00e9gorie manuelle \u00bb dans l\'onglet Inventaires.</span></div>';
      return;
    }

    var cols = [['site', 'Boutique'], ['group', 'Groupe']];
    d.months.forEach(function (m) { cols.push(['m:' + m.label, m.label]); });
    cols.push(['n', 'Nb inv.']);

    var th = cols.map(function (c) {
      var num = (c[0] === 'n' || c[0].indexOf('m:') === 0);
      return '<th class="' + (st.k === c[0] ? 's' : '') + (num ? ' num' : '')
        + '" data-k="' + esc(c[0]) + '">'
        + esc(c[1]) + ' ' + car(st, c[0]) + '</th>';
    }).join('');

    var body = sortRows(d.rows, st).map(function (r) {
      var tds = '<td><strong>' + esc(r.site) + '</strong></td>'
        + '<td><span class="pill ' + gclass(r.group) + '">' + esc(r.group) + '</span></td>';
      d.months.forEach(function (m) {
        var c = r.c[m.label] || 0;
        if (!c) { tds += '<td class="num rc-0">\u2014</td>'; return; }
        tds += '<td class="num rc-clic" data-rcsite="' + esc(r.site) + '"'
          + ' data-rcmonth="' + esc(m.label) + '"'
          + ' title="Voir les ' + c + ' ' + plural(c, 'inventaire') + '">'
          + eur(r.v[m.label] || 0) + '</td>';
      });
      tds += '<td class="num">' + r.n + '</td>';
      return '<tr>' + tds + '</tr>';
    }).join('');

    var gn = 0;
    d.months.forEach(function (m) { gn += m.n; });
    var foot = '<tr><td><strong>Toutes boutiques</strong></td><td></td>';
    d.months.forEach(function (m) {
      foot += '<td class="num"><strong>' + eur(m.total) + '</strong></td>';
    });
    foot += '<td class="num"><strong>' + gn + '</strong></td></tr>';

    panel.innerHTML = '<div class="tw"><table class="rc-table"><thead><tr>' + th
      + '</tr></thead><tbody>' + body + '</tbody><tfoot>' + foot + '</tfoot></table></div>'
      + '<div id="rc-drawer"></div>';

    var hs = panel.querySelectorAll('thead tr:first-child th');
    for (var i = 0; i < hs.length; i++) {
      (function (t) {
        t.onclick = function () {
          var k = t.getAttribute('data-k');
          if (!k) return;
          if (st.k === k) st.d = -(st.d || 1);
          else { st.k = k; st.d = (k === 'site' || k === 'group') ? 1 : -1; }
          render();
        };
      })(hs[i]);
    }
    drawDrawer();
  }

  /* ---------- tiroir de detail (clic sur un montant mensuel) ---------- */
  var OPEN = null;   /* 'boutique\u0000mois' actuellement deroule, ou null */

  function fdate(s) {
    try { if (typeof fmtDate === 'function') return fmtDate(s); } catch (e) {}
    return esc(s);
  }

  function detailHtml(site, month, rows) {
    var sum = 0, i;
    for (i = 0; i < rows.length; i++) sum += (+rows[i].total || 0);
    var list = rows.slice().sort(function (a, b) {
      return (new Date(b.date)).getTime() - (new Date(a.date)).getTime();
    });
    var body = list.map(function (r) {
      var ref = r.manual
        ? '<span class="pill-man">Manuel</span> ' + esc(r.label || '')
        : esc(r.ref || '\u2014');
      return '<tr><td>' + fdate(r.date) + '</td>'
        + '<td>' + ref + '</td>'
        + '<td class="num">' + eur(+r.total || 0) + '</td>'
        + '<td>' + (r.validated
            ? '<span class="ok-y">Valid\u00e9</span>'
            : '<span class="ok-n">En cours</span>') + '</td></tr>';
    }).join('');
    return '<div class="rc-dr">'
      + '<div class="rc-dr-h"><strong>' + esc(site) + '</strong> \u00b7 ' + esc(month)
      + ' <span class="rc-dr-n">' + rows.length + ' ' + plural(rows.length, 'inventaire')
      + ' \u00b7 ' + eur(sum) + '</span>'
      + '<button type="button" class="rc-dr-x" title="Fermer">\u2715</button></div>'
      + '<div class="tw"><table><thead><tr><th>Date</th><th>R\u00e9f\u00e9rence</th>'
      + '<th class="num">Total HT</th><th>Statut</th></tr></thead>'
      + '<tbody>' + body + '</tbody></table></div></div>';
  }

  /* (re)dessine le tiroir et met a jour la cellule active */
  function drawDrawer() {
    var box = document.getElementById('rc-drawer');
    if (!box) return;
    var cells = document.querySelectorAll('#panel td.rc-clic'), i;
    for (i = 0; i < cells.length; i++) {
      cells[i].classList.toggle('rc-on', OPEN !== null && OPEN ===
        cells[i].getAttribute('data-rcsite') + '\u0000' + cells[i].getAttribute('data-rcmonth'));
    }
    if (!OPEN) { box.innerHTML = ''; return; }
    var p = OPEN.split('\u0000'), d = build(), row = null;
    for (i = 0; i < d.rows.length; i++) if (d.rows[i].site === p[0]) row = d.rows[i];
    var list = (row && row.det[p[1]]) ? row.det[p[1]] : [];
    if (!list.length) { OPEN = null; box.innerHTML = ''; return; }
    box.innerHTML = detailHtml(p[0], p[1], list);
  }

  function closeDrawer() { OPEN = null; drawDrawer(); }

  document.addEventListener('click', function (e) {
    var s = ST();
    if (!(s && s.tab === TAB)) return;
    if (!(e.target && e.target.closest)) return;
    if (e.target.closest('#panel .rc-dr-x')) { closeDrawer(); return; }
    var td = e.target.closest('#panel td.rc-clic');
    if (!td) return;
    var key = td.getAttribute('data-rcsite') + '\u0000' + td.getAttribute('data-rcmonth');
    if (OPEN === key) { closeDrawer(); return; }
    OPEN = key;
    drawDrawer();
    try { document.getElementById('rc-drawer').scrollIntoView({ block: 'nearest' }); } catch (e2) {}
  });

  /* ---------- styles ---------- */
  function injectCss() {
    if (document.getElementById('tfb-recap-css')) return;
    var s = document.createElement('style');
    s.id = 'tfb-recap-css';
    var TINT = 'linear-gradient(rgba(217,119,6,.09),rgba(217,119,6,.09))';
    s.textContent = [
      '#panel table.rc-table td.rc-0{color:var(--tx3);opacity:.6}',
      '#panel table.rc-table tfoot td{position:sticky;bottom:0;z-index:1;background-color:var(--sur);',
      'border-top:1px solid var(--bor);border-bottom:0;font-variant-numeric:tabular-nums}',
      /* montants mensuels cliquables */
      '#panel table.rc-table td.rc-clic{cursor:pointer;text-decoration:underline dotted rgba(217,119,6,.6);',
      'text-underline-offset:3px;text-decoration-thickness:1.5px}',
      '#panel table.rc-table td.rc-clic:hover{color:var(--amber);background-image:' + TINT + '}',
      '#panel table.rc-table td.rc-clic.rc-on{color:var(--amber);font-weight:600;background-image:' + TINT + '}',
      /* tiroir de detail sous le tableau */
      '#panel .rc-dr{margin-top:14px;border:1px solid var(--bor);border-radius:var(--rs);overflow:hidden}',
      '#panel .rc-dr-h{display:flex;align-items:center;gap:10px;padding:9px 12px;',
      'background:var(--sur2);border-bottom:1px solid var(--bor);font-size:13px}',
      '#panel .rc-dr-n{color:var(--tx3);font-size:12px}',
      '#panel .rc-dr-x{margin-left:auto;border:0;background:transparent;color:var(--tx3);',
      'cursor:pointer;font-size:13px;line-height:1;padding:3px 6px}',
      '#panel .rc-dr-x:hover{color:var(--red)}',
      '#panel .rc-dr .tw{max-height:320px}',
      '#panel .rc-dr table th{cursor:default}',
      '#panel table.rc-table thead tr.colfilt input.colf:not([data-k="site"]):not([data-k="group"]){visibility:hidden}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ---------- onglet ---------- */
  function ensureTab() {
    var bar = document.getElementById('tabs');
    if (!bar) return false;
    if (bar.querySelector('.tab[data-t="' + TAB + '"]')) return true;
    var el = document.createElement('div');
    el.className = 'tab';
    el.setAttribute('data-t', TAB);
    el.textContent = LABEL;
    el.title = 'R\u00e9cap mensuel par boutique \u2014 uniquement les inventaires ayant une cat\u00e9gorie manuelle';
    var after = bar.querySelector('.tab[data-t="sites"]');
    if (after && after.parentNode === bar) bar.insertBefore(el, after.nextSibling);
    else bar.appendChild(el);
    return true;
  }

  /* Le clic est deja gere par le listener delegue de #tabs (S.tab = data-t). */
  var origRenderPanel = window.renderPanel;
  window.renderPanel = function () {
    ensureTab();
    var s = ST();
    if (s && s.tab === TAB) {
      try { render(); } catch (e) { if (window.console) console.error('[recap mensuel]', e); }
      return;
    }
    if (typeof origRenderPanel === 'function') return origRenderPanel.apply(this, arguments);
  };

  /* ---------- mise a jour automatique ---------- */
  function refreshIfActive() {
    var s = ST();
    if (s && s.tab === TAB) { try { render(); } catch (e) {} }
  }
  function autoSync() {
    if (document.hidden) return;
    var s = ST();
    if (!(s && s.tab === TAB)) return;
    if (typeof window.__mcPull === 'function') {
      try { window.__mcPull().then(refreshIfActive, refreshIfActive); return; } catch (e) {}
    }
    refreshIfActive();
  }
  /* une categorie manuelle vient d'etre changee -> recap a jour */
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains('mc-sel')) setTimeout(refreshIfActive, 0);
  }, true);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) autoSync(); });
  setInterval(autoSync, 60000);

  /* ---------- init ---------- */
  var tries = 0;
  function init() {
    injectCss();
    if (!ensureTab() && tries++ < 40) { setTimeout(init, 250); return; }
    refreshIfActive();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
