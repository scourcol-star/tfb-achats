// Fiches techniques des matieres — table matiere -> fiches, reconstruite a
// chaque appel depuis l API publique Inpulse avec la cle API deja en place.
//
// Pourquoi cette fonction : le lien de la fiche technique (attachmentLink) est
// porte par l ingredient fournisseur dans Inpulse, mais l API publique v2 ne le
// renvoie pas encore — seule l API interne /v1/admin le fait, et elle exige une
// session utilisateur. Une demande est en cours aupres d Inpulse pour ajouter le
// champ a /public/v2/supplier-products.
//
// D ici la, cette fonction renvoie une table vide et l app se rabat sur le releve
// fige dans data/ft-matieres.json : rien ne bouge. Le jour ou Inpulse expose le
// champ, la table se remplit toute seule, sans rien redeployer.
//
// Le CDN garde la reponse un jour (s-maxage), donc au plus un balayage du
// catalogue par jour et par region : une FT ajoutee dans Inpulse apparait dans
// l app le lendemain au plus tard.

const API = "https://api.inpulse.ai";
const PAGE = 100;

/* Le tableau Par matiere regroupe sur le libelle : meme normalisation des deux
   cotes, sinon une espace en trop suffit a perdre la correspondance. */
function cle(n) {
  return String(n == null ? "" : n).trim().toUpperCase().replace(/\s+/g, " ");
}

/* Nom du champ encore a confirmer cote Inpulse : on accepte les variantes
   plausibles plutot que de dependre d une seule orthographe. */
function lienFiche(x) {
  return x.attachmentLink || x.attachment || x.technicalSheetLink || x.documentLink || "";
}

exports.handler = async () => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800"
  };
  const bref = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json", "Cache-Control": "public, s-maxage=300" };

  const API_KEY = process.env.API_KEY;
  if (!API_KEY) {
    return { statusCode: 200, headers: bref, body: JSON.stringify({ m: {}, erreur: "API_KEY non configuree" }) };
  }

  const page = async (skip) => {
    const r = await fetch(API + "/public/v2/supplier-products?withInactive=true&skip=" + skip + "&limit=" + PAGE, {
      headers: { "x-api-key": API_KEY, Accept: "application/json" }
    });
    if (!r.ok) throw new Error("supplier-products skip=" + skip + " -> HTTP " + r.status);
    return r.json();
  };

  try {
    /* Premiere page pour connaitre le total, le reste en parallele : le
       catalogue tient en une douzaine d appels, on reste loin du delai. */
    const p0 = await page(0);
    const total = Number(p0.total) || (p0.data || []).length;
    const suite = [];
    for (let skip = PAGE; skip < total; skip += PAGE) suite.push(page(skip));
    const pages = [p0].concat(await Promise.all(suite));

    const m = {};
    let fiches = 0, references = 0;
    pages.forEach(function (p) {
      (p.data || []).forEach(function (x) {
        references++;
        const url = lienFiche(x);
        if (!url) return;
        const k = cle(x.name);
        if (!k) return;
        const sup = (x.supplier && x.supplier.name) || "";
        (m[k] = m[k] || []).push([sup, url]);
        fiches++;
      });
    });
    /* Un meme document peut etre attache a plusieurs references d une matiere :
       une seule entree par URL, sinon l apercu affiche deux fois le meme onglet. */
    Object.keys(m).forEach(function (k) {
      const vu = {};
      m[k] = m[k].filter(function (e) { return vu[e[1]] ? false : (vu[e[1]] = true); });
    });

    return {
      statusCode: 200,
      headers: fiches ? headers : bref,   /* tant que le champ manque, on reessaie souvent */
      body: JSON.stringify({
        p: "",                 /* les liens renvoyes par l API sont absolus */
        m: m,
        matieres: Object.keys(m).length,
        fiches: fiches,
        references: references,
        champExpose: fiches > 0,
        releve: new Date().toISOString()
      })
    };
  } catch (err) {
    /* Inpulse injoignable : on ne renvoie rien plutot qu une table tronquee,
       l app garde le releve fige. */
    return { statusCode: 200, headers: bref, body: JSON.stringify({ m: {}, erreur: String((err && err.message) || err) }) };
  }
};
