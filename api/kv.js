import { kv } from '@vercel/kv';

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: "KV not configured" });
  }

  try {
    if (req.method === 'GET') {
      const { key } = req.query;
      if (!key) return res.status(400).json({ error: 'Missing key' });
      const result = await kv.get(key);
      return res.status(200).json({ result: result ?? null });
    }

    if (req.method === 'POST') {
      const { key, value } = req.body;
      if (!key || value === undefined) return res.status(400).json({ error: 'Missing key or value' });
      await kv.set(key, value);
      return res.status(200).json({ result: 'OK' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'KV error' });
  }
}
