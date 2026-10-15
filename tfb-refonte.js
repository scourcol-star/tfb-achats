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
    '#tfb-kpi{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 12px}' +
    '@media(max-width:1200px){#tfb-kpi{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
    '.tk{background:#fff;border:1px solid var(--bor);border-radius:10px;padding:14px 16px 12px;min-width:0;display:flex;flex-direction:column}' +
    '.tk-t{font-size:10.5px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--tx3);display:flex;align-items:center;gap:6px}' +
    '.tk-t img{width:14px;height:14px;border-radius:3px}' +
    '.tk-v{font-size:25px;font-weight:700;letter-spacing:-.5px;color:var(--tx);margin:6px 0 2px;font-variant-numeric:tabular-nums}' +
    '.tk-s{font-size:11.5px;color:var(--tx2);min-height:16px}' +
    '.tk-s b{font-weight:600;color:var(--tx)}' +
    '.tk-g{display:flex;align-items:flex-end;gap:3px;height:92px;margin-top:12px;border-bottom:1px solid var(--bor)}' +
    '.tk-c{flex:1;min-width:0;display:flex;flex-direction:column-reverse;border-radius:2px 2px 0 0;overflow:hidden;cursor:default}' +
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
    '#tbl-cmd td.tfb-nofac{color:var(--tx3)}';
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
    return { cmd: cmd, rec: rec, n: n };
  }
  function ventes(dec, p) {
    var d = null;
    try { d = JSON.parse(localStorage.getItem('tfb-ventes-v1') || 'null'); } catch (e) {}
    if (!d || !d.byCodeMonth || typeof window.__tfbCA !== 'function') return null;
    var orig = window.getPeriodDates, out = [], lastDay = d.lastDay;
    try {
      dec.cles.forEach(function (cle) {
        var b = bornes(cle, p);
        if (lastDay && b[0] > lastDay) { out.push([0, 0, 0]); return; }
        window.getPeriodDates = function () { return { startDate: b[0], endDate: b[1] }; };
        var r = window.__tfbCA(d) || { btq: 0, b2b: 0, ev: 0 };
        out.push([r.btq || 0, r.b2b || 0, r.ev || 0]);
      });
    } finally { window.getPeriodDates = orig; }
    return { rows: out, lastDay: lastDay };
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
  function graph(rows, lbl, coul, titres) {
    var tots = rows.map(function (r) { return r.reduce(function (a, b) { return a + b; }, 0); });
    var max = Math.max.apply(null, tots.concat([1]));
    var g = rows.map(function (r, i) {
      var h = Math.max(tots[i] > 0 ? 2 : 0, tots[i] / max * 100);
      return '<div class="tk-c" title="' + titres[i] + ' : ' + eur(tots[i]) + '" style="height:' + h + '%">' +
        r.map(function (x, k) { return x > 0 ? '<div style="flex:' + x + ';background:' + coul[k] + '"></div>' : ''; }).join('') + '</div>';
    }).join('');
    return '<div class="tk-g">' + g + '</div><div class="tk-x">' + lbl.map(function (l) { return '<span>' + l + '</span>'; }).join('') + '</div>';
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

    var a = achats(dec), v = ventes(dec, p), f = filtreAchats(), fac = f.tout ? facture(p) : null;
    var html = '';

    /* CA HT */
    if (v) {
      var tv = [somme(v.rows, 0), somme(v.rows, 1), somme(v.rows, 2)];
      html += '<div class="tk"><div class="tk-t">Chiffre d\'affaires HT</div>' +
        '<div class="tk-v">' + eur(tv[0] + tv[1] + tv[2]) + '</div>' +
        '<div class="tk-s">' + (v.lastDay ? 'Ventes jusqu\'au ' + v.lastDay.slice(8) + '/' + v.lastDay.slice(5, 7) + '/' + v.lastDay.slice(0, 4) : '') + '</div>' +
        graph(v.rows, dec.lbl, [COUL.ven, COUL.b2b, COUL.ev], titres) +
        legende(['Ventes', 'B2B', 'Événement'], [COUL.ven, COUL.b2b, COUL.ev], tv) + '</div>';
    } else {
      html += '<div class="tk"><div class="tk-t">Chiffre d\'affaires HT</div><div class="tk-v">—</div><div class="tk-s"></div><div class="tk-vide">Chargement des ventes…</div></div>';
    }

    /* Commandé et reçu */
    [['cmd', 'Total commandé HT', 'Inpulse · date de commande'], ['rec', 'Total reçu / supposé reçu HT', 'Inpulse · date de réception']].forEach(function (x) {
      var rows = a[x[0]], tl = somme(rows, 0), tr = somme(rows, 1);
      html += '<div class="tk"><div class="tk-t">' + logo('inpulse.ai') + x[1] + '</div>' +
        '<div class="tk-v">' + eur(tl + tr) + '</div>' +
        '<div class="tk-s"><b>' + a.n.toLocaleString('fr-FR') + '</b> commandes · ' + x[2] + '</div>' +
        graph(rows, dec.lbl, [COUL.lab, COUL.res], titres) +
        legende(['TFB LAB', 'TFB RÉSEAU'], [COUL.lab, COUL.res], [tl, tr]) + '</div>';
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
      html += tFac + '<div class="tk-v">' + eur(fl + fr) + '</div>' +
        '<div class="tk-s">Balance comptable Pennylane' + (dec.mode === 'j' ? ' · détail par mois uniquement' : '') + '</div>' +
        graph(rowsF, lblF, [COUL.lab, COUL.res], titF) +
        legende(['TFB LAB', 'TFB RÉSEAU'], [COUL.lab, COUL.res], [fl, fr]) + '</div>';
    }
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
