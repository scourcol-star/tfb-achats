// Proxy Inpulse : la cle API reste cote serveur (variable Netlify API_KEY).
// Depuis le 01/11/2026, les commandes et receptions saisies dans TFB OPS (labos et boutiques) sont
// ajoutees ici, traduites au format Inpulse, pour que TOUTES les pages de l app (accueil, Food Cost,
// RFA, Engagements, Fournisseurs) les traitent avec les memes regles que les commandes Inpulse.
//   - /public/v2/orders (liste)        : commandes TFB OPS ajoutees apres celles d Inpulse (memes filtres
//                                         sites + date de commande), total augmente d autant
//   - /public/v2/orders/ops-<id>       : lignes de la commande TFB OPS, au format des lignes Inpulse
//   - /public/v2/supplier-products     : matieres TFB OPS sans equivalent Inpulse ajoutees en fin de liste
// Une commande n est saisie que dans un seul outil : pas de dedoublonnage.
// TFB OPS (API v1, cle TFB_OPS_API_KEY, 60 appels/h) est lu au plus toutes les 15 min, en incremental
// (modifiees_depuis), avec une relecture complete par jour ; l etat est garde dans Netlify Blobs.
const { getStore } = require("@netlify/blobs");

const OPS_BASE = "https://tfb-operations.netlify.app/api/v1/";
const OPS_START = "2026-11-01";
const EVERY = 15 * 60 * 1000, FULL_EVERY = 24 * 3600 * 1000, REF_EVERY = 20 * 3600 * 1000;
const STATE_KEY = "tfbops-state-v2";
const NO_CAT = "NON CATÉGORISÉ";

/* codes sites TFB OPS -> magasins Inpulse (meme table que l app) */
const SITE_STORE = {
  SD: "064bd480-8fb9-11f0-83bf-f96a1806d919", SF: "19d16380-8fb9-11f0-9f81-21aea717c1be",
  PP: "28acb6b0-d128-11f0-868f-59be9a201bad", PG: "2933d5b0-8fb9-11f0-975b-2726f4fe3aed",
  SV: "3a756820-8fb9-11f0-83bf-f96a1806d919", LOGNES: "41712550-9528-11f0-99ae-49d8e489343b",
  TP: "52050db0-8fb9-11f0-83bf-f96a1806d919", LV: "61f9fbe0-8fb9-11f0-9586-c9a0d6a19dc3",
  NE: "753b2ee0-8fb9-11f0-83bf-f96a1806d919", CHALIFERT: "756a96c0-d69b-11f0-99e1-bd8049e1162b",
  CF: "756a96c0-d69b-11f0-99e1-bd8049e1162b", RB: "84b8a320-8fb9-11f0-a12b-690e93f68ae2",
  LP: "94a553f0-8fb9-11f0-a5ad-37d09fba6a0b", LBA: "a5ddbea0-8fb9-11f0-975b-2726f4fe3aed",
  LNV: "b353a310-8fb9-11f0-a12b-690e93f68ae2", BDJ: "be012c50-2862-11f1-bd5f-f7b0a703feb4",
  BC: "be446340-8fb9-11f0-a12b-690e93f68ae2", BCJ: "d32ed970-8fb9-11f0-975b-2726f4fe3aed",
  BGP: "d32ed970-8fb9-11f0-975b-2726f4fe3aed", BGH: "e6f59020-8fb9-11f0-975b-2726f4fe3aed",
  OB: "f79b9b50-8fb8-11f0-8d72-8158dd11ce20"
};

const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const r2 = (v) => Math.round(v * 100) / 100;
const day = (t) => new Date(t).toISOString().slice(0, 10);

function store() {
  const token = process.env.BLOBS_TOKEN;
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID || "828b280b-1240-4bd7-8e01-c7b45549abd5";
  return token ? getStore({ name: "tfb-cache", siteID, token }) : getStore("tfb-cache");
}

