const crypto = require("crypto"); const SHEET_ID = "1mVLfqmBngMxzUdFAr8OStN3rozJ2LoEbwkStPgeRk5w"; const GID_ROLE = { "822027506": "delivery", "1810251601": "walkin" }; const CODES = ["OB","SD","SF","PG","SV","TP","LBA","NE","LV","LNV","RB","LIL3","LP","BC","PP","BCJ","BDJ","BGH"]; const FIRST_CODE_COL = 4; const DATE_COL = 3; function b64url(buf) { return Buffer.from(buf).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_"); } async function getAccessToken(sa) { const now = Math.floor(Date.now() / 1000); const header = { alg: "RS256", typ: "JWT" }; const claim = { iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }; const unsigned = b64url(JSON.stringify(header)) + "." + b64url(JSON.stringify(claim)); const signer = crypto.createSign("RSA-SHA256"); signer.update(unsigned); const signature = b64url(signer.sign((sa.private_key || "").replace(/\\n/g, "\n"))); const assertion = unsigned + "." + signature; const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: assertion }) }); const j = await r.json(); if (!j.access_token) throw new Error("Echec OAuth Google : " + JSON.stringify(j).slice(0, 200)); return j.access_token; } function parseEur(s) { if (s == null) return 0; let t = String(s).replace(/[\u00a0\u202f\s]/g, "").replace(/\u20AC/g, "").replace(/\./g, "").replace(",", "."); const v = parseFloat(t); return isNaN(v) ? 0 : v; } function isoDate(d) { const m = String(d).trim().match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/); if (!m) return null; return m[3] + "-" + m[2] + "-" + m[1]; } exports.handler = async (event) => { const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, OPTIONS" }; if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" }; try { const raw = process.env.GOOGLE_SERVICE_ACCOUNT; if (!raw) return { statusCode: 503, headers, body: JSON.stringify({ error: "GOOGLE_SERVICE_ACCOUNT non configure sur Netlify." }) }; let sa; try { sa = JSON.parse(raw); } catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ error: "GOOGLE_SERVICE_ACCOUNT n'est pas un JSON valide." }) }; } const token = await getAccessToken(sa); const auth = { Authorization: "Bearer " + token }; const meta = await fetch("https://sheets.googleapis.com/v4/spreadsheets/" + SHEET_ID + "?fields=sheets.properties(sheetId,title)", { headers: auth }).then(function(r){ return r.json(); }); if (meta.error) return { statusCode: 502, headers, body: JSON.stringify({ error: "Sheets meta: " + (meta.error.message || "") }) }; const gidToTitle = {}; (meta.sheets || []).forEach(function(s){ gidToTitle[String(s.properties.sheetId)] = s.properties.title; }); const titleToRole = {}; const ranges = []; for (const gid of Object.keys(GID_ROLE)) { const title = gidToTitle[gid]; if (!title) continue; titleToRole[title] = GID_ROLE[gid]; ranges.push("'" + title.replace(/'/g, "''") + "'"); } if (!ranges.length) return { statusCode: 404, headers, body: JSON.stringify({ error: "Onglets introuvables (gid)." }) }; const qs = ranges.map(function(t){ return "ranges=" + encodeURIComponent(t); }).join("&") + "&valueRenderOption=FORMATTED_VALUE"; const vr = await fetch("https://sheets.googleapis.com/v4/spreadsheets/" + SHEET_ID + "/values:batchGet?" + qs, { headers: auth }).then(function(r){ return r.json(); }); if (vr.error) return { statusCode: 502, headers, body: JSON.stringify({ error: "Sheets values: " + (vr.error.message || "") }) }; const byRole = {}; (vr.valueRanges || []).forEach(function(vrr){ const title = String(vrr.range || "").split("!")[0].replace(/^'|'$/g, "").replace(/''/g, "'"); byRole[titleToRole[title]] = vrr.values || []; }); const daily = {}; for (const role of ["delivery", "walkin"]) { const rows = byRole[role] || []; for (const row of rows) { const iso = isoDate(row[DATE_COL]); if (!iso) continue; let any = false; const tmp = daily[iso] || {}; for (let i = 0; i < CODES.length; i++) { const v = parseEur(row[FIRST_CODE_COL + i]); if (v) { tmp[CODES[i]] = (tmp[CODES[i]] || 0) + v; any = true; } } if (any) daily[iso] = tmp; } } const byCodeMonth = {}; const isoDays = Object.keys(daily).sort(); for (const iso of isoDays) { const month = iso.slice(0, 7); const obj = daily[iso]; for (const code in obj) { if (!byCodeMonth[code]) byCodeMonth[code] = {}; byCodeMonth[code][month] = (byCodeMonth[code][month] || 0) + obj[code]; } }

    // ===== Ventes B2B / Evenement : doc "Suivi des inventaires mensuels" (DIFFERENT du SHEET_ID daily) =====
    // Onglets "MM/AA" (ex "06/26"), bloc "activite / ca ht" en colonnes C (libelle) / D (montant).
    // Enumeres dynamiquement : des qu'un nouvel onglet (ex "08/26") apparait, il est lu automatiquement.
    // Non bloquant : si ce doc est inaccessible (partage manquant), le CA/food cost quotidien reste servi.
    const MONTHLY_SHEET_ID = "1eVq-_N4Be3YGKUFGRkP2TeZnNkSDpQ5HyRApCABfdQE";
    const extraVentes = {};
    let extraError = null;
    let monthTabsSeen = [];
    try {
      const mMeta = await fetch("https://sheets.googleapis.com/v4/spreadsheets/" + MONTHLY_SHEET_ID + "?fields=sheets.properties(title)", { headers: auth }).then(function (r) { return r.json(); });
      if (mMeta.error) extraError = "meta: " + (mMeta.error.message || "");
      const monthTitles = (mMeta.sheets || []).map(function (s) { return s.properties.title; }).filter(function (t) { return /^\d{2}\/\d{2}$/.test(String(t).trim()); });
      monthTabsSeen = monthTitles.slice();
      if (monthTitles.length) {
        const norm = function (s) { return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""); };
        const mQs = monthTitles.map(function (t) { return "ranges=" + encodeURIComponent("'" + t.replace(/'/g, "''") + "'!C1:E45"); }).join("&") + "&valueRenderOption=FORMATTED_VALUE";
        const mvr = await fetch("https://sheets.googleapis.com/v4/spreadsheets/" + MONTHLY_SHEET_ID + "/values:batchGet?" + mQs, { headers: auth }).then(function (r) { return r.json(); });
        if (mvr.error) extraError = "values: " + (mvr.error.message || "");
        else if (mvr.valueRanges) {
          mvr.valueRanges.forEach(function (vrr) {
            const title = String(vrr.range || "").split("!")[0].replace(/^'|'$/g, "").replace(/''/g, "'").trim();
            const mm = title.match(/^(\d{2})\/(\d{2})$/);
            if (!mm) return;
            const isoMonth = "20" + mm[2] + "-" + mm[1];
            const o = {};
            (vrr.values || []).forEach(function (row) {
              const label = norm(row[0]);
              if (!label) return;
              const val = parseEur(row[1]);
              if (label.indexOf("walk") !== -1) o.walkin = val;
              else if (label.indexOf("deliver") !== -1) o.delivery = val;
              else if (label.indexOf("b2b") !== -1) o.b2b = val;
              else if (label.indexOf("even") !== -1) o.evenement = val;
              else if (label === "total") o.total = val;
            });
            // Inclure le mois des qu'une donnee d'activite existe (b2b, evenement, walkin, delivery ou total).
            // Les valeurs absentes sont forcees a 0.
            if (o.b2b != null || o.evenement != null || o.walkin != null || o.delivery != null || o.total != null) {
              o.b2b = o.b2b || 0; o.evenement = o.evenement || 0;
              o.walkin = o.walkin || 0; o.delivery = o.delivery || 0; o.total = o.total || 0;
              extraVentes[isoMonth] = o;
            }
          });
        }
      }
    } catch (e) { extraError = String((e && e.message) || e); }

    // ≈≈≈≈≈ Ventes B2B : fichier "Reporting_B2B_2.0", onglet "SUIVI CA" ≈≈≈≈≈
    // Ligne 3 : en-tetes de mois au format "AAAA/M" (ex "2026/8"). Ligne 4 : chiffre d'affaires B2B du mois.
    // Cette feuille est alimentee en continu : elle fait donc foi pour le b2b de TOUS les mois et remplace
    // la valeur figee lue dans les onglets mensuels "MM/AA" du doc "Suivi des inventaires mensuels".
    const B2B_SHEET_ID = "1Wgy73vGZrrh6KvY-3g15B9Wkm9nmViAkJp8_KRc3xMQ";
    const b2bByMonth = {};
    let b2bError = null;
    const parseB2B = function (s) {
      const t = String(s == null ? "" : s).replace(/[\u00a0\u202f\s\u20AC]/g, "");
      if (!t) return 0;
      if (t.indexOf(",") === -1 && /^-?\d+(\.\d+)?$/.test(t)) { const n = parseFloat(t); return isNaN(n) ? 0 : n; }
      return parseEur(t);
    };
    try {
      const bRange = encodeURIComponent("'SUIVI CA'!A3:BZ4");
      const bUrl = "https://sheets.googleapis.com/v4/spreadsheets/" + B2B_SHEET_ID + "/values:batchGet?ranges=" + bRange + "&valueRenderOption=FORMATTED_VALUE";
      const bvr = await fetch(bUrl, { headers: auth }).then(function (r) { return r.json(); });
      if (bvr.error) {
        b2bError = (bvr.error.message || "acces refuse") + " | Partagez le fichier Reporting_B2B_2.0 en lecture avec " + (sa.client_email || "le compte de service");
      } else {
        const bRows = (bvr.valueRanges && bvr.valueRanges[0] && bvr.valueRanges[0].values) || [];
        const bHdr = bRows[0] || [], bVal = bRows[1] || [];
        for (let i = 0; i < bHdr.length; i++) {
          const hm = String(bHdr[i] == null ? "" : bHdr[i]).trim().match(/^(\d{4})\s*\/\s*(\d{1,2})$/);
          if (!hm) continue;
          b2bByMonth[hm[1] + "-" + ("0" + hm[2]).slice(-2)] = parseB2B(bVal[i]);
        }
        if (!Object.keys(b2bByMonth).length) b2bError = "aucun en-tete de mois (AAAA/M) trouve en ligne 3 de l'onglet 'SUIVI CA'";
      }
    } catch (e) { b2bError = String((e && e.message) || e); }
    Object.keys(b2bByMonth).forEach(function (m) {
      const v = b2bByMonth[m];
      if (!extraVentes[m] && !v) return; // mois futur sans donnee : on n'invente pas de ligne
      const o = extraVentes[m] || (extraVentes[m] = { walkin: 0, delivery: 0, b2b: 0, evenement: 0, total: 0 });
      o.total = (o.total || 0) - (o.b2b || 0) + v;
      o.b2b = v;
    });

    return { statusCode: 200, headers: Object.assign({}, headers, { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" }), body: JSON.stringify({ ok: true, byCodeMonth: byCodeMonth, extraVentes: extraVentes, monthTabs: Object.keys(extraVentes), monthTabsSeen: monthTabsSeen, extraError: extraError, b2bError: b2bError, b2bMonths: Object.keys(b2bByMonth).length, codes: CODES, lastDay: isoDays.length ? isoDays[isoDays.length - 1] : null, tabs: Object.fromEntries(Object.entries(GID_ROLE).map(function(e){ return [e[0], { role: e[1], title: gidToTitle[e[0]] || null, rows: (byRole[e[1]] || []).length }]; })) }) }; } catch (err) { return { statusCode: 500, headers, body: JSON.stringify({ error: String((err && err.message) || err) }) }; } };
