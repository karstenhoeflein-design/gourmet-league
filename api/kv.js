import { put, list } from '@vercel/blob';

export const config = { maxDuration: 15 };

function blobPath(key) {
  const [type, ...rest] = key.split(':');
  const id = rest.join('_').replace(/[^a-zA-Z0-9._@-]/g, '_');
  return `gl/${type}/${id}.json`;
}

async function blobGet(key) {
  const { blobs } = await list({ prefix: blobPath(key), limit: 1, token: process.env.BLOB_READ_WRITE_TOKEN });
  if (!blobs.length) return null;
  const res = await fetch(blobs[0].url + '?t=' + Date.now()); // bypass CDN cache
  if (!res.ok) return null;
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function blobSet(key, value) {
  const content = typeof value === 'string' ? value : JSON.stringify(value);
  await put(blobPath(key), content, {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: "Blob store not configured" });
  }

  try {
    if (req.method === 'GET') {
      const { key } = req.query;
      if (!key) return res.status(400).json({ error: 'Missing key' });
      const result = await blobGet(key);
      return res.status(200).json({ result: result ?? null });
    }

    if (req.method === 'POST') {
      const { key, value } = req.body;
      if (!key || value === undefined) return res.status(400).json({ error: 'Missing key or value' });
      await blobSet(key, value);
      return res.status(200).json({ result: 'OK' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Blob error' });
  }
}