/* ---------- Inpulse ---------- */
async function inpulse(endpoint, body, method) {
  const m = (method || "POST").toUpperCase();
  const opts = { method: m, headers: { "x-api-key": process.env.API_KEY, Accept: "application/json", "Content-Type": "application/json" } };
  if (m !== "GET" && m !== "HEAD") opts.body = JSON.stringify(body || {});
  const r = await fetch("https://api.inpulse.ai" + endpoint, opts);
  const t = await r.text();
  let d; try { d = JSON.parse(t); } catch (e) { d = { raw: t }; }
  return { status: r.status, data: d };
}
async function inpulseAll(path) {
  const sep = path.includes("?") ? "&" : "?";
  const first = await inpulse(path + sep + "skip=0&limit=100", null, "GET");
  const out = ((first.data && first.data.data) || []).slice();
  const total = (first.data && first.data.total) || out.length;
  const skips = []; for (let s = 100; s < total; s += 100) skips.push(s);
  const pages = await Promise.all(skips.map((s) => inpulse(path + sep + "skip=" + s + "&limit=100", null, "GET").catch(() => null)));
  pages.forEach((p) => { ((p && p.data && p.data.data) || []).forEach((x) => out.push(x)); });
  return out;
}

/* ---------- TFB OPS ---------- */
async function opsAll(path, params, listKey) {
  const key = process.env.TFB_OPS_API_KEY;
  const out = []; let curseur = null, guard = 0;
  while (guard++ < 40) {
    const q = new URLSearchParams(Object.assign({}, params || {}, curseur ? { curseur } : {}));
    const r = await fetch(OPS_BASE + path + (q.toString() ? "?" + q : ""), { headers: { Authorization: "Bearer " + key, Accept: "application/json" } });
    let b = null; try { b = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error("TFB OPS " + r.status + " " + ((b && (b.erreur || b.error)) || ""));
    ((b && b[listKey]) || []).forEach((x) => out.push(x));
    curseur = b && b.suivant;
    if (!curseur) break;
  }
  return out;
}
function windows() {
  const end = day(Date.now() + 60 * 864e5), W = []; let a = OPS_START;
  while (a <= end) {
    const b0 = day(new Date(a + "T12:00:00Z").getTime() + 91 * 864e5), b = b0 < end ? b0 : end;
    W.push([a, b]); a = day(new Date(b + "T12:00:00Z").getTime() + 864e5);
  }
  return W;
}
const slimCmd = (c) => ({
  id: c.id, numero: c.numero, etat: c.etat, statut_outil: c.statut_outil, reception_partielle: !!c.reception_partielle,
  site: c.site ? { type: c.site.type, code: c.site.code, nom: c.site.nom } : null,
  fournisseur: c.fournisseur ? { id: c.fournisseur.id, nom: c.fournisseur.nom, code: c.fournisseur.code || null } : null,
  passee_par: c.passee_par || null, profil: (c.profil_livraison && c.profil_livraison.nom) || null,
  fichiers: (c.fichiers || []).map((f) => ({ id: f.id, type: f.type, format: f.format, date: f.date || null, reception_id: f.reception_id || null })),
  date_commande: c.date_commande || null, date_livraison_prevue: c.date_livraison_prevue || null, date_reception: c.date_reception || null,
  montants: c.montants || {}, ecarts: (c.ecarts && c.ecarts.lignes) ? c.ecarts.lignes.length : 0,
  pdf: ((c.fichiers || []).find((f) => f.type === "bon_commande") || {}).id || null,
  lignes: (c.lignes || []).map((l) => ({ mp_id: l.mp_id, reference: l.reference, designation: l.designation, unite: l.unite,
    qc: l.quantite_commandee, qr: l.quantite_recue, pu: l.prix_net_ht != null ? l.prix_net_ht : l.prix_ht, taux_tva: l.taux_tva,
    pb: l.prix_ht, remise: l.remise_pct || 0 }))
});
const annulee = (c) => /annul/i.test(String(c.etat || "")) || /annul/i.test(String(c.statut_outil || ""));

/* Etat TFB OPS + referentiels, traduits une fois pour toutes au format Inpulse */
let MEM = null, MEM_AT = 0, SYNC_P = null;
const FICH = {};

async function syncState(prev) {
  const now = Date.now();
  const st = Object.assign({ at: 0, syncAt: null, fullAt: 0, cmd: {}, refAt: 0, sup: {}, sp: {}, cat: {} }, prev || {});
  const full = !st.fullAt || now - st.fullAt > FULL_EVERY;
  const started = new Date().toISOString();
  const W = windows(), todo = full ? W : W.slice(-2);
  for (const [du, au] of todo) {
    const p = { du, au }; if (!full && st.syncAt) p.modifiees_depuis = st.syncAt;
    const list = await opsAll("commandes", p, "commandes");
    if (full) Object.keys(st.cmd).forEach((id) => { const d = st.cmd[id].date_livraison_prevue || ""; if (d >= du && d <= au) delete st.cmd[id]; });
    list.forEach((c) => { if (!c || annulee(c)) { if (c) delete st.cmd[c.id]; return; } st.cmd[c.id] = slimCmd(c); });
  }
  st.at = now; st.syncAt = started; if (full) st.fullAt = now;
  /* referentiels (fournisseurs et matieres Inpulse, categories TFB OPS) : 1 fois par jour */
  if (!st.refAt || now - st.refAt > REF_EVERY) {
    const [sups, sps, mps] = await Promise.all([
      inpulseAll("/public/v2/suppliers"), inpulseAll("/public/v2/supplier-products?withInactive=true"),
      opsAll("matieres-premieres", {}, "matieres_premieres").catch(() => [])
    ]);
    st.sup = {}; sups.forEach((s) => { if (s && s.id) st.sup[norm(s.name)] = { id: s.id, name: s.name, category: s.category || null, active: s.active !== false }; });
    st.sp = {}; sps.forEach((p) => {
      if (!p || !p.supplier) return; const sid = p.supplier.id;
      const v = { id: p.id, pk: (p.packagings || []).map((k) => [k.id, norm(k.name)]) };
      if (p.sku) st.sp[sid + "|S|" + norm(p.sku)] = v;
      if (p.name) st.sp[sid + "|N|" + norm(p.name)] = v;
    });
    st.cat = {}; mps.forEach((m) => { if (m && m.categorie) st.cat[m.id] = String(m.categorie).toUpperCase(); });
    st.refAt = now;
  }
  return st;
}

async function getState(allowSync) {
  const now = Date.now();
  if (MEM && now - MEM_AT < 60000 && (!allowSync || now - MEM.at < EVERY)) return MEM;
  const s = store();
  let st = null; try { st = await s.get(STATE_KEY, { type: "json" }); } catch (e) {}
  if (st) { MEM = st; MEM_AT = now; }
  if (allowSync && process.env.TFB_OPS_API_KEY && (!st || now - st.at > EVERY)) {
    if (!SYNC_P) SYNC_P = (async () => {
      try { const n = await syncState(st); await s.setJSON(STATE_KEY, n).catch(() => {}); MEM = n; MEM_AT = Date.now(); return n; }
      catch (e) { console.warn("sync TFB OPS", e && e.message); return st; }
      finally { SYNC_P = null; }
    })();
    st = (await SYNC_P) || st;
  }
  return st;
}

function mapSupplier(st, f) {
  if (!f) return { id: "ops-f-0", name: "—", category: null, active: true };
  const n = norm(f.nom);
  const hit = st.sup[n] || st.sup[norm(String(f.nom).replace(/\(.*\)/, ""))];
  return hit ? { id: hit.id, name: hit.name, category: hit.category, active: hit.active } : { id: "ops-f-" + f.id, name: f.nom, category: null, active: true };
}
function mapLine(st, sup, l) {
  const hit = st.sp[sup.id + "|S|" + norm(l.reference)] || st.sp[sup.id + "|N|" + norm(l.designation)];
  if (hit) {
    const pk = hit.pk.find((k) => k[1] === norm(l.unite));
    return { spId: hit.id, pkId: pk ? pk[0] : null };
  }
  return { spId: "ops-mp-" + l.mp_id, pkId: "ops-u-" + l.mp_id };
}
function statusOf(c) {
  const o = String(c.statut_outil || ""), e = String(c.etat || "");
  if (/brouillon/i.test(o) || /brouillon/i.test(e)) return "DRAFT";
  if (!c.date_reception) return "SENT";
  if (/reliquat/i.test(o) || c.reception_partielle) return "INCOMPLETE";
  const m = c.montants || {};
  if (c.ecarts > 0 || Math.abs(num(m.recu_ht) - num(m.total_ht)) > 0.01) return "NON_COMPLIANT";
  return "COMPLIANT";
}
function toInpulseOrder(st, c) {
  const storeId = SITE_STORE[String((c.site && c.site.code) || "").toUpperCase()];
  if (!storeId) return null;
  const sup = mapSupplier(st, c.fournisseur);
  const port = num((c.montants || {}).frais_port_ht);
  const recu = !!c.date_reception;
  const totCmd = (c.lignes || []).reduce((a, l) => a + num(l.qc) * num(l.pu), 0) + port;
  const totRec = recu ? (c.lignes || []).reduce((a, l) => a + num(l.qr) * num(l.pu), 0) + port : 0;
  const od = c.date_commande ? new Date(c.date_commande) : null;
  return {
    id: "ops-" + c.id, total: r2(totCmd), storeId, reference: c.numero,
    orderDate: od && !isNaN(od) ? od.toISOString().replace(/\.\d{3}Z$/, "Z") : (c.date_livraison_prevue || "") + "T00:00:00Z",
    orderDay: c.date_commande ? String(c.date_commande).slice(0, 10) : (c.date_livraison_prevue || ""),
    statusName: statusOf(c), deliveryDate: c.date_livraison_prevue || c.date_reception || null, receptionDate: c.date_reception || null,
    purchaseOrderLink: "", purchaseOrderComment: null, receptionReference: null, receptionComment: null,
    creditNoteLink: "", creditNoteComment: null, supplier: sup, totalInvoiced: null, totalReceived: recu ? r2(totRec) : null,
    supplierRangeId: null, supplierRangeName: null,
    sourceOutil: "TFB OPS", opsLabo: !!(c.site && c.site.type && c.site.type !== "boutique")
  };
}
function opsOrders(st, body) {
  if (!st || !st.cmd) return [];
  const ids = new Set((body && body.storeIds) || []);
  const a = String((body && body.startDate) || "").slice(0, 10), b = String((body && body.endDate) || "").slice(0, 10);
  const out = [];
  Object.values(st.cmd).forEach((c) => {
    if ((c.date_livraison_prevue || c.date_reception || "") < OPS_START) return;
    const o = toInpulseOrder(st, c); if (!o) return;
    if (ids.size && !ids.has(o.storeId)) return;
    if (a && o.orderDay < a) return; if (b && o.orderDay > b) return;
    delete o.orderDay; out.push(o);
  });
  return out.sort((x, y) => (x.orderDate < y.orderDate ? -1 : x.orderDate > y.orderDate ? 1 : String(x.id).localeCompare(String(y.id))));
}
function opsLines(st, opsId) {
  const c = st && st.cmd && st.cmd[opsId]; if (!c) return null;
  const sup = mapSupplier(st, c.fournisseur), recu = !!c.date_reception, out = [];
  (c.lignes || []).forEach((l) => {
    const m = mapLine(st, sup, l), pu = num(l.pu);
    out.push({ orderId: "ops-" + c.id, supplierProductId: m.spId,
      orderedQuantity: num(l.qc), orderedPackaging: l.unite || "", orderedPackagingId: m.pkId, orderedPrice: pu,
      invoicedQuantity: null, invoicedPackaging: null, invoicedPackagingId: null, invoicedPrice: null,
      receivedQuantity: recu ? num(l.qr) : null, receivedPrice: recu ? pu : null,
      receivedPackaging: recu ? (l.unite || "") : null, receivedPackagingId: recu ? m.pkId : null, anomalyType: null });
  });
  const port = num((c.montants || {}).frais_port_ht);
  if (port > 0) out.push({ orderId: "ops-" + c.id, supplierProductId: "ops-port-" + ((c.fournisseur || {}).id || 0),
    orderedQuantity: 1, orderedPackaging: "forfait", orderedPackagingId: "ops-u-port", orderedPrice: port,
    invoicedQuantity: null, invoicedPackaging: null, invoicedPackagingId: null, invoicedPrice: null,
    receivedQuantity: recu ? 1 : null, receivedPrice: recu ? port : null, receivedPackaging: recu ? "forfait" : null,
    receivedPackagingId: recu ? "ops-u-port" : null, anomalyType: null });
  return out;
}
/* matieres TFB OPS sans equivalent Inpulse, au format supplier-product */
function opsProducts(st) {
  if (!st || !st.cmd) return [];
  const seen = {};
  Object.values(st.cmd).forEach((c) => {
    if ((c.date_livraison_prevue || c.date_reception || "") < OPS_START) return;
    const sup = mapSupplier(st, c.fournisseur);
    (c.lignes || []).forEach((l) => {
      const m = mapLine(st, sup, l); if (!String(m.spId).startsWith("ops-") || seen[m.spId]) return;
      const cat = st.cat[l.mp_id] || NO_CAT;
      seen[m.spId] = { id: m.spId, sku: l.reference || "", name: l.designation || "", price: num(l.pu), loss: null, active: true,
        vatRate: l.taux_tva != null ? num(l.taux_tva) / 100 : null, category: cat, subCategory: cat, entityId: null, packagingWeight: null,
        supplier: sup, packagings: [{ id: m.pkId, name: l.unite || "", quantity: 1, unit: l.unite || "", parentSupplierProductPackagingId: null,
          isUsedInOrder: true, isUsedInInvoice: true, isUsedInReception: true }], sourceOutil: "TFB OPS" };
    });
    if (num((c.montants || {}).frais_port_ht) > 0) {
      const id = "ops-port-" + ((c.fournisseur || {}).id || 0);
      if (!seen[id]) seen[id] = { id, sku: "PORT", name: "FRAIS DE PORT", price: 0, loss: null, active: true, vatRate: 0.2,
        category: "FRAIS DE PORT", subCategory: "FRAIS DE PORT", entityId: null, packagingWeight: null, supplier: sup,
        packagings: [{ id: "ops-u-port", name: "forfait", quantity: 1, unit: "forfait", parentSupplierProductPackagingId: null,
          isUsedInOrder: true, isUsedInInvoice: true, isUsedInReception: true }], sourceOutil: "TFB OPS" };
    }
  });
  return Object.values(seen).sort((a, b) => a.id.localeCompare(b.id));
}
/* Ajoute la liste TFB OPS a la suite d une page Inpulse paginee (skip / limit / total) */
function topUp(d, extra, endpoint) {
  if (!d || !Array.isArray(d.data) || !extra.length) return d;
  const q = new URLSearchParams(endpoint.split("?")[1] || "");
  const skip = parseInt(q.get("skip") || "0", 10) || 0, limit = parseInt(q.get("limit") || "100", 10) || 100;
  const T = parseInt(d.total, 10) || 0, n = d.data.length;
  if (n < limit && skip + n >= T) {
    const from = Math.max(0, skip + n - T);
    d.data = d.data.concat(extra.slice(from, from + (limit - n)));
  }
  d.total = T + extra.length;
  return d;
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  const API_KEY = process.env.API_KEY;
  if (!API_KEY)
    return { statusCode: 503, headers, body: JSON.stringify({ error: "API_KEY non configuree sur Netlify." }) };

  const OK = ["/public/v2/supplier-products", "/public/v2/suppliers", "/public/v2/ingredients", "/public/v2/orders", "/public/v2/inventories", "/public/v2/stores", "/public/v2/products", "/tfbops/diag", "/tfbops/commande", "/tfbops/fichier"];
  const out = (status, d) => ({ statusCode: status, headers: Object.assign({}, headers, { "Cache-Control": "s-maxage=120, stale-while-revalidate=600" }), body: JSON.stringify(d) });
  try {
    const { endpoint, body, method } = JSON.parse(event.body || "{}");
    if (!endpoint) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing endpoint" }) };
    if (!OK.some(p => endpoint.startsWith(p)))
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Non autorise : " + endpoint }) };
    const path = endpoint.split("?")[0];

    /* diagnostic : etat de la synchro TFB OPS */
    if (path === "/tfbops/diag") {
      const st = await getState(true);
      const cmd = st ? Object.values(st.cmd || {}) : [];
      let lignes = 0, liees = 0; const supKo = {};
      cmd.forEach((c) => { const sup = mapSupplier(st, c.fournisseur); if (String(sup.id).startsWith("ops-")) supKo[sup.name] = 1;
        (c.lignes || []).forEach((l) => { lignes++; if (!String(mapLine(st, sup, l).spId).startsWith("ops-")) liees++; }); });
      return out(200, { cle: !!process.env.TFB_OPS_API_KEY, at: st && st.at, commandes: cmd.length, lignes, lignesLieesInpulse: liees,
        fournisseursSansEquivalent: Object.keys(supKo), sitesInconnus: [...new Set(cmd.filter((c) => !SITE_STORE[String((c.site || {}).code || "").toUpperCase()]).map((c) => (c.site || {}).code))] });
    }

    /* bon de commande TFB OPS reconstitue (le detail de l app l affiche a la place du PDF Inpulse) */
    if (path === "/tfbops/commande") {
      const id = String((body && body.id) || "").replace(/^ops-/, "");
      const st = await getState(false) || await getState(true);
      const c = st && st.cmd && st.cmd[id];
      if (!c) return out(404, { error: "Commande TFB OPS introuvable" });
      return out(200, c);
    }
    /* lien frais vers une photo / un fichier TFB OPS (les liens signes expirent) */
    if (path === "/tfbops/fichier") {
      const fid = String((body && body.id) || "");
      if (!/^\d+$/.test(fid)) return out(400, { error: "id numerique obligatoire" });
      const now = Date.now(), ck = "tfbops-fichier-" + fid;
      let f = FICH[fid];
      if (!f) { try { f = await store().get(ck, { type: "json" }); } catch (e) {} }
      if (!f || !f.exp || f.exp - now < 5 * 60000) {
        const r = await fetch(OPS_BASE + "fichiers?id=" + fid, { headers: { Authorization: "Bearer " + process.env.TFB_OPS_API_KEY, Accept: "application/json" } });
        let b = null; try { b = await r.json(); } catch (e) {}
        if (!r.ok || !b || !b.fichier) return out(r.status === 200 ? 502 : r.status, { error: (b && b.erreur) || "Fichier TFB OPS indisponible" });
        const x = b.fichier;
        f = { url: x.url, type: x.type, format: x.format, nom: x.nom_fichier, date: x.date, exp: x.expire_le ? Date.parse(x.expire_le) : now + 30 * 60000 };
        try { await store().setJSON(ck, f); } catch (e) {}
      }
      FICH[fid] = f;
      return out(200, f);
    }

    /* lignes d une commande TFB OPS */
    const mDet = path.match(/^\/public\/v2\/orders\/ops-(\d+)$/);
    if (mDet) {
      const st = await getState(false) || await getState(true);
      const lines = opsLines(st, mDet[1]);
      if (!lines) return out(404, { error: "Commande TFB OPS introuvable" });
      return out(200, { skip: 0, limit: lines.length, total: lines.length, links: {}, data: lines });
    }

    const isOrderList = path === "/public/v2/orders";
    const isSpList = path === "/public/v2/supplier-products";
    const stP = (isOrderList || isSpList) ? getState(true).catch(() => null) : null;
    const r = await inpulse(endpoint, body, method);
    let d = r.data;
    if (r.status === 200 && stP) {
      const st = await stP;
      if (st) {
        try { d = topUp(d, isOrderList ? opsOrders(st, body) : opsProducts(st), endpoint); }
        catch (e) { console.warn("ajout TFB OPS", e && e.message); }
      }
    }
    return out(r.status, d);
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(err && err.message || err) }) };
  }
};
