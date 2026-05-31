export const config = { maxDuration: 30 };

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

async function queryOverpass(oql) {
  const body = "data=" + encodeURIComponent(oql);
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(url, { method: "POST", body, signal: controller.signal });
      clearTimeout(timer);
      if (r.ok) return await r.json();
    } catch {}
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { type, q, lat, lon } = req.query;

  try {
    if (type === "search") {
      const url = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams({
        q, format: "json", limit: "20", countrycodes: "de", addressdetails: "1",
      });
      const r = await fetch(url, { headers: { "User-Agent": "GourmetLeague/1.0 (gourmet-league-v2.vercel.app)" } });
      if (!r.ok) return res.status(r.status).json({ error: "Nominatim error" });
      return res.status(200).json(await r.json());
    }

    if (type === "nearby") {
      const oql = `[out:json][timeout:8];node["amenity"="restaurant"](around:2000,${parseFloat(lat)},${parseFloat(lon)});out tags 25;`;
      const data = await queryOverpass(oql);
      if (!data) return res.status(503).json({ elements: [] });
      return res.status(200).json(data);
    }

    res.status(400).json({ error: "Invalid type" });
  } catch (e) {
    res.status(500).json({ error: e.message || "Server error" });
  }
}
