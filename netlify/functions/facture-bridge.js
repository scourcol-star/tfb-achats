// Total facturé HT = « Achats facturés HT » du Dashboard du Bridge Commandes & Factures.
// Même périmètre : entités LAB + RESEAU, factures fournisseurs Pennylane datées dans la période
// (date de facture), fournisseurs rattachés à Inpulse (« Achats (fournisseurs Inpulse) »),
// avoirs déduits, doublons certains déduits.
// Usage : /api/facture-bridge?start=2026-09-01&end=2026-09-30
//
// Le site Bridge est protégé par la connexion Netlify (SSO) : on ne l'appelle pas en HTTP.
// On lit directement son instantané de données (Netlify Blobs, store « dataset-v1 »), celui que
// le Bridge rafraîchit lui-même, avec le jeton BLOBS_TOKEN déjà déclaré sur ce site.
//
// Règles recopiées de bridge-commandes-factures/public/index.html (normName, SUP_ALIAS,
// ORD_MERGE, INP_CATALOG, nameScore, matchSupplier, markDups, netOf). Si le Bridge change
// ces règles, les reporter ici.

const { getStore } = require("@netlify/blobs");
const { gunzipSync } = require("zlib");

const BRIDGE_SITE_ID = process.env.BRIDGE_SITE_ID || "2e091ef9-3173-495b-bf3b-fd41f00caef5";
const ENTITES = ["lab", "reseau"];

