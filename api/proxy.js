export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const API_KEY = process.env.API_KEY;

  try {
    const { endpoint, body, method } = req.body;
    if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });
    const OK = ["/public/v2/orders","/public/v2/inventories","/public/v2/stores","/public/v2/supplier-products","/public/v2/suppliers","/public/v2/ingredients","/public/v2/products"];

    if (!OK.some(p => endpoint.startsWith(p)))
      return res.status(403).json({ error: "Non autorise: " + endpoint });
    const url = "https://api.inpulse.ai" + endpoint;
    const headers = { "x-api-key": API_KEY, "Accept": "application/json", "Content-Type": "application/json" };


    const m = (method || "POST").toUpperCase();
    const opts = { method: m, headers };
    if (m !== "GET" && m !== "HEAD") opts.body = JSON.stringify(body||{});
    const r = await fetch(url, opts);
    const t = await r.text();
    let d; try { d = JSON.parse(t); } catch(e) { d = { raw: t }; }
    return res.status(r.status).json(d);
  } catch(err) { return res.status(500).json({ error: err.message }); }
}
