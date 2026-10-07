// Total facturé HT = balance comptable Pennylane des comptes d'achats (même règle que le bloc
// « Contrôle comptable » du Bridge Commandes & Factures) :
//   entités LAB + RESEAU, comptes commençant par 601, 6022, 6026, 607, 6061000009, 6062000003,
//   exclus 6013, net = débit − crédit (avoirs et RFA déjà déduits).
// Usage : /api/facture-bridge?start=2026-01-01&end=2026-09-30
// Réponse : total, lab, reseau, et « jours » = net de chaque mois posé sur son dernier jour
// (la balance n'a pas de détail journalier), pour les graphiques mensuels et cumulés.
// Lecture directe de l'API Pennylane avec PENNYLANE_TOKEN_LAB / PENNYLANE_TOKEN_RESEAU
// (mêmes tokens que le Bridge, déclarés sur ce site Netlify).

const PENNYLANE = "https://app.pennylane.com/api/external/v2/";
const TOKENS = { lab: "PENNYLANE_TOKEN_LAB", reseau: "PENNYLANE_TOKEN_RESEAU" };
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
  const token = process.env[TOKENS[entite]];
  if (!token) throw new Error("Variable " + TOKENS[entite] + " absente sur le site tfb-achats");
  let lignes = [], curseur = null;
  for (let i = 0; i < 30; i++) {
    const path = "trial_balance?period_start=" + debut + "&period_end=" + fin + "&limit=100" +
      (curseur ? "&cursor=" + encodeURIComponent(curseur) : "");
    const r = await fetch(PENNYLANE + path, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
    if (!r.ok) throw new Error("Pennylane " + entite + " : HTTP " + r.status);
    const j = await r.json();
    lignes = lignes.concat(j.items || []);
    if (!j.has_more || !j.next_cursor) break;
    curseur = j.next_cursor;
  }
  let s = 0;
  lignes.forEach(function (l) { if (retenu(l.number)) s += (parseFloat(l.debits) || 0) - (parseFloat(l.credits) || 0); });
  return s;
}

// Découpe la période en tranches mensuelles : [début, fin] de chaque mois, bornées par la période.
function tranches(debut, fin) {
  const out = [];
  let y = +debut.slice(0, 4), m = +debut.slice(5, 7);
  for (let i = 0; i < 60; i++) {
    const mm = String(m).padStart(2, "0");
    const der = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const a = y + "-" + mm + "-01", b = y + "-" + mm + "-" + String(der).padStart(2, "0");
    const d = a < debut ? debut : a, f = b > fin ? fin : b;
    if (d > fin) break;
    out.push([d, f]);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json; charset=utf-8" };
  const q = event.queryStringParameters || {};
  const debut = String(q.start || ""), fin = String(q.end || "");
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(debut) || !iso.test(fin) || debut > fin) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "start et end attendus au format AAAA-MM-JJ" }) };
  }
  try {
    const t = tranches(debut, fin);
    const res = { ok: true, start: debut, end: fin, source: "Pennylane · balance comptable (comptes d'achats)", maj: new Date().toISOString(), jours: {} };
    const par = await Promise.all(ENTITES.map(function (e) {
      return Promise.all(t.map(function (tr) { return balance(e, tr[0], tr[1]); }));
    }));
    let total = 0;
    ENTITES.forEach(function (e, ie) {
      let s = 0;
      t.forEach(function (tr, it) {
        const v = par[ie][it];
        s += v;
        const j = res.jours[tr[1]] || (res.jours[tr[1]] = { lab: 0, reseau: 0 });
        j[e] = arrondi(v);
      });
      res[e] = arrondi(s);
      total += s;
    });
    res.total = arrondi(total);
    return {
      statusCode: 200,
      headers: Object.assign({}, headers, { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" }),
      body: JSON.stringify(res)
    };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: String((err && err.message) || err) }) };
  }
};
