// api/sheet.js — Lecture du CA HT depuis le Google Sheet "DATA DAILY".
// Accès PRIVÉ via un compte de service Google (aucun token de session qui expire,
// aucune publication du Sheet). Le client n'appelle JAMAIS Google directement :
// il interroge cette route same-origin, déjà protégée par le Basic Auth du middleware.
//
// Variable d'environnement requise sur Vercel :
//   GOOGLE_SERVICE_ACCOUNT = le JSON complet de la clé du compte de service
//   (celui qui contient "client_email" et "private_key").
// Le compte de service doit avoir un accès LECTURE au Sheet (partager le doc avec
// son adresse e-mail ...@...iam.gserviceaccount.com, droit "Lecteur").
//
// Renvoie : { ok, byCodeMonth: { CODE: { "YYYY-MM": caHT } }, lastDay, codes, tabs }

import crypto from "crypto";

const SHEET_ID = "1mVLfqmBngMxzUdFAr8OStN3rozJ2LoEbwkStPgeRk5w";

// Les 2 onglets demandés (gid -> rôle). On lit l'historique PUIS le courant :
// en cas de chevauchement de dates, l'onglet "courant" (2026+) fait foi.
const GID_ROLE = { "822027506": "hist", "1810251601": "cur" };

// Colonnes 5..22 (index 4..21) du Sheet -> code boutique, dans l'ordre exact de l'en-tête.
const CODES = ["OB","SD","SF","PG","SV","TP","LBA","NE","LV","LNV","RB","LIL3","LP","BC","PP","BCJ","BDJ","BGH"];
const FIRST_CODE_COL = 4; // colonne de la 1re boutique (après n° semaine, an-semaine, jour, date)
const DATE_COL = 3;

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = b64url(JSON.stringify(header)) + "." + b64url(JSON.stringify(claim));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = b64url(signer.sign((sa.private_key || "").replace(/\\n/g, "\n")));
  const assertion = unsigned + "." + signature;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("Échec OAuth Google : " + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

// "5 471,37 €" / "1 853,06 €" / "" -> 5471.37 / ... / 0
function parseEur(s) {
  if (s == null) return 0;
  let t = String(s).replace(/[\u00a0\u202f\s]/g, "").replace(/€/g, "").replace(/\./g, "").replace(",", ".");
  const v = parseFloat(t);
  return isNaN(v) ? 0 : v;
}

// "18-01-2026" ou "01/06/2023" -> "2026-01-18"
function isoDate(d) {
  const m = String(d).trim().match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
  if (!m) return null;
  return m[3] + "-" + m[2] + "-" + m[1];
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
    if (!raw) return res.status(503).json({ error: "GOOGLE_SERVICE_ACCOUNT non configuré sur Vercel." });

    let sa;
    try { sa = JSON.parse(raw); }
    catch (e) { return res.status(500).json({ error: "GOOGLE_SERVICE_ACCOUNT n'est pas un JSON valide." }); }

    const token = await getAccessToken(sa);
    const auth = { Authorization: "Bearer " + token };

    // 1) Résoudre gid -> titre d'onglet (robuste si l'onglet est renommé)
    const meta = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties(sheetId,title)`,
      { headers: auth }
    ).then((r) => r.json());
    if (meta.error) return res.status(502).json({ error: "Sheets meta: " + (meta.error.message || "") });

    const gidToTitle = {};
    (meta.sheets || []).forEach((s) => { gidToTitle[String(s.properties.sheetId)] = s.properties.title; });

    const titleToRole = {};
    const ranges = [];
    for (const gid of Object.keys(GID_ROLE)) {
      const title = gidToTitle[gid];
      if (!title) continue;
      titleToRole[title] = GID_ROLE[gid];
      ranges.push("'" + title.replace(/'/g, "''") + "'");
    }
    if (!ranges.length) return res.status(404).json({ error: "Onglets introuvables (gid). Vérifie le partage du Sheet avec le compte de service." });

    // 2) Lire les valeurs des 2 onglets (valeurs formatées => "5 471,37 €")
    const qs = ranges.map((t) => "ranges=" + encodeURIComponent(t)).join("&") + "&valueRenderOption=FORMATTED_VALUE";
    const vr = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchGet?${qs}`,
      { headers: auth }
    ).then((r) => r.json());
    if (vr.error) return res.status(502).json({ error: "Sheets values: " + (vr.error.message || "") });

    const byRole = {};
    (vr.valueRanges || []).forEach((vrr) => {
      const title = String(vrr.range || "").split("!")[0].replace(/^'|'$/g, "").replace(/''/g, "'");
      byRole[titleToRole[title]] = vrr.values || [];
    });

    // 3) CA quotidien par code (hist d'abord, cur écrase en cas de doublon de date)
    const daily = {}; // iso -> { code: caHT }
    for (const role of ["hist", "cur"]) {
      const rows = byRole[role] || [];
      for (const row of rows) {
        const iso = isoDate(row[DATE_COL]);
        if (!iso) continue;
        let any = false;
        const tmp = daily[iso] || {};
        for (let i = 0; i < CODES.length; i++) {
          const v = parseEur(row[FIRST_CODE_COL + i]);
          if (v) { tmp[CODES[i]] = v; any = true; }
        }
        if (any) daily[iso] = tmp; // ignore les lignes futures vides (sinon lastDay = 28/12/2032)
      }
    }

    // 4) Agrégation mensuelle par code
    const byCodeMonth = {};
    const isoDays = Object.keys(daily).sort();
    for (const iso of isoDays) {
      const month = iso.slice(0, 7);
      const obj = daily[iso];
      for (const code in obj) {
        if (!byCodeMonth[code]) byCodeMonth[code] = {};
        byCodeMonth[code][month] = (byCodeMonth[code][month] || 0) + obj[code];
      }
    }

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
    return res.status(200).json({
      ok: true,
      byCodeMonth,
      codes: CODES,
      lastDay: isoDays.length ? isoDays[isoDays.length - 1] : null,
      tabs: Object.fromEntries(Object.entries(GID_ROLE).map(([g, r]) => [g, { role: r, title: gidToTitle[g] || null, rows: (byRole[r] || []).length }])),
    });
  } catch (err) {
    return res.status(500).json({ error: String((err && err.message) || err) });
  }
}
