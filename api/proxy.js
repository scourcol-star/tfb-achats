export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const API_KEY = process.env.API_KEY;
  const DS_TOKEN = process.env.DS_TOKEN;
  try {
    const { endpoint, body, method } = req.body;
    if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });
    const isProductOrders = endpoint.startsWith("/v1/order/ProductOrders") || endpoint.startsWith("/v1/order/orders") || endpoint.startsWith("/v1/stocks/inventories") || endpoint.startsWith("/v1/admin/suppliers/");
    const OK = ["/public/v2/orders","/v1/stores","/v1/suppliers","/public/v2/supplier-products","/public/v2/suppliers","/public/v2/ingredients"];
    if (!isProductOrders && !OK.some(p => endpoint.startsWith(p)))
      return res.status(403).json({ error: "Non autorise: " + endpoint });
    const url = isProductOrders ? "https://api.deepsight.io"+endpoint : "https://api.inpulse.ai"+endpoint;
    const headers = isProductOrders
      ? { "Authorization": DS_TOKEN, "Accept": "application/json", "Content-Type": "application/json" }
      : { "x-api-key": API_KEY, "Accept": "application/json", "Content-Type": "application/json" };
    const m = (method || "POST").toUpperCase();
    const opts = { method: m, headers };
    if (m !== "GET" && m !== "HEAD") opts.body = JSON.stringify(body||{});
    const r = await fetch(url, opts);
    const t = await r.text();
    let d; try { d = JSON.parse(t); } catch(e) { d = { raw: t }; }
    return res.status(r.status).json(d);
  } catch(err) { return res.status(500).json({ error: err.message }); }
}
