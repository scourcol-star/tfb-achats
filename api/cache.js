import { put, list } from '@vercel/blob';

// Cache partage via Vercel Blob, authentifie par OIDC (pas de jeton en dur).
// Blobs en acces 'public' mais lus uniquement cote serveur (URL jamais exposee au client).
// GET => renvoie l'instantane (gzip base64) ; POST => l'enregistre.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const key = String(req.query.key || 'default').replace(/[^a-z0-9_-]/gi, '');
  const path = `tfb-cache/${key}.json.gz`;

  try {
    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: path, limit: 10 });
      const b = blobs.find(x => x.pathname === path) || blobs[0];
      if (!b) return res.status(200).json({ dataB64: null });
      let resp = await fetch(b.downloadUrl || b.url, { cache: 'no-store' });
      if (!resp.ok && b.url) resp = await fetch(b.url, { cache: 'no-store' });
      if (!resp.ok) return res.status(502).json({ error: 'Lecture blob ' + resp.status });
      const ab = await resp.arrayBuffer();
      const buf = Buffer.from(ab);
      return res.status(200).json({ dataB64: buf.toString('base64'), updatedAt: b.uploadedAt, size: buf.length });
    }

    if (req.method === 'POST') {
      const dataB64 = req.body && req.body.dataB64;
      if (!dataB64) return res.status(400).json({ error: 'dataB64 manquant' });
      const buf = Buffer.from(dataB64, 'base64');
      const saved = await put(path, buf, { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/octet-stream' });
      return res.status(200).json({ ok: true, size: buf.length, hasUrl: saved && saved.url ? 1 : 0 });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message || err) });
  }
}
