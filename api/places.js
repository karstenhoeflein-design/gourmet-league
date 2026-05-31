export const config = { maxDuration: 30 };

const NOM = "https://nominatim.openstreetmap.org";
const HEADERS = { "User-Agent": "GourmetLeague/1.0 (gourmet-league-v2.vercel.app)" };

async function nominatim(params) {
  const url = NOM + "/search?" + new URLSearchParams({ format: "json", addressdetails: "1", ...params });
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error("Nominatim " + r.status);
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { type, q, lat, lon } = req.query;

  try {
    if (type === "search") {
      const params = { q, limit: "50", countrycodes: "de" };
      if (req.query.viewbox) { params.viewbox = req.query.viewbox; params.bounded = "0"; }
      const data = await nominatim(params);
      return res.status(200).json(data);
    }

    if (type === "nearby") {
      const la = parseFloat(lat), lo = parseFloat(lon);
      const d = 0.022;
      const viewbox = `${lo - d},${la - d},${lo + d},${la + d}`;
      const base = { viewbox, bounded: "1", limit: "20" };
      const [restaurants, fastFood] = await Promise.all([
        nominatim({ amenity: "restaurant", ...base }),
        nominatim({ amenity: "fast_food", ...base }),
      ]);
      return res.status(200).json([...restaurants, ...fastFood]);
    }

    res.status(400).json({ error: "Invalid type" });
  } catch (e) {
    res.status(500).json({ error: e.message || "Server error" });
  }
}
