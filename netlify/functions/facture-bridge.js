// Total facturé HT : balance des comptes d'achats Pennylane, lue via le Bridge Commandes & Factures.
// Même règle que le bloc « Contrôle comptable » du Bridge (balance comptes achats) :
//   entités LAB + RESEAU, comptes commençant par 601, 6022, 6026, 607, 6061000009, 6062000003,
//   exclus 6013, net = débit − crédit (avoirs et RFA déjà déduits).
// Usage : /api/facture-bridge?start=2026-09-01&end=2026-09-30
// Les tokens Pennylane restent sur le site Bridge : on passe par son proxy /api/pennylane.

const BRIDGE = (process.env.BRIDGE_URL || "https://bridge-commandes-factures.netlify.app").replace(/\/+$/, "");
const ENTITES = ["lab", "reseau"];
const PREFIXES = ["601", "6022", "6026", "607", "6061000009", "6062000003"];
const EXCLUS = ["6013"];

function retenu(numero) {
  const n = String(numero || "");
  if (EXCLUS.some(function (p) { return n.indexOf(p) === 0; })) return false;
  return PREFIXES.some(function (p) { return n.indexOf(p) === 0; });
}

function arrondi(v) { return Math.round(v * 100) / 100; }

async function balance(entite, debut, fin) {
  let lignes = [];
  let curseur = null;
  for (let i = 0; i < 30; i++) {
    const path = "trial_balance?period_start=" + debut + "&period_end=" + fin + "&limit=100" +
      (curseur ? "&cursor=" + encodeURIComponent(curseur) : "");
    const r = await fetch(BRIDGE + "/api/pennylane?entity=" + entite + "&path=" + encodeURIComponent(path));
    if (!r.ok) throw new Error("Bridge " + entite + " : HTTP " + r.status);
    const j = await r.json();
    lignes = lignes.concat(j.items || []);
    if (!j.has_more || !j.next_cursor) break;
    curseur = j.next_cursor;
  }
  return lignes;
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
    const parEntite = {};
    const comptes = [];
    let total = 0;
    const resultats = await Promise.all(ENTITES.map(function (e) { return balance(e, debut, fin); }));
    ENTITES.forEach(function (e, idx) {
      let s = 0;
      resultats[idx].forEach(function (l) {
        if (!retenu(l.number)) return;
        const net = (parseFloat(l.debits) || 0) - (parseFloat(l.credits) || 0);
        s += net;
        comptes.push({ entite: e, compte: String(l.number), libelle: l.label || "", net: arrondi(net) });
      });
      parEntite[e] = arrondi(s);
      total += s;
    });
    return {
      statusCode: 200,
      headers: Object.assign({}, headers, { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" }),
      body: JSON.stringify({ ok: true, start: debut, end: fin, total: arrondi(total), lab: parEntite.lab, reseau: parEntite.reseau, comptes: comptes })
    };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: String((err && err.message) || err) }) };
  }
};
