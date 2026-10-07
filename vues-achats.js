/* Dashboard achats : trois visions sur les graphiques existants.
   Commandé (Inpulse, date de commande) · Reçu ou en livraison (vision actuelle en base « date de livraison »)
   · Facturé HT (Bridge, date de facture). Boutons pour en afficher une, deux ou trois.
   Sans changement de sélection, les graphiques restent exactement ceux d'origine : ce script ne les
   redessine que si une autre vision est ajoutée. */
(function () {
  var CLE = 'tfb-visions-achats';
  var V = {
    cmd: { nom: 'Commandé', lettre: 'C', btq: '#9fb7d6', lab: '#2f6aa8', aide: 'Total HT des bons de commande Inpulse, par date de commande (même calcul que la tuile Total commandé HT).' },
    rec: { nom: 'Reçu ou en livraison', lettre: 'R', btq: '#7f8c99', lab: '#c9a678', aide: 'Total HT reçu, par date de livraison (même calcul que la tuile Total HT reçu).' },
    fac: { nom: 'Facturé HT', lettre: 'F', btq: '#f2b48f', lab: '#d9622b', aide: 'Achats facturés HT du Bridge, par date de facture. Boutiques = entité RÉSEAU, Labo = entité LAB.' }
  };
  var ORDRE = ['cmd', 'rec', 'fac'];
  var factCache = {};
  var origine = null;

  function base() { try { return tfbBasis() === 'reception' ? 'rec' : 'cmd'; } catch (e) { return 'cmd'; } }
  function lireSel() {
    try { var s = JSON.parse(localStorage.getItem(CLE) || 'null'); if (s && s.length) return s.filter(function (k) { return V[k]; }); } catch (e) {}
    return null;
  }
  function sel() { return lireSel() || [base()]; }
  function ecrireSel(s) { try { localStorage.setItem(CLE, JSON.stringify(s)); } catch (e) {} }

  function factIndispo() {
    try {
      var site = document.getElementById('f-site').value, src = document.getElementById('f-src').value;
      var q = (document.getElementById('f-q') || {}).value || '';
      if (S.group !== 'all') return 'Non disponible quand un groupe de boutiques est filtré : les factures ne sont rattachées qu’à LAB ou RÉSEAU.';
      if (site !== 'all') return 'Non disponible par boutique : les factures ne sont rattachées qu’à LAB ou RÉSEAU.';
      if (S.fournSel && S.fournSel.size) return 'Non disponible avec un filtre fournisseur.';
      if (src !== 'all' || q) return 'Non disponible avec ce filtre.';
    } catch (e) {}
    return '';
  }
  function recIndispo() { return base() === 'rec' ? '' : 'Passer la période en « date de livraison » pour afficher le reçu.'; }
  function indispo(k) { return k === 'fac' ? factIndispo() : (k === 'rec' ? recIndispo() : ''); }

  function moisLbl(k) { var p = k.split('-'); return ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'][parseInt(p[1], 10) - 1] + ' ' + p[0].slice(2); }

  function boutons() {
    var lbl = document.getElementById('chart-monthly-label');
    if (!lbl) return;
    var bar = document.getElementById('visions-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'visions-bar';
      bar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0 8px';
      lbl.parentNode.insertBefore(bar, lbl.nextSibling);
      bar.addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-v]'); if (!b || b.disabled) return;
        var k = b.dataset.v, s = sel().slice(), i = s.indexOf(k);
        if (i >= 0) { if (s.length === 1) return; s.splice(i, 1); } else s.push(k);
        s.sort(function (a, c) { return ORDRE.indexOf(a) - ORDRE.indexOf(c); });
        ecrireSel(s);
        try { renderCharts(); } catch (e) { console.warn('visions', e); }
      });
    }
    var s = sel(), h = '<span style="font-size:11px;color:var(--tx3);margin-right:2px">Afficher :</span>';
    ORDRE.forEach(function (k) {
      var on = s.indexOf(k) >= 0, ko = indispo(k);
      h += '<button type="button" data-v="' + k + '"' + (ko ? ' disabled' : '') + ' title="' + (ko || V[k].aide) + '" style="display:inline-flex;align-items:center;gap:6px;font:500 12px Inter,system-ui,sans-serif;padding:4px 11px;border-radius:999px;cursor:' + (ko ? 'not-allowed' : 'pointer') + ';border:1px solid ' + (on && !ko ? V[k].lab : 'var(--bor)') + ';background:' + (on && !ko ? 'var(--sur)' : 'transparent') + ';color:' + (ko ? 'var(--tx3)' : (on ? 'var(--tx)' : 'var(--tx2)')) + ';opacity:' + (ko ? '.55' : '1') + '">' +
        '<span style="width:10px;height:10px;border-radius:2px;background:linear-gradient(90deg,' + V[k].btq + ' 50%,' + V[k].lab + ' 50%);opacity:' + (on && !ko ? 1 : .3) + '"></span>' + V[k].nom + '</button>';
    });
    bar.innerHTML = h;
  }

  function periode() { try { return getPeriodDates(); } catch (e) { return null; } }
  function commande() {
    var out = { mb: {}, ml: {}, db: {}, dl: {} }, p = periode();
    if (!p || !p.startDate || !p.endDate) return out;
    var pool = (window.__POOL && window.__POOL.orders && window.__POOL.orders.length) ? window.__POOL.orders : (S.orders || []);
    pool.forEach(function (o) {
      if (!o || o.status === 'DRAFT' || o.isTransfer) return;
      if (!tfbPassesNonDate(o)) return;
      var od = String(o.orderDate || '').slice(0, 10);
      if (!od || od < p.startDate || od > p.endDate) return;
      var lab = isLaboRow(o), m = od.slice(0, 7), v = o.total || 0;
      if (lab) { out.ml[m] = (out.ml[m] || 0) + v; out.dl[od] = (out.dl[od] || 0) + v; }
      else { out.mb[m] = (out.mb[m] || 0) + v; out.db[od] = (out.db[od] || 0) + v; }
    });
    return out;
  }
  function recuJours() {
    var out = { db: {}, dl: {} };
    (S.filtered || []).filter(function (r) { return !r.isTransfer; }).forEach(function (r) {
      var d = tfbBasisDate(r); if (!d) return; d = d.slice(0, 10);
      if (isLaboRow(r)) out.dl[d] = (out.dl[d] || 0) + r.total; else out.db[d] = (out.db[d] || 0) + r.total;
    });
    return out;
  }
  function facture(cb) {
    var p = periode(); if (!p || !p.startDate || !p.endDate) return cb(null);
    var c = p.startDate + '|' + p.endDate;
    if (factCache[c]) return cb(factCache[c]);
    fetch('/api/facture-bridge?start=' + encodeURIComponent(p.startDate) + '&end=' + encodeURIComponent(p.endDate))
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.ok || !j.jours) throw new Error((j && j.error) || 'réponse incomplète'); factCache[c] = j; cb(j); })
      .catch(function (e) { console.warn('facturé', e); cb(null); });
  }

  /* ---------- Dessin ---------- */
  function redessiner(s, fac) {
    var o = origine; if (!o) return;
    var mois = o.mois, labels = mois.map(moisLbl);
    var series = {};
    if (s.indexOf(base()) >= 0) series[base()] = { mb: o.mb, ml: o.ml, db: o.db, dl: o.dl };
    if (s.indexOf('cmd') >= 0 && !series.cmd) series.cmd = commande();
    if (s.indexOf('fac') >= 0 && fac) {
      var f = { mb: {}, ml: {}, db: {}, dl: {} };
      Object.keys(fac.jours).forEach(function (d) {
        var x = fac.jours[d], m = d.slice(0, 7);
        f.mb[m] = (f.mb[m] || 0) + (x.reseau || 0); f.ml[m] = (f.ml[m] || 0) + (x.lab || 0);
        f.db[d] = (f.db[d] || 0) + (x.reseau || 0); f.dl[d] = (f.dl[d] || 0) + (x.lab || 0);
      });
      series.fac = f;
    }
    var vis = ORDRE.filter(function (k) { return series[k]; });
    if (!vis.length) return;

    /* 1. Mensuel : une colonne empilée boutiques + labo par vision */
    var cm = Chart.getChart('chart-monthly'); if (cm) cm.destroy();
    var ds = [], tot = {};
    vis.forEach(function (k) {
      var x = series[k];
      tot[k] = mois.map(function (m) { return Math.round((x.mb[m] || 0) + (x.ml[m] || 0)); });
      var nomB = k === 'fac' ? 'RÉSEAU' : 'Boutiques', nomL = k === 'fac' ? 'LAB' : 'Labo';
      ds.push({ label: V[k].nom + ' · ' + nomB, data: mois.map(function (m) { return Math.round(x.mb[m] || 0); }), backgroundColor: V[k].btq, stack: k, borderRadius: 3, maxBarThickness: 34, order: 2, _v: k });
      ds.push({ label: V[k].nom + ' · ' + nomL, data: mois.map(function (m) { return Math.round(x.ml[m] || 0); }), backgroundColor: V[k].lab, stack: k, borderRadius: 3, maxBarThickness: 34, order: 2, _v: k });
    });
    if (o.trf && series[base()]) ds.push(Object.assign({}, o.trf, { order: 1 }));
    var plug = {
      id: 'visionsLettres',
      afterDatasetsDraw: function (ch) {
        try {
          var ctx = ch.ctx, x = ch.scales.x; ctx.save();
          ctx.textAlign = 'center';
          var col = (getComputedStyle(document.body).getPropertyValue('--tx') || '#141311').trim() || '#141311';
          vis.forEach(function (k) {
            var idx = ch.data.datasets.findIndex(function (d) { return d._v === k; });
            var meta = idx >= 0 ? ch.getDatasetMeta(idx + 1) : null; if (!meta || meta.hidden) return;
            meta.data.forEach(function (bar, i) {
              if (!bar) return;
              ctx.fillStyle = col; ctx.font = '600 10px Inter, system-ui, sans-serif'; ctx.textBaseline = 'bottom';
              var t = tot[k][i]; if (t) ctx.fillText(fmtK(t), bar.x, bar.y - 2);
              ctx.fillStyle = V[k].lab; ctx.font = '700 10px Inter, system-ui, sans-serif'; ctx.textBaseline = 'top';
              ctx.fillText(V[k].lettre, bar.x, x.bottom + 3);
            });
          });
          ctx.restore();
        } catch (e) {}
      }
    };
    new Chart(document.getElementById('chart-monthly'), {
      type: 'bar', plugins: [plug], data: { labels: labels, datasets: ds },
      options: {
        responsive: true, maintainAspectRatio: false, layout: { padding: { top: 14, bottom: 16 } },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12, padding: 10, usePointStyle: true } },
          tooltip: { callbacks: { footer: function (it) { if (!it || !it.length) return ''; var i = it[0].dataIndex; return vis.map(function (k) { return V[k].nom + ' : ' + fmtK(tot[k][i] || 0); }); } } }
        },
        scales: { x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 }, padding: 14 } }, y: { stacked: true, ticks: { callback: fmtK, font: { size: 11 } }, grid: { color: 'rgba(0,0,0,.06)' } } }
      }
    });
    var lb = document.getElementById('chart-monthly-label');
    if (lb) lb.textContent = 'Achats HT par mois — ' + vis.map(function (k) { return V[k].nom; }).join(' · ') + ' — boutiques vs labo';

    /* 2. Cumul : une courbe par vision (boutiques + labo) */
    var cc = Chart.getChart('chart-cumul'); if (cc) cc.destroy();
    var p = periode() || {}, jours = {};
    [p.startDate, p.endDate].filter(Boolean).forEach(function (d) { jours[d] = 1; });
    vis.forEach(function (k) { Object.keys(series[k].db).concat(Object.keys(series[k].dl)).forEach(function (d) { if ((!p.startDate || d >= p.startDate) && (!p.endDate || d <= p.endDate)) jours[d] = 1; }); });
    var jl = Object.keys(jours).sort();
    var tirets = { cmd: [2, 3], rec: [], fac: [7, 4] };
    new Chart(document.getElementById('chart-cumul'), {
      type: 'line',
      data: {
        labels: jl.map(function (d) { return d.slice(5); }), datasets: vis.map(function (k) {
          var c = 0, x = series[k];
          return { label: V[k].nom + ' cumulé', data: jl.map(function (d) { c += (x.db[d] || 0) + (x.dl[d] || 0); return Math.round(c); }), borderColor: V[k].lab, backgroundColor: V[k].lab, borderDash: tirets[k], fill: false, tension: .3, pointRadius: 0, borderWidth: 2.5 };
        })
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', labels: { font: { size: 12 }, boxWidth: 14, padding: 14, usePointStyle: true } }, tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ' : ' + fmtK(c.raw); } } } },
        scales: { y: { ticks: { callback: fmtK, font: { size: 11 } }, grid: { color: 'rgba(0,0,0,.05)' } }, x: { grid: { display: false }, ticks: { maxRotation: 40, font: { size: 10 }, maxTicksLimit: 10 } } }
      }
    });
  }

  /* Relit les graphiques d'origine juste après leur dessin : c'est la vision de la base courante. */
  function capter() {
    var cm = Chart.getChart('chart-monthly'), cc = Chart.getChart('chart-cumul');
    if (!cm || !cc) return null;
    var keys = periodMonthKeys(), lbls = cm.data.labels;
    var mois = lbls.map(function (l, i) { var k = keys.find(function (x) { return moisLbl(x) === l; }); return k || null; });
    if (mois.some(function (m) { return !m; })) return null;
    var dsB = cm.data.datasets.find(function (d) { return d.label === 'Boutiques'; }), dsL = cm.data.datasets.find(function (d) { return d.label === 'Labo'; });
    var dsT = cm.data.datasets.find(function (d) { return d.type === 'line'; });
    if (!dsB || !dsL) return null;
    var o = { mois: mois, mb: {}, ml: {}, trf: dsT ? { type: 'line', label: dsT.label, data: dsT.data.slice(), borderColor: dsT.borderColor, backgroundColor: dsT.backgroundColor, fill: false, tension: .3, pointRadius: 4, pointBackgroundColor: dsT.pointBackgroundColor, borderWidth: 2 } : null };
    mois.forEach(function (m, i) { o.mb[m] = dsB.data[i] || 0; o.ml[m] = dsL.data[i] || 0; });
    if (base() === 'rec') { var r = recuJours(); o.db = r.db; o.dl = r.dl; }
    else { var c = commande(); o.db = c.db; o.dl = c.dl; }
    return o;
  }

  function apres() {
    boutons();
    var s = sel().filter(function (k) { return !indispo(k); });
    if (!s.length) s = [base()];
    if (s.length === 1 && s[0] === base()) return;
    origine = capter();
    if (!origine) return;
    if (s.indexOf('fac') >= 0) facture(function (j) { redessiner(s, j); });
    else redessiner(s, null);
  }

  function installer() {
    if (typeof window.renderCharts !== 'function' || window.renderCharts.__visions) return false;
    var orig = window.renderCharts;
    var w = function () { var r = orig.apply(this, arguments); try { apres(); } catch (e) { console.warn('visions', e); } return r; };
    w.__visions = true;
    window.renderCharts = w;
    try { if (document.getElementById('chart-monthly') && Chart.getChart('chart-monthly')) apres(); } catch (e) {}
    return true;
  }
  if (!installer()) {
    var n = 0, t = setInterval(function () { if (installer() || ++n > 40) clearInterval(t); }, 250);
  }
})();
