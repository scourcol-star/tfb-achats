/* Refonte visuelle (style du Bridge Commandes & Factures) :
   - police Inter, filets beige, boutons actifs bleu nuit #2a3f50 ;
   - 4 carrés en haut (CA HT, commandé, reçu / supposé reçu, facturé) avec une colonne par jour
     (période d'un mois ou moins) ou par mois, recalculés selon la période et les filtres ;
   - les anciennes tuiles (#metrics-row) sont masquées mais restent calculées en arrière-plan.
   Données : commandes déjà chargées (S.filtered), ventes du Sheet (cache tfb-ventes-v1, règles de
   window.__tfbCA), balance comptable Pennylane (route /api/facture-bridge, comme l'ancienne tuile). */
(function () {
  var LAB_CODES = { CF: 1, Lognes: 1 };
  var COUL = { lab: '#C8A17A', res: '#6B7C8C', ven: '#3D5A73', b2b: '#C8A17A', ev: '#8B7FD1' };
  var MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  var facCache = {}, facEnCours = {}, derniereSig = '';
  var kpi = null, kpiT = 0;
  try { kpi = JSON.parse(localStorage.getItem('tfb-kpi-bridge') || 'null'); } catch (e) { kpi = null; }
  function chargerKpi() {
    if (Date.now() - kpiT < 10 * 60 * 1000) return;
    kpiT = Date.now();
    fetch('https://bridge-commandes-factures.netlify.app/api/kpi', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.mois) return;
        kpi = { at: j.at, mois: j.mois };
        try { localStorage.setItem('tfb-kpi-bridge', JSON.stringify(kpi)); } catch (e) {}
        derniereSig = ''; planifier();
      })
      .catch(function () {});
  }

  /* ---------- Style ---------- */
  var lk = document.createElement('link');
  lk.rel = 'stylesheet';
  lk.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
  document.head.appendChild(lk);
  var st = document.createElement('style');
  st.id = 'tfb-refonte-style';
  st.textContent =
    ':root{--sans:Inter,system-ui,-apple-system,"Segoe UI",Arial,sans-serif;--bg:#F3F4F6;--bor:#E4E0D8;--bor2:#D4CFC5;' +
    '--tx:#1A1A18;--tx2:#585F68;--tx3:#9B9890;--brand:#2A3F50;--brand-hover:#1F3040;--brand-deep:#2A3F50;--gold:#2A3F50;--gdark:#2A3F50;--amber:#2A3F50}' +
    'html body{font-family:var(--sans);font-size:13px;letter-spacing:-.05px}' +
    '#metrics-row{display:none !important}' +
    '#tfb-kpi{flex:1 1 100%;width:100%;box-sizing:border-box;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin:0 0 12px}' +
    '#tfb-kpi .tk{padding:12px 12px 10px}#tfb-kpi .tk-v{font-size:clamp(17px,1.5vw,25px)}#tfb-kpi .tk-t{font-size:10px;letter-spacing:.4px}#tfb-kpi .tk-s,#tfb-kpi .tk-l{font-size:10.5px}#tfb-kpi .tk-t,#tfb-kpi .tk-s{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.tk{background:#fff;border:1px solid var(--bor);border-radius:10px;padding:14px 16px 12px;min-width:0;display:flex;flex-direction:column}' +
    '.tk-t{font-size:10.5px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--tx3);display:flex;align-items:center;gap:6px}' +
    '.tk-t img{width:14px;height:14px;border-radius:3px}' +
    '.tk-v{font-size:25px;font-weight:700;letter-spacing:-.5px;color:var(--tx);margin:6px 0 2px;font-variant-numeric:tabular-nums}' +
    '.tk-s{font-size:11.5px;color:var(--tx2);min-height:16px}' +
    '.tk-s b{font-weight:600;color:var(--tx)}' +
    '.tk-g{display:flex;align-items:flex-end;gap:3px;height:104px;margin-top:12px;border-bottom:1px solid var(--bor)}' +
    '.tk-g{position:relative}' +
    '.tk-c{flex:1;min-width:0;height:100%;display:flex;align-items:flex-end;justify-content:center;cursor:default}' +
    '.tk-b{width:72%;max-width:34px;display:flex;flex-direction:column-reverse;border-radius:5px 5px 2px 2px;overflow:hidden}' +
    '.tk-b > div + div{border-bottom:1.5px solid #fff}' +
    '.tk-svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none}' +
    '.tk-p{position:absolute;width:8px;height:8px;margin:0 0 -4px -4px;border-radius:50%;background:#16A34A;border:1.5px solid #fff;box-sizing:border-box;z-index:2;pointer-events:auto;cursor:default}' +
    '.tk-p.encours{background:#9B9890}' +
    '.tk-ax{position:absolute;right:-2px;top:-14px;font-size:9.5px;color:#16A34A;font-weight:600}' +
    '.tk-fc{justify-content:flex-start}.tk-fc .tk-v{font-size:clamp(22px,2vw,32px) !important;color:#2A3F50;margin-top:10px}' +
    '.tk-fc .tk-r{display:flex;justify-content:space-between;gap:6px;font-size:10.5px;color:var(--tx2);margin-top:6px;white-space:nowrap}.tk-fc .tk-r b{font-weight:600;color:var(--tx)}' +
    '.tk-badge{display:inline-block;margin-top:8px;font-size:9.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#92400E;background:#FEF3C7;border-radius:4px;padding:2px 6px;align-self:flex-start}' +
    '.tk-kp{display:flex;align-items:center;gap:10px;margin-top:10px;padding:7px 10px;border-radius:8px;background:#E7F6EC}' +
    '.tk-kp b{font-size:18px;font-weight:700;color:#15803D;white-space:nowrap}' +
    '.tk-kp span{font-size:10.5px;line-height:1.35;color:#166534}' +
    '.tk-pl{position:absolute;transform:translate(-50%,0);margin-bottom:7px;font-size:9.5px;font-weight:600;color:#15803D;white-space:nowrap;z-index:2;pointer-events:none}' +
    '.tk-pca{background:#3D5A73}.tk-pca.vide{background:#fff;border:2px solid #3D5A73}' +
    '.tk-fcv{display:flex;align-items:baseline;gap:8px;margin:6px 0 2px}.tk-fcv span{font-size:clamp(22px,2vw,30px);font-weight:700;letter-spacing:-.6px;color:var(--tx)}' +
    '.tk-fcv em{font-style:normal;font-size:9.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#92400E;background:#FEF3C7;border-radius:4px;padding:2px 6px}' +
    '.tk-bar{height:7px;border-radius:4px;background:#F1EFEA;overflow:hidden;margin-top:3px}.tk-bar div{height:100%;border-radius:4px}' +
    '.tk-fcm{display:flex;align-items:flex-end;gap:3px;height:44px;margin-top:12px;border-bottom:1px solid var(--bor)}' +
    '.tk-fcm div{flex:1;min-width:0;height:100%;display:flex;align-items:flex-end;justify-content:center}.tk-fcm i{display:block;width:70%;max-width:14px;border-radius:3px 3px 1px 1px}' +
    '.tk-rb{margin-left:auto;font-size:13px;font-weight:700;letter-spacing:0;color:#15803D;background:#E7F6EC;border-radius:6px;padding:2px 8px;cursor:default}' +
    '.tk-gy{margin-left:40px}' +
    '.tk-gl{position:absolute;left:0;right:0;border-top:1px dashed #E4E0D8;pointer-events:none}' +
    '.tk-gl span{position:absolute;right:100%;margin-right:6px;transform:translateY(-50%);font-size:9.5px;color:var(--tx3);white-space:nowrap}' +
    '.tk-l i.ln{height:2px;width:12px;vertical-align:3px;background:#16A34A}' +
    '.tk-c:hover{opacity:.8}' +
    '.tk-x{display:flex;gap:3px;margin-top:4px}' +
    '.tk-x span{flex:1;min-width:0;text-align:center;font-size:10px;color:var(--tx3);white-space:nowrap;overflow:visible}' +
    '.tk-l{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:8px;font-size:11px;color:var(--tx2)}' +
    '.tk-l i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;vertical-align:0}' +
    '.tk-l b{font-weight:600;color:var(--tx);margin-left:3px}' +
    '.tk-vide{flex:1;display:flex;align-items:center;justify-content:center;text-align:center;font-size:11.5px;color:var(--tx3);' +
    'border:1px dashed var(--bor);border-radius:8px;margin-top:12px;min-height:92px;padding:8px}' +
    /* tableau des commandes : la colonne Commandé HT (8e) redevient visible */
    '#tbl-cmd > colgroup > col:nth-child(8){visibility:visible !important}' +
    '#tbl-cmd:not(:has(> colgroup)) > * > tr > :nth-child(8):not([colspan]){display:table-cell !important}' +
    '#tbl-cmd td.tfb-nofac{color:var(--tx3)}' +
    /* tableau des commandes : 10 colonnes de même largeur */
    '#tbl-cmd{table-layout:fixed !important;width:100% !important;min-width:0 !important}' +
    '#tbl-cmd th,#tbl-cmd td{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#tbl-cmd > colgroup > col{width:10% !important}';
  (document.body || document.documentElement).appendChild(st);

  /* ---------- Outils ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function eur(v) { return Math.round(v || 0).toLocaleString('fr-FR') + ' €'; }
  function jours(a, b) { var out = [], d = new Date(a + 'T00:00:00Z'), f = new Date(b + 'T00:00:00Z'); while (d <= f && out.length < 800) { out.push(iso(d)); d.setUTCDate(d.getUTCDate() + 1); } return out; }
  function periode() { try { var p = getPeriodDates(); return p && p.startDate && p.endDate ? p : null; } catch (e) { return null; } }
  function decoupe(p) {
    var js = jours(p.startDate, p.endDate);
    if (js.length <= 31) return { mode: 'j', cles: js, lbl: js.map(function (j, i) { var d = +j.slice(8); return (js.length <= 10 || i === 0 || d === 1 || d % 5 === 0) ? String(d) : ''; }) };
    var cles = [];
    js.forEach(function (j) { var m = j.slice(0, 7); if (cles[cles.length - 1] !== m) cles.push(m); });
    return { mode: 'm', cles: cles, lbl: cles.map(function (m) { return MOIS[+m.slice(5) - 1]; }) };
  }
  function bornes(cle, p) {
    if (cle.length === 10) return [cle, cle];
    var y = +cle.slice(0, 4), m = +cle.slice(5);
    var deb = cle + '-01', fin = iso(new Date(Date.UTC(y, m, 0)));
    if (deb < p.startDate) deb = p.startDate;
    if (fin > p.endDate) fin = p.endDate;
    return [deb, fin];
  }
  function indexDe(dateIso, dec) {
    if (!dateIso) return -1;
    var k = dec.mode === 'j' ? dateIso.slice(0, 10) : dateIso.slice(0, 7);
    var i = dec.cles.indexOf(k);
    if (i >= 0) return i;
    return k < dec.cles[0] ? 0 : dec.cles.length - 1;
  }
  function filtreAchats() {
    var site = (document.getElementById('f-site') || {}).value || 'all';
    var fourn = S.fournSel && Object.keys(S.fournSel).length;
    return { tout: S.group === 'all' && site === 'all' && !fourn };
  }

  /* ---------- Données ---------- */
  function achats(dec) {
    var cmd = dec.cles.map(function () { return [0, 0]; }), rec = dec.cles.map(function () { return [0, 0]; });
    var n = 0;
    (S.filtered || []).forEach(function (r) {
      if (r.isTransfer) return;
      var lab = LAB_CODES[r.siteCode] ? 0 : 1;
      n++;
      var i = indexDe(r.orderDate, dec);
      if (i >= 0) cmd[i][lab] += +r.total || 0;
      var j = indexDe(r.receptionDate || r.deliveryDate || r.orderDate, dec);
      if (j >= 0) rec[j][lab] += +(r.__recu != null ? r.__recu : r.total) || 0;
    });
    /* Suivi de réception : parmi les commandes livrées ce jour (ou ce mois), part réceptionnée
       dans Inpulse au plus tard 2 jours après la date de livraison. Livraisons futures exclues. */
    var auj = iso(new Date()), cpt = dec.cles.map(function () { return [0, 0, false]; }), totN = 0, totOk = 0;
    (S.filtered || []).forEach(function (r) {
      if (r.isTransfer || !r.deliveryDate) return;
      var dl = r.deliveryDate.slice(0, 10);
      if (dl > auj) return;
      var k = dec.mode === 'j' ? dl : dl.slice(0, 7), i = dec.cles.indexOf(k);
      if (i < 0) return;
      var d = new Date(dl + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 2);
      var limite = iso(d), rc = (r.receptionDate || '').slice(0, 10);
      var ok = !!rc && rc <= limite;
      cpt[i][0]++; if (ok) cpt[i][1]++;
      if (limite > auj) cpt[i][2] = true;
      totN++; if (ok) totOk++;
    });
    var rcp = cpt.map(function (c) { return c[0] ? { n: c[0], ok: c[1], pct: Math.round(c[1] / c[0] * 100), encours: c[2] } : null; });
    return { cmd: cmd, rec: rec, n: n, rcp: rcp, rcpPct: totN ? Math.round(totOk / totN * 100) : null };
  }
  function ventes(dec, p) {
    var d = null;
    try { d = JSON.parse(localStorage.getItem('tfb-ventes-v1') || 'null'); } catch (e) {}
    if (!d || !d.byCodeMonth || typeof window.__tfbCA !== 'function') return null;
    var orig = window.getPeriodDates, out = [], etat = [], lastDay = d.lastDay;
    try {
      dec.cles.forEach(function (cle) {
        var b = bornes(cle, p);
        if (lastDay && b[0] > lastDay) { out.push([0, 0, 0]); etat.push('vide'); return; }
        window.getPeriodDates = function () { return { startDate: b[0], endDate: b[1] }; };
        var r = window.__tfbCA(d) || { btq: 0, b2b: 0, ev: 0 };
        out.push([r.btq || 0, r.b2b || 0, r.ev || 0]); etat.push(lastDay && b[1] > lastDay ? 'partiel' : 'complet');
      });
    } finally { window.getPeriodDates = orig; }
    return { rows: out, etat: etat, lastDay: lastDay };
  }
  function facture(p) {
    var cle = p.startDate + '_' + p.endDate;
    if (!facCache[cle]) { try { var mem = JSON.parse(localStorage.getItem('tfb-refonte-fac-' + cle) || 'null'); if (mem && mem.jours) facCache[cle] = mem; } catch (e) {} }
    if (!facEnCours[cle] && (!facCache[cle] || Date.now() - (facCache[cle].t || 0) > 10 * 60 * 1000)) {
      facEnCours[cle] = true;
      fetch('/api/facture-bridge?start=' + encodeURIComponent(p.startDate) + '&end=' + encodeURIComponent(p.endDate))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok) throw new Error((j && j.error) || 'réponse vide');
          var v = { jours: j.jours || {}, lab: j.lab, reseau: j.reseau, total: j.total, t: Date.now() };
          facCache[cle] = v;
          try { localStorage.setItem('tfb-refonte-fac-' + cle, JSON.stringify(v)); } catch (e) {}
        })
        .catch(function (e) { if (!facCache[cle] || !facCache[cle].jours) facCache[cle] = { erreur: String(e.message || e), t: Date.now() }; })
        .then(function () { facEnCours[cle] = false; derniereSig = ''; planifier(); });
    }
    return facCache[cle] || null;
  }

  /* ---------- Rendu ---------- */
  function graph(rows, lbl, coul, titres, ligne) {
    var tots = rows.map(function (r) { return r.reduce(function (a, b) { return a + b; }, 0); });
    var max = Math.max.apply(null, tots.concat([1]));
    var g = rows.map(function (r, i) {
      var h = Math.max(tots[i] > 0 ? 2 : 0, tots[i] / max * 100 * (ligne ? 0.62 : 1));
      return '<div class="tk-c" title="' + titres[i] + ' : ' + eur(tots[i]) + '"><div class="tk-b" style="height:' + h + '%">' +
        r.map(function (x, k) { return x > 0 ? '<div style="flex:' + x + ';background:' + coul[k] + '"></div>' : ''; }).join('') + '</div></div>';
    }).join('');
    var ov = '';
    if (ligne) {
      /* courbe d'un seul tenant : les jours sans livraison sont enjambés, tracé lissé (Catmull-Rom) */
      var n = ligne.length, P = [], pts = '';
      var vals = ligne.filter(Boolean).map(function (p) { return p.pct; });
      var lo = Math.max(0, Math.min.apply(null, vals.concat([100])) - 10);
      var yPct = function (v) { return 8 + (100 - v) / Math.max(1, 100 - lo) * 24; };
      ligne.forEach(function (p, i) {
        if (!p) return;
        pts += '<span class="tk-pl" style="left:' + ((i + 0.5) / n * 100) + '%;bottom:' + (100 - yPct(p.pct)) + '%">' + p.pct + ' %</span>';
      });
      ligne.forEach(function (p, i) {
        if (!p) return;
        var x = (i + 0.5) / n * 100, y = yPct(p.pct);
        P.push([x, y]);
        pts += '<span class="tk-p' + (p.encours ? ' encours' : '') + '" style="left:' + x + '%;bottom:' + (100 - y) + '%" title="' + titres[i] +
          ' : ' + (p.tip || (p.ok + ' / ' + p.n + ' commandes réceptionnées à J+2 (' + p.pct + ' %)')) + (p.encours ? ' · J+2 pas encore atteint' : '') + '"></span>';
      });
      var d = '';
      if (P.length > 1) {
        d = 'M' + P[0][0].toFixed(2) + ',' + P[0][1].toFixed(2);
        for (var q = 0; q < P.length - 1; q++) {
          var p0 = P[q - 1] || P[q], p1 = P[q], p2 = P[q + 1], p3 = P[q + 2] || p2;
          d += ' C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(2) + ',' + Math.min(100, Math.max(0, p1[1] + (p2[1] - p0[1]) / 6)).toFixed(2) +
            ' ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(2) + ',' + Math.min(100, Math.max(0, p2[1] - (p3[1] - p1[1]) / 6)).toFixed(2) +
            ' ' + p2[0].toFixed(2) + ',' + p2[1].toFixed(2);
        }
      }
      ov = '<svg class="tk-svg" viewBox="0 0 100 100" preserveAspectRatio="none">' + [d].filter(Boolean).map(function (dd) {
        return '<path d="' + dd + '" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>';
      }).join('') + '</svg>' + pts;
    }
    return '<div class="tk-g">' + g + ov + '</div><div class="tk-x">' + lbl.map(function (l) { return '<span>' + l + '</span>'; }).join('') + '</div>';
  }
  function lisse(P) {
    if (P.length < 2) return '';
    var c = function (v) { return Math.min(100, Math.max(0, v)).toFixed(2); };
    var d = 'M' + P[0][0].toFixed(2) + ',' + P[0][1].toFixed(2);
    for (var q = 0; q < P.length - 1; q++) {
      var p0 = P[q - 1] || P[q], p1 = P[q], p2 = P[q + 1], p3 = P[q + 2] || p2;
      d += ' C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(2) + ',' + c(p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
        (p2[0] - (p3[0] - p1[0]) / 6).toFixed(2) + ',' + c(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + p2[0].toFixed(2) + ',' + p2[1].toFixed(2);
    }
    return d;
  }
  /* CA en courbe : total lissé sur fond léger ; dernier point en pointillé et vide s'il est incomplet */
  function courbe(vals, lbl, titres, etat) {
    var n = vals.length, max = Math.max.apply(null, vals.concat([1])) * 1.05, P = [], idx = [];
    vals.forEach(function (v, i) { if (etat[i] === 'vide') return; P.push([(i + 0.5) / n * 100, 100 - v / max * 88]); idx.push(i); });
    var nComplet = P.length;
    if (nComplet && etat[idx[nComplet - 1]] === 'partiel') nComplet--;
    var plein = P.slice(0, nComplet), d = lisse(plein), pts = '';
    var aire = plein.length > 1 ? d + ' L' + plein[plein.length - 1][0].toFixed(2) + ',100 L' + plein[0][0].toFixed(2) + ',100 Z' : '';
    var tiret = (nComplet > 0 && nComplet < P.length) ? 'M' + P[nComplet - 1][0].toFixed(2) + ',' + P[nComplet - 1][1].toFixed(2) + ' L' + P[nComplet][0].toFixed(2) + ',' + P[nComplet][1].toFixed(2) : '';
    P.forEach(function (p, k) {
      var i = idx[k], part = etat[i] === 'partiel';
      pts += '<span class="tk-p tk-pca' + (part ? ' vide' : '') + '" style="left:' + p[0] + '%;bottom:' + (100 - p[1]) + '%" title="' + titres[i] + ' : ' + eur(vals[i]) + (part ? ' (incomplet)' : '') + '"></span>';
    });
    /* lignes de repère horizontales, à des montants ronds en milliers d'euros */
    var brut = max / 4, puis = Math.pow(10, Math.floor(Math.log10(Math.max(brut, 1)))), pas = puis;
    [1, 2, 2.5, 5, 10].some(function (m) { if (m * puis >= brut) { pas = m * puis; return true; } return false; });
    var rep = '';
    for (var g = pas; g < max; g += pas) {
      rep += '<div class="tk-gl" style="top:' + (100 - g / max * 88) + '%"><span>' + Math.round(g / 1000).toLocaleString('fr-FR') + ' k€</span></div>';
    }
    return '<div class="tk-g tk-gy">' + rep + '<svg class="tk-svg" viewBox="0 0 100 100" preserveAspectRatio="none">' +
      (aire ? '<path d="' + aire + '" fill="#3D5A73" fill-opacity=".1"/>' : '') +
      (d ? '<path d="' + d + '" fill="none" stroke="#3D5A73" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' : '') +
      (tiret ? '<path d="' + tiret + '" fill="none" stroke="#3D5A73" stroke-width="2" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>' : '') +
      '</svg>' + pts + '</div><div class="tk-x tk-gy">' + lbl.map(function (l) { return '<span>' + l + '</span>'; }).join('') + '</div>';
  }
  function legende(noms, coul, totaux) {
    return '<div class="tk-l">' + noms.map(function (n, k) {
      return '<span><i style="background:' + coul[k] + '"></i>' + n + '<b>' + eur(totaux[k]) + '</b></span>';
    }).join('') + '</div>';
  }
  function somme(rows, k) { return rows.reduce(function (a, r) { return a + (r[k] || 0); }, 0); }
  function logo(dom) { return '<img src="https://www.google.com/s2/favicons?sz=64&domain=' + dom + '" alt="">'; }
  function titresDe(dec) {
    return dec.cles.map(function (c) {
      return c.length === 10 ? c.slice(8) + '/' + c.slice(5, 7) + '/' + c.slice(0, 4) : MOIS[+c.slice(5) - 1] + ' ' + c.slice(0, 4);
    });
  }

  function rendre() {
    var mr = document.getElementById('metrics-row');
    if (!mr || typeof S === 'undefined' || !S.filtered) return;
    var p = periode(); if (!p) return;
    var dec = decoupe(p), titres = titresDe(dec);
    var box = document.getElementById('tfb-kpi');
    if (!box) { box = document.createElement('div'); box.id = 'tfb-kpi'; mr.parentNode.insertBefore(box, mr); }

    chargerKpi();
    var a = achats(dec), v = ventes(dec, p), f = filtreAchats(), fac = f.tout ? facture(p) : null;
    var html = '', caTot = null, facTot = null, facRowsM = null;

    /* CA HT */
    if (v) {
      var tv = [somme(v.rows, 0), somme(v.rows, 1), somme(v.rows, 2)];
      caTot = tv[0] + tv[1] + tv[2];
      html += '<div class="tk"><div class="tk-t">Chiffre d\'affaires HT</div>' +
        '<div class="tk-v">' + eur(tv[0] + tv[1] + tv[2]) + '</div>' +
        '<div class="tk-s">' + (v.lastDay ? 'Ventes jusqu\'au ' + v.lastDay.slice(8) + '/' + v.lastDay.slice(5, 7) + '/' + v.lastDay.slice(0, 4) : '') + '</div>' +
        courbe(v.rows.map(function (r) { return r[0] + r[1] + r[2]; }), dec.lbl, titres, v.etat) +
        (function () { /* B2B et Événement n'apparaissent que s'il y en a sur la période et le périmètre choisis */ var noms = [], cl = [], vl = []; [['Ventes', COUL.ven], ['B2B', COUL.b2b], ['Événement', COUL.ev]].forEach(function (s, k) { if (k === 0 || Math.round(tv[k]) !== 0) { noms.push(s[0]); cl.push(s[1]); vl.push(tv[k]); } }); return legende(noms, cl, vl); })() + '</div>';
    } else {
      html += '<div class="tk"><div class="tk-t">Chiffre d\'affaires HT</div><div class="tk-v">—</div><div class="tk-s"></div><div class="tk-vide">Chargement des ventes…</div></div>';
    }

    /* Commandé et reçu */
    [['cmd', 'Total commandé HT', 'Inpulse · date de commande'], ['rec', 'Total reçu / supposé reçu HT', 'Inpulse · date de réception']].forEach(function (x) {
      var rows = a[x[0]], tl = somme(rows, 0), tr = somme(rows, 1);
      html += '<div class="tk"><div class="tk-t">' + logo('inpulse.ai') + x[1] +
        (x[0] === 'rec' && a.rcpPct != null ? '<span class="tk-rb" title="Livraisons pointées en réception dans Inpulse sous 48 h (au plus tard J+2 après la date de livraison)">' + a.rcpPct + ' %</span>' : '') + '</div>' +
        '<div class="tk-v">' + eur(tl + tr) + '</div>' +
        '<div class="tk-s"><b>' + a.n.toLocaleString('fr-FR') + '</b> commandes · ' + x[2] + '</div>' +
        graph(rows, dec.lbl, [COUL.lab, COUL.res], titres, x[0] === 'rec' ? a.rcp : null) +
        legende(['TFB LAB', 'TFB RÉSEAU'], [COUL.lab, COUL.res], [tl, tr]).replace('</div>', x[0] === 'rec' && a.rcpPct != null ?
          '<span><i class="ln"></i>% réceptionné sous 48 h</span></div>' : '</div>') + '</div>';
    });

    /* Facturé */
    var tFac = '<div class="tk"><div class="tk-t">' + logo('pennylane.com') + 'Total facturé HT</div>';
    if (!f.tout) {
      html += tFac + '<div class="tk-v">—</div><div class="tk-s">Balance comptable Pennylane</div>' +
        '<div class="tk-vide">Disponible uniquement pour tout le périmètre : la balance comptable ne se découpe ni par boutique ni par fournisseur.</div></div>';
    } else if (!fac || (!fac.jours && !fac.erreur)) {
      html += tFac + '<div class="tk-v">…</div><div class="tk-s">Balance comptable Pennylane</div><div class="tk-vide">Lecture de la balance comptable…</div></div>';
    } else if (!fac.jours) {
      html += tFac + '<div class="tk-v">—</div><div class="tk-s">Balance comptable Pennylane</div><div class="tk-vide">Lecture impossible : ' + fac.erreur + '</div></div>';
    } else {
      var mois = {}, ordre = [];
      Object.keys(fac.jours).sort().forEach(function (k) {
        var m = k.slice(0, 7); if (!mois[m]) { mois[m] = [0, 0]; ordre.push(m); }
        mois[m][0] += +fac.jours[k].lab || 0; mois[m][1] += +fac.jours[k].reseau || 0;
      });
      var rowsF, lblF, titF;
      if (dec.mode === 'm') {
        rowsF = dec.cles.map(function (c) { return mois[c] || [0, 0]; }); lblF = dec.lbl; titF = titres;
      } else {
        rowsF = ordre.map(function (m) { return mois[m]; });
        lblF = ordre.map(function (m) { return MOIS[+m.slice(5) - 1]; });
        titF = ordre.map(function (m) { return MOIS[+m.slice(5) - 1] + ' ' + m.slice(0, 4); });
      }
      var fl = somme(rowsF, 0), fr = somme(rowsF, 1);
      facTot = fl + fr;
      facRowsM = dec.mode === 'm' ? rowsF : null;
      /* % de factures Pennylane rapprochées à une commande (en €), publié par le Bridge (/api/kpi) */
      var clesF = dec.mode === 'm' ? dec.cles : ordre, ligneF = null, badgeF = '';
      if (kpi && kpi.mois) {
        var sT = 0, sO = 0;
        ligneF = clesF.map(function (c, i) {
          var m = kpi.mois[c];
          if (!m || !(m.t > 0)) return null;
          sT += m.t; sO += m.ok;
          return { pct: Math.round(m.ok / m.t * 100), ok: m.ok, n: m.t, encours: false,
            tip: Math.round(m.ok / m.t * 100) + ' % des factures rapprochées à une commande (' + eur(m.ok) + ' sur ' + eur(m.t) + ', ' + m.nok + ' / ' + m.nt + ' factures)' };
        });
        if (!ligneF.some(Boolean)) ligneF = null;
        if (sT > 0) badgeF = '<span class="tk-rb" title="Factures Pennylane (LAB + RÉSEAU) rapprochées à une commande Inpulse, en €, calcul du Bridge' +
          (kpi.at ? ' · mis à jour le ' + new Date(kpi.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '') + '">' + Math.round(sO / sT * 100) + ' %</span>';
      }
      html += tFac.replace('</div>', badgeF + '</div>') + '<div class="tk-v">' + eur(fl + fr) + '</div>' +
        '<div class="tk-s">Balance comptable Pennylane' + (dec.mode === 'j' ? ' · détail par mois uniquement' : '') + '</div>' +
        graph(rowsF, lblF, [COUL.lab, COUL.res], titF, ligneF) +
        legende(['TFB LAB', 'TFB RÉSEAU'], [COUL.lab, COUL.res], [fl, fr]).replace('</div>', ligneF ? '<span><i class="ln"></i>% rapproché à une commande</span></div>' : '</div>') + '</div>';
    }
    /* 5e tuile : Food Cost prévisionnel = achats facturés (balance comptable) / CA HT, sans variation de stock */
    var moisCourant = iso(new Date()).slice(0, 7), previ = p.endDate >= moisCourant + '-01';
    var fc = (caTot && facTot != null) ? facTot / caTot * 100 : null;
    var pc1 = function (x) { return x.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %'; };
    var fcH = '<div class="tk tk-fc"><div class="tk-t" title="Achats facturés (balance comptable Pennylane) / CA HT, hors variation de stock">Food cost prévisionnel</div>';
    if (fc == null) {
      fcH += '<div class="tk-v">—</div><div class="tk-vide">' + (f.tout ? 'En attente du CA ou du facturé' : 'Disponible uniquement pour tout le périmètre') + '</div>';
    } else {
      fcH += '<div class="tk-fcv"><span>' + pc1(fc) + '</span>' + (previ ? '<em>Prévisionnel</em>' : '') + '</div>' +
        '<div class="tk-s">Achats facturés ÷ CA HT · hors inventaire</div>' +
        '<div class="tk-r"><span>Achats facturés</span><b>' + eur(facTot) + '</b></div><div class="tk-bar"><div style="width:' + Math.min(100, fc) + '%;background:#2A3F50"></div></div>' +
        '<div class="tk-r"><span>CA HT</span><b>' + eur(caTot) + '</b></div><div class="tk-bar"><div style="width:100%;background:#C8A17A"></div></div>';
      if (facRowsM && v && dec.cles.length > 1) {
        var fm = dec.cles.map(function (c, i) {
          var ca = v.rows[i][0] + v.rows[i][1] + v.rows[i][2], fa = facRowsM[i][0] + facRowsM[i][1];
          return ca > 0 && fa > 0 ? fa / ca * 100 : null;
        });
        var okm = fm.filter(function (x) { return x != null; });
        if (okm.length) {
          var mn = Math.min.apply(null, okm), mx = Math.max.apply(null, okm), lo2 = Math.max(0, mn - 3);
          fcH += '<div class="tk-fcm">' + fm.map(function (x, i) {
            var enc = dec.cles[i] === moisCourant;
            return '<div title="' + titres[i] + ' : ' + (x == null ? '—' : pc1(x)) + (enc ? ' (mois en cours)' : '') + '"><i style="height:' +
              (x == null ? 0 : Math.max(8, (x - lo2) / Math.max(0.1, mx - lo2) * 100)) + '%;background:' + (enc ? '#D3D1C7' : '#2A3F50') + '"></i></div>';
          }).join('') + '</div><div class="tk-x">' + dec.lbl.map(function (l) { return '<span>' + l + '</span>'; }).join('') + '</div>' +
            '<div class="tk-s" style="margin-top:4px">Food cost par mois</div>';
        }
      }
    }
    html += fcH + '</div>';
    box.innerHTML = html;
  }

  /* ---------- Rafraîchissement : à chaque changement de période, filtre ou données ---------- */
  function signature() {
    var p = periode(); if (!p || typeof S === 'undefined' || !S.filtered) return '';
    var t = 0; for (var i = 0; i < S.filtered.length; i++) t += +S.filtered[i].total || 0;
    return [p.startDate, p.endDate, S.filtered.length, Math.round(t), S.group, (document.getElementById('f-site') || {}).value,
      S.fournSel ? Object.keys(S.fournSel).length : 0, localStorage.getItem('tfb-ventes-v1') ? 1 : 0].join('|');
  }
  var minut = null;
  function planifier() { clearTimeout(minut); minut = setTimeout(verifier, 150); }
  function verifier() {
    var s = signature();
    if (!s || s === derniereSig) return;
    derniereSig = s;
    try { rendre(); } catch (e) { console.error('tfb-refonte', e); }
  }
  setInterval(verifier, 1000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', planifier); else planifier();
})();
