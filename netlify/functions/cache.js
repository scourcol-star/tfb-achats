const { getStore } = require("@netlify/blobs");
exports.handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  const key = String((event.queryStringParameters && event.queryStringParameters.key) || "default").replace(/[^a-z0-9_-]/gi, "");
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID || "828b280b-1240-4bd7-8e01-c7b45549abd5";
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const storeOpts = token ? { siteID: siteID, token: token } : undefined;
  const store = storeOpts ? getStore("tfb-cache", storeOpts) : getStore("tfb-cache");
  try {
    if (event.httpMethod === "GET") {
      const buf = await store.get(key, { type: "arrayBuffer" });
      if (!buf) return { statusCode: 200, headers, body: JSON.stringify({ dataB64: null }) };
      const b64 = Buffer.from(buf).toString("base64");
      return { statusCode: 200, headers, body: JSON.stringify({ dataB64: b64, size: buf.byteLength }) };
    }
    if (event.httpMethod === "POST") {
      const parsed = JSON.parse(event.body || "{}");
      const dataB64 = parsed.dataB64;
      if (!dataB64) return { statusCode: 400, headers, body: JSON.stringify({ error: "dataB64 manquant" }) };
      const buf = Buffer.from(dataB64, "base64");
      await store.set(key, buf);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, size: buf.length }) };
    }
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String((err && err.message) || err) }) };
  }
};
