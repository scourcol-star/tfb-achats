// Agregation cote serveur : l'API Inpulse pagine par 100 et ne filtre pas par
// categorie. On parcourt donc les pages ici (1 seul appel depuis le navigateur)
// et on ne renvoie que les references PACKAGING, reduites aux champs utiles.
const PAGE = 100;
const MAX_PAGES = 30;

exports.handler = async () => {
  const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  const API_KEY = process.env.API_KEY;
  if (!API_KEY)
    return { statusCode: 503, headers, body: JSON.stringify({ error: "API_KEY non configuree sur Netlify." }) };

  const auth = { "x-api-key": API_KEY, Accept: "application/json" };
  try {
    let rows = [], total = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = "https://api.inpulse.ai/public/v2/supplier-products?limit=" + PAGE + "&skip=" + page * PAGE;
      const r = await fetch(url, { headers: auth });
      if (!r.ok) throw new Error("Inpulse HTTP " + r.status);
      const d = await r.json();
      const batch = d.data || [];
      if (total === null) total = d.total;
      rows = rows.concat(batch);
      if (batch.length < PAGE) break;
    }

    const data = rows
      .filter(x => x && x.category === "PACKAGING")
      .map(x => {
        const p = (x.packagings || []).find(q => q.isUsedInOrder) || (x.packagings || [])[0] || {};
        return {
          name: String(x.name || "").trim(),
          sku: String(x.sku || "").trim(),
          price: x.price == null ? null : Number(x.price),
          active: !!x.active,
          category: x.category,
          subCategory: x.subCategory,
          supplier: (x.supplier && x.supplier.name) || "",
          packaging: { name: String(p.name || "").trim(), quantity: p.quantity == null ? null : Number(p.quantity), unit: p.unit || "" }
        };
      });

    return {
      statusCode: 200,
      headers: Object.assign({}, headers, { "Cache-Control": "s-maxage=300, stale-while-revalidate=900" }),
      body: JSON.stringify({ ok: true, scanned: rows.length, total, count: data.length, data })
    };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: String((err && err.message) || err) }) };
  }
};