const LEGAL = /\b(SARL|SAS|SASU|SA|EURL|SNC|SCI|EARL|GIE|LTD|GMBH|BV|SPRL|ETS|ETABLISSEMENTS|GROUPE|FRANCE|DISTRIBUTION)\b/g;
function normName(s) {
  return String(s || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ").replace(LEGAL, " ").replace(/\s+/g, " ").trim();
}
const SUP_ALIAS = {
  "OLIVIER BROSSET": "MAISON BROSSET",
  "MOULIN DE PARIS": "MOULIN PAUL DUPUIS",
  "MAMMAFIORE": "MAMMA FIORE",
  "ORGANIC PEP'S": "OP'S",
  "LODIFRAIS": "LODIPAT",
  "TERRES ET HOMMES": "L'ARBRE A CAFE",
  "FRUGAM SAS": "APIFRUIT",
  "SAS ODEON SAS": "DELON",
  "PURATOS SIMPA": "PATIS FRANCE"
};
const ALIAS = {};
Object.keys(SUP_ALIAS).forEach(function (k) { ALIAS[normName(k)] = normName(SUP_ALIAS[k]); });
const ORD_MERGE_RAW = { "PATIS FRANCE (CHOCOLAT)": "PATIS FRANCE" };
const ORD_MERGE = {}, ORD_LBL = {};
Object.keys(ORD_MERGE_RAW).forEach(function (k) { const t = ORD_MERGE_RAW[k]; ORD_MERGE[normName(k)] = normName(t); ORD_LBL[normName(t)] = t; });
const INP_CATALOG = ["AGRIMONTANA","APIFRUIT","BOURDICAUD","BRANDECISION","DELICE ET CREATION","DELIDRINKS","DELON","ESNAULT","FUSEAU","GIRONDIN PRIMEUR","GOBERLOTE","GROUPE TFB","ISIGNY SAINTE MERE","J'OCEANE","KALIOS","KEDY PACK","L'ARBRE A CAFE","LA CAVE A TITOUNE","LES JARDINS D'ALBERT","LITOGRAF","LODIPAT","LOSTE","MAISON BROSSET","MAISON LECLAIRE","MALEO EMBALLAGE","MAMMA FIORE","METRO","MOULIN PAUL DUPUIS","MR NET","MURAT","MVO DISTRIBUTION","NESPRESSO","NISHIKIDORI","NOMIE EPICES","OCTOPUS","OP'S","PALAIS DES THES","PATIS FRANCE","PATIS FRANCE (CHOCOLAT)","PRIMEURS PASSION","PVLAB","SAVEURS TRAITEUR","SECRETS D'HONORE","SILVAREM","SOCOPA","SOREAL","TFB LAB CHALIFERT","TRANSGOURMET","VALRHONA","VANDENBULCKE","VASSANT","WELLEMBAL","WMF"];

function nameScore(a, b) {
  a = normName(a); b = normName(b);
  if (!a || !b) return 0;
  if (a === b) return 40;
  if (a.includes(b) || b.includes(a)) return 26;
  const ta = new Set(a.split(" ").filter(function (t) { return t.length > 2; }));
  const tb = b.split(" ").filter(function (t) { return t.length > 2; });
  if (!ta.size || !tb.length) return 0;
  const hit = tb.filter(function (t) { return ta.has(t); }).length;
  return hit ? Math.min(22, 10 + hit * 6) : 0;
}
function supplierIndex(orders) {
  const by = {};
  const seed = function (n0, label) {
    const n = ORD_MERGE[n0] || n0;
    if (!by[n]) by[n] = { name: ORD_LBL[n] || label };
    return by[n];
  };
  INP_CATALOG.forEach(function (raw) { const n0 = normName(raw); if (n0) seed(n0, raw); });
  (orders || []).forEach(function (o) { const n0 = normName(o.supplierName); if (n0) seed(n0, o.supplierName); });
  return Object.values(by);
}
function matchSupplier(invName, sups) {
  const n = normName(invName);
  if (!n) return false;
  const al = ALIAS[n];
  if (al) { for (const s of sups) { if (normName(s.name) === al) return true; } }
  let bs = 0;
  for (const s of sups) { const sc = nameScore(invName, s.name); if (sc > bs) bs = sc; }
  return bs >= 26;
}
function dupKey(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
// Doublons « certains » : même entité, fournisseur, numéro, montant et date. On déduit les exemplaires en trop.
function doublons(invoices) {
  const g = {};
  invoices.forEach(function (i) {
    const n = dupKey(i.invoice_number); if (!n) return;
    const k = i.entity + "|" + dupKey(i.supplierName) + "|" + n + "|" + (i.amountHT || 0).toFixed(2) + "|" + (i.date || "");
    (g[k] = g[k] || []).push(i);
  });
  let extra = 0;
  const parJour = {};
  Object.keys(g).forEach(function (k) {
    const v = g[k];
    if (v.length > 1) {
      const x = Number((v[0].amountHT || 0).toFixed(2)) * (v.length - 1);
      extra += x;
      parJour[v[0].date] = (parJour[v[0].date] || 0) + x;
    }
  });
  return { total: extra, parJour: parJour };
}
function arrondi(v) { return Math.round(v * 100) / 100; }

async function lireInstantane() {
  const token = process.env.BLOBS_TOKEN;
  if (!token) throw new Error("Variable BLOBS_TOKEN absente sur le site tfb-achats");
  const store = getStore({ name: "dataset-v1", siteID: BRIDGE_SITE_ID, token: token });
  const buf = await store.get("current", { type: "arrayBuffer" });
  if (!buf) throw new Error("Instantané du Bridge introuvable (ouvrir le Bridge une fois)");
  return JSON.parse(gunzipSync(Buffer.from(buf)).toString("utf8"));
}

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json; charset=utf-8" };
  const q = event.queryStringParameters || {};
  const debut = String(q.start || "");
  const fin = String(q.end || "");
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(debut) || !iso.test(fin)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "start et end attendus au format AAAA-MM-JJ" }) };
  }
  try {
    const snap = await lireInstantane();
    const sups = supplierIndex(snap.orders);
    const res = { ok: true, start: debut, end: fin, source: "Bridge · Achats facturés (fournisseurs Inpulse)", maj: snap.at ? new Date(snap.at).toISOString() : null };
    let total = 0, nf = 0, avoirs = 0, dup = 0;
    const jours = {}; // { "AAAA-MM-JJ": { lab, reseau } } en date de facture, doublons déduits
    const ajoute = function (d, e, v) { if (!d) return; const j = jours[d] || (jours[d] = { lab: 0, reseau: 0 }); j[e] = arrondi(j[e] + v); };
    ENTITES.forEach(function (e) {
      const liste = (snap.invoices || []).filter(function (i) {
        return i.entity === e && i.date && i.date >= debut && i.date <= fin && matchSupplier(i.supplierName, sups);
      });
      let s = 0;
      liste.forEach(function (i) {
        const v = +i.amountHT || 0;
        s += v;
        ajoute(i.date, e, v);
        if (v < 0 || i.avoir) avoirs += v; else nf++;
      });
      const dd = doublons(liste);
      Object.keys(dd.parJour).forEach(function (j) { ajoute(j, e, -dd.parJour[j]); });
      const d = dd.total;
      dup += d;
      res[e] = arrondi(s - d);
      total += s - d;
    });
    res.total = arrondi(total);
    res.factures = nf;
    res.avoirs = arrondi(avoirs);
    res.doublons = arrondi(dup);
    res.jours = jours;
    return {
      statusCode: 200,
      headers: Object.assign({}, headers, { "Cache-Control": "s-maxage=120, stale-while-revalidate=600" }),
      body: JSON.stringify(res)
    };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: String((err && err.message) || err) }) };
  }
};
