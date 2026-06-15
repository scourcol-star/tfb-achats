export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const API_KEY = "ff208363f525768982e1fb37199c6e162fdbcf25";
  const DS_TOKEN = "6rcnozCLcroMY1RXINaAwXj2cqXp2qFMU3xlsoeoW4kueQzHxOwzJcoSb3DFxboN";
  try {
    const { endpoint, body } = req.body;
    if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });
    const isProductOrders = endpoint.startsWith("/v1/order/ProductOrders") || endpoint.startsWith("/v1/stocks/inventories");
    const OK = ["/public/v2/orders","/v1/stores","/v1/suppliers"];
    if (!isProductOrders && !OK.some(p => endpoint.startsWith(p)))
      return res.status(403).json({ error: "Non autorise: " + endpoint });
    const url = isProductOrders ? "https://api.deepsight.io"+endpoint : "https://api.inpulse.ai"+endpoint;
    const headers = isProductOrders
      ? { "Authorization": DS_TOKEN, "Accept": "application/json", "Content-Type": "application/json" }
      : { "x-api-key": API_KEY, "Accept": "application/json", "Content-Type": "application/json" };
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body||{}) });
    const t = await r.text();
    let d; try { d = JSON.parse(t); } catch(e) { d = { raw: t }; }
    return res.status(r.status).json(d);
  } catch(err) { return res.status(500).json({ error: err.message }); }
}
