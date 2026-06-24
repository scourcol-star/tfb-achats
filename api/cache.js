import { put, list } from '@vercel/blob';

// Endpoint de cache partage : stocke un "instantane" (gzip, encode base64)
// dans Vercel Blob. GET => renvoie l'instantane ; POST => l'enregistre.
// Protege par le Basic Auth du middleware (comme le reste du site).

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return res.status(503).json({ error: 'Blob non configure (BLOB_READ_WRITE_TOKEN absent)' });

  const key = String(req.query.key || 'default').replace(/[^a-z0-9_-]/gi, '');
  const path = `tfb-cache/${key}.json.gz`;

  try {
    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: path, token, limit: 10 });
      const b = blobs.find(x => x.pathname === path) || blobs[0];
      if (!b) return res.status(200).json({ dataB64: null });
      let resp = await fetch(b.url, { headers: { authorization: 'Bearer ' + token }, cache: 'no-store' });
      if (!resp.ok) resp = await fetch(b.url, { cache: 'no-store' });
      if (!resp.ok) return res.status(502).json({ error: 'Lecture blob ' + resp.status });
      const buf = Buffer.from(await resp.arrayBuffer());
      return res.status(200).json({ dataB64: buf.toString('base64'), updatedAt: b.uploadedAt, size: buf.length });
    }

    if (req.method === 'POST') {
      const dataB64 = req.body && req.body.dataB64;
      if (!dataB64) return res.status(400).json({ error: 'dataB64 manquant' });
      const buf = Buffer.from(dataB64, 'base64');
      const opts = { token, addRandomSuffix: false, allowOverwrite: true, contentType: 'application/octet-stream' };
      let saved;
      try {
        saved = await put(path, buf, { access: 'public', ...opts });
      } catch (e1) {
        saved = await put(path, buf, { access: 'private', ...opts });
      }
      return res.status(200).json({ ok: true, size: buf.length, url: saved && saved.url ? 1 : 0 });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message || err) });
  }
}
