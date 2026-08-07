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
 * Un clic sur un montant mensuel deroule, JUSTE SOUS la ligne de la boutique,
 * la liste des inventaires qui composent ce montant (date, reference, total HT),
 * avec leur total repris au-dessus de la colonne Total HT. Re-clic ou croix
 * pour refermer.
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
  /* difference vs la periode precedente, affichee en italique */
  function dlt(cur, prev) {
    var v = (+cur || 0) - (+prev || 0);
    var cls = v > 0 ? 'rc-up' : (v < 0 ? 'rc-dn' : 'rc-eq');
    var sg = v > 0 ? '+' : (v < 0 ? '\u2212' : '\u00b1');
    return ' <i class="rc-d ' + cls + '" title="\u00c9cart vs la p\u00e9riode pr\u00e9c\u00e9dente">'
      + sg + eur(Math.abs(v)) + '</i>';
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
  /* "2026-07-31" -> "juillet 2026" : repli pour les inventaires manuels
     qui n'ont pas encore de categorie manuelle renseignee. */
  function monthOf(d) {
    var s = String(d || ''), m = /^(\d{4})-(\d{2})/.exec(s), y, mi;
    if (m) { y = m[1]; mi = (+m[2]) - 1; }
    else {
      var dt = new Date(s);
      if (!s || isNaN(dt.getTime())) return '';
      y = dt.getFullYear(); mi = dt.getMonth();
    }
    if (mi < 0 || mi > 11) return '';
    return MONTHS[mi] + ' ' + y;
  }

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
    if (s.sort.recap.k === 'total' || s.sort.recap.k === 'n') s.sort.recap = { k: 'site', d: 1 };
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
      if (!mo && r.manual) mo = monthOf(r.date);   /* <- inventaires manuels toujours repris */
      if (!mo) continue;                 /* <- seuls les inventaires categorises */
      kept++;
      site = r.site || '\u2014';
      v = +r.total || 0;
      if (!monthsMap[mo]) monthsMap[mo] = { label: mo, rank: rank(mo), total: 0, n: 0 };
      s = sitesMap[site];
      if (!s) {
        s = sitesMap[site] = { site: site, group: r.group || '', v: {}, c: {},
          mv: {}, mc: {}, det: {}, total: 0, n: 0 };
        order.push(site);
      }
      if (!s.group && r.group) s.group = r.group;
      s.v[mo] = (s.v[mo] || 0) + v;
      s.c[mo] = (s.c[mo] || 0) + 1;
      if (r.manual) {
        s.mv[mo] = (s.mv[mo] || 0) + v;
        s.mc[mo] = (s.mc[mo] || 0) + 1;
      }
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
    d.months.forEach(function (m, mi) { cols.push(['m:' + m.label, m.label, mi > 0]); });
    cols.push(['', '']);            /* colonne tampon : absorbe la place restante */
    NCOLS = cols.length;

    /* cellule mensuelle : caret | montant | ecart, en sous-colonnes alignees.
       Le 1er mois n'a pas d'ecart possible : pas de sous-colonne d'ecart. */
    function cellHtml(val, dl, withD, mk) {
      return '<span class="rc-cell"><span class="rc-k">' + (mk || '') + '</span>'
        + '<span class="rc-v">' + val + '</span>'
        + (withD ? '<span class="rc-dw">' + (dl || '') + '</span>' : '')
        + '</span>';
    }

    var th = cols.map(function (c) {
      if (!c[0]) return '<th class="rc-sp"></th>';
      var num = (c[0].indexOf('m:') === 0);
      var lab = esc(c[1]) + ' ' + car(st, c[0]);
      if (num) lab = cellHtml(lab, '', c[2]);
      return '<th class="' + (st.k === c[0] ? 's' : '') + (num ? ' num' : '')
        + '" data-k="' + esc(c[0]) + '">' + lab + '</th>';
    }).join('');

    var body = sortRows(d.rows, st).map(function (r) {
      var tds = '<td class="rc-site"><strong>' + esc(r.site) + '</strong></td>'
        + '<td><span class="pill ' + gclass(r.group) + '">' + esc(r.group) + '</span></td>';
      d.months.forEach(function (m, mi) {
        var c = r.c[m.label] || 0;
        if (!c) { tds += '<td class="num rc-0">' + cellHtml('\u2014', '', mi > 0) + '</td>'; return; }
        var pv = mi > 0 ? d.months[mi - 1].label : null;
        var cmp = (pv !== null && (r.c[pv] || 0) > 0);
        var mc = r.mc ? (r.mc[m.label] || 0) : 0;
        var mv = r.mv ? (r.mv[m.label] || 0) : 0;
        var tip = 'Voir les ' + c + ' ' + plural(c, 'inventaire');
        if (mc) tip += ' \u2014 dont ' + mc + ' ' + plural(mc, 'manuel') + ' : ' + eur(mv);
        tds += '<td class="num rc-clic' + (mc ? ' rc-man' : '') + '"'
          + ' data-rcsite="' + esc(r.site) + '"'
          + ' data-rcmonth="' + esc(m.label) + '"'
          + ' title="' + esc(tip) + '">'
          + cellHtml(eur(r.v[m.label] || 0), cmp ? dlt(r.v[m.label] || 0, r.v[pv] || 0) : '', mi > 0,
              mc ? 'M' : '')
          + '</td>';
      });
      return '<tr data-rcrow="' + esc(r.site) + '">' + tds + '<td class="rc-sp"></td></tr>';
    }).join('');

    var foot = '<tr><td class="rc-site"><strong>Toutes boutiques</strong></td><td></td>';
    d.months.forEach(function (m, mi) {
      foot += '<td class="num">'
        + cellHtml('<strong>' + eur(m.total) + '</strong>',
                   mi > 0 ? dlt(m.total, d.months[mi - 1].total) : '', mi > 0)
        + '</td>';
    });
    foot += '<td class="rc-sp"></td></tr>';

    panel.innerHTML = '<div class="tw"><table class="rc-table"><thead><tr>' + th
      + '</tr></thead><tbody>' + body + '</tbody><tfoot>' + foot + '</tfoot></table></div>';

    var hs = panel.querySelectorAll('table.rc-table > thead > tr:first-child > th');
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
  var NCOLS = 0;   /* nb de colonnes du tableau (colspan du tiroir) */

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
      var tip = r.manual ? ('Manuel \u00b7 ' + (r.label || '')) : (r.ref || '');
      var ref = r.manual
        ? '<span class="pill-man">Manuel</span> ' + esc(r.label || '')
        : esc(r.ref || '\u2014');
      return '<tr><td class="rc-dt-d">' + fdate(r.date) + '</td>'
        + '<td class="rc-dt-r" title="' + esc(tip) + '">' + ref + '</td>'
        + '<td class="num rc-dt-n">' + eur(+r.total || 0) + '</td></tr>';
    }).join('');
    return '<div class="rc-dr">'
      + '<div class="rc-dr-h">'
      + '<span class="rc-dr-t"><strong>' + esc(site) + '</strong> \u00b7 ' + esc(month) + '</span>'
      + '<button type="button" class="rc-dr-x" title="Fermer">\u2715</button></div>'
      + '<div class="rc-dt-wrap"><table class="rc-dt"><tbody>'
      + '<tr class="rc-sum"><th class="rc-dt-d"></th><th class="rc-dt-r"></th>'
      + '<th class="num rc-dt-n">' + eur(sum) + '</th></tr>'
      + '<tr class="rc-hd"><th class="rc-dt-d">Date</th>'
      + '<th class="rc-dt-r">R\u00e9f\u00e9rence</th>'
      + '<th class="num rc-dt-n">Total HT</th></tr>'
      + body + '</tbody></table></div></div>';
  }

  /* (re)dessine le tiroir JUSTE SOUS la ligne de la boutique concernee */
  function drawDrawer() {
    var panel = document.getElementById('panel');
    if (!panel) return;
    var old = panel.querySelector('tr.rc-dr-row');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var cells = panel.querySelectorAll('td.rc-clic'), i;
    for (i = 0; i < cells.length; i++) {
      cells[i].classList.toggle('rc-on', OPEN !== null && OPEN ===
        cells[i].getAttribute('data-rcsite') + '\u0000' + cells[i].getAttribute('data-rcmonth'));
    }
    if (!OPEN) return;
    var p = OPEN.split('\u0000'), d = build(), row = null;
    for (i = 0; i < d.rows.length; i++) if (d.rows[i].site === p[0]) row = d.rows[i];
    var list = (row && row.det[p[1]]) ? row.det[p[1]] : [];
    var host = panel.querySelector('tbody tr[data-rcrow="' + cssEsc(p[0]) + '"]');
    if (!list.length || !host) { OPEN = null; return; }
    var tr = document.createElement('tr');
    tr.className = 'rc-dr-row';
    tr.innerHTML = '<td colspan="' + NCOLS + '">' + detailHtml(p[0], p[1], list) + '</td>';
    if (host.nextSibling) host.parentNode.insertBefore(tr, host.nextSibling);
    else host.parentNode.appendChild(tr);
    syncDetRow();
    alignDrawer();
    if (window.requestAnimationFrame) requestAnimationFrame(alignDrawer);
    setTimeout(alignDrawer, 90);
    setTimeout(alignDrawer, 280);
  }

  /* le tiroir suit la visibilite de sa ligne (filtres de colonne) */
  function syncDetRow() {
    var panel = document.getElementById('panel');
    if (!panel) return;
    var tr = panel.querySelector('tr.rc-dr-row');
    if (!tr) return;
    var host = tr.previousElementSibling;
    tr.style.display = (host && host.style.display === 'none') ? 'none' : '';
  }

  /* aligne la colonne des montants du tiroir exactement sous le montant
     de la colonne du mois cliquee (voir capture utilisateur) */
  function alignDrawer() {
    var panel = document.getElementById('panel');
    if (!panel) return;
    var dr = panel.querySelector('tr.rc-dr-row .rc-dr');
    var cell = panel.querySelector('td.rc-clic.rc-on');
    if (!dr || !cell) return;
    var v = cell.querySelector('.rc-v');
    var wrap = dr.querySelector('.rc-dt-wrap');
    if (!v || !wrap) return;
    var wr = wrap.getBoundingClientRect(), vr = v.getBoundingClientRect();
    var avail = wrap.clientWidth;
    if (!avail || !vr.width) return;
    /* bord droit du contenu du tableau = bord droit du cadre moins la bordure */
    var pad = Math.round(wr.right - 1 - vr.right);
    var max = avail - 96 - 110 - 14 - 110;
    if (pad > max) pad = max;
    if (pad < 14) pad = 14;
    dr.style.setProperty('--rc-pr', pad + 'px');
    dr.style.setProperty('--rc-nw', (pad + 124) + 'px');
  }

  var rzT = null;
  window.addEventListener('resize', function () {
    if (rzT) clearTimeout(rzT);
    rzT = setTimeout(alignDrawer, 120);
  });

  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  function closeDrawer() { OPEN = null; drawDrawer(); }

  document.addEventListener('click', function (e) {
    var s = ST();
    if (!(s && s.tab === TAB)) return;
    if (!(e.target && e.target.closest)) return;
    if (e.target.closest('#panel .rc-dr-x')) { closeDrawer(); return; }
    if (e.target.closest('#panel tr.rc-dr-row')) return;
    var td = e.target.closest('#panel td.rc-clic');
    if (!td) return;
    var key = td.getAttribute('data-rcsite') + '\u0000' + td.getAttribute('data-rcmonth');
    if (OPEN === key) { closeDrawer(); return; }
    OPEN = key;
    drawDrawer();
    try {
      var dr = document.querySelector('#panel tr.rc-dr-row');
      if (dr) dr.scrollIntoView({ block: 'nearest' });
    } catch (e2) {}
  });

  /* les filtres de colonne masquent des lignes : on realigne le tiroir */
  document.addEventListener('input', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('colf')) {
      setTimeout(syncDetRow, 0);
    }
  }, true);

  /* ---------- styles ---------- */
  function injectCss() {
    if (document.getElementById('tfb-recap-css')) return;
    var s = document.createElement('style');
    s.id = 'tfb-recap-css';
    var TINT = 'linear-gradient(rgba(217,119,6,.09),rgba(217,119,6,.09))';
    s.textContent = [
      /* ---- mise en colonnes ---- */
      '#panel table.rc-table>tbody>tr>td.rc-site{white-space:nowrap}',
      '#panel table.rc-table .rc-sp{width:9999px;padding:0 !important}',
      '#panel table.rc-table>tbody>tr>td.rc-0{color:var(--tx3);opacity:.55}',
      /* sous-colonnes alignees : caret | montant | ecart */
      '#panel table.rc-table .rc-cell{display:inline-flex;align-items:baseline;',
      'justify-content:flex-end;gap:10px}',
      '#panel table.rc-table .rc-k{flex:0 0 11px;width:11px;font-size:9px;line-height:1;',
      'color:var(--amber);text-align:left}',
      '#panel table.rc-table .rc-v{flex:0 0 auto;text-align:right;font-variant-numeric:tabular-nums}',
      '#panel table.rc-table .rc-dw{flex:0 0 80px;width:80px;text-align:right}',
      /* ecart vs la periode precedente, en italique */
      '#panel table.rc-table .rc-d{font-style:italic;font-weight:400;font-size:11px;',
      'white-space:nowrap;letter-spacing:0;text-transform:none}',
      '#panel table.rc-table .rc-d.rc-up{color:var(--green)}',
      '#panel table.rc-table .rc-d.rc-dn{color:var(--red)}',
      '#panel table.rc-table .rc-d.rc-eq{color:var(--tx3)}',
      /* pied de tableau colle en bas */
      '#panel table.rc-table>tfoot>tr>td{position:sticky;bottom:0;z-index:1;',
      'background-color:var(--sur);border-top:1px solid var(--bor);border-bottom:0}',
      /* montants mensuels cliquables */
      '#panel table.rc-table td.rc-clic{cursor:pointer}',
      '#panel table.rc-table td.rc-clic .rc-v{text-decoration:underline dotted rgba(217,119,6,.6);',
      'text-underline-offset:3px;text-decoration-thickness:1.5px}',
      '#panel table.rc-table td.rc-clic:hover .rc-v{color:var(--amber)}',
      '#panel table.rc-table td.rc-clic.rc-on{background-image:' + TINT + '}',
      '#panel table.rc-table td.rc-clic.rc-on .rc-v{color:var(--amber);font-weight:600}',
      '#panel table.rc-table td.rc-clic.rc-on .rc-k{font-size:0}',
      '#panel table.rc-table td.rc-clic.rc-on .rc-k::before{content:"\\25bc";font-size:9px}',
      /* marqueur M : le montant du mois contient au moins un inventaire manuel */
      '#panel table.rc-table td.rc-man .rc-k{font-weight:700}',
      /* ---- tiroir insere juste sous la ligne de la boutique ---- */
      '#panel table.rc-table>tbody>tr.rc-dr-row>td{padding:0 !important;white-space:normal;',
      'background:var(--gbg);border-bottom:1px solid var(--bor)}',
      '#panel .rc-dr{padding:2px 14px 12px 30px}',
      '#panel .rc-dr-h{display:flex;align-items:center;gap:10px;padding:8px 0 7px;',
      'font-size:12px;color:var(--tx2)}',
      '#panel .rc-dr-t strong{color:var(--tx);font-size:13px}',
      '#panel .rc-dr-x{margin-left:auto;border:0;background:transparent;color:var(--tx3);',
      'cursor:pointer;font-size:13px;line-height:1;padding:3px 7px;border-radius:6px}',
      '#panel .rc-dr-x:hover{color:var(--red);background:var(--sur2)}',
      '#panel .rc-dt-wrap{max-height:264px;overflow:auto;background:var(--sur);',
      'border:1px solid var(--bor);border-radius:var(--rs)}',
      '#panel table.rc-dt{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}',
      '#panel table.rc-dt th{background:var(--sur);padding:5px 14px !important;',
      'font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--tx3);',
      'border-bottom:1px solid var(--bor);cursor:default}',
      '#panel table.rc-dt td{padding:5px 14px !important;border-bottom:1px solid var(--bor);',
      'white-space:nowrap}',
      '#panel table.rc-dt tbody tr:last-child td{border-bottom:0}',
      '#panel table.rc-dt tbody tr:hover td{background:var(--gbg)}',
      '#panel table.rc-dt .rc-dt-d{width:96px;color:var(--tx2)}',
      '#panel table.rc-dt .rc-dt-n{width:var(--rc-nw,150px);font-variant-numeric:tabular-nums}',
'#panel table.rc-dt .rc-dt-r{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
/* la colonne des montants du tiroir est alignee sur la colonne du mois cliquee */
'#panel table.rc-dt th.num,#panel table.rc-dt td.num'
  + '{padding-right:var(--rc-pr,14px) !important}',
      /* total des inventaires deroules, juste au-dessus de Total HT */
      '#panel table.rc-dt tr.rc-hd th{position:sticky;top:0;z-index:1}',
      '#panel table.rc-dt tr.rc-sum th{border-bottom:0;padding-bottom:0 !important;',
      'text-transform:none;letter-spacing:0;font-size:14px;font-weight:700;color:var(--tx)}',
      /* filtres de colonne : uniquement Boutique et Groupe */
      '#panel table.rc-table thead tr.colfilt input.colf:not([data-k="site"]):not([data-k="group"])',
      '{visibility:hidden}'
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
