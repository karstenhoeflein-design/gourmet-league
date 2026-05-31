export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { query, type } = req.body;
  if (!query) return res.status(400).json({ error: "Missing query" });

  const systemPrompt = type === "nearby"
    ? "You are a restaurant database. Always respond with only a valid JSON array. No explanations, no markdown, no code fences. Start your response with [ and end with ]."
    : "You are a restaurant database. Always respond with only a valid JSON array. No explanations, no markdown, no code fences. Start your response with [ and end with ].";

  const userPrompt = type === "nearby"
    ? `Return 8 real restaurants near coordinates ${query} in Germany (within 1km). JSON array with fields: id, name, city, street, cuisine, priceRange, globalAvg (number 3.0-5.0), globalCount (number), openingHours, website, lat, lng. Use real WGS84 coordinates.`
    : `Return 5 real restaurant locations for "${query}" in Germany as a JSON array. Each object must have: id (string), name (string), city (string), street (string), cuisine (string), priceRange (string, euro signs), globalAvg (number 3.0-5.0), globalCount (number), openingHours (string), website (string), lat (number, real WGS84), lng (number, real WGS84). Use only real locations with accurate coordinates.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "");
    return res.status(response.status).json({ error: "API error: " + err.slice(0, 200) });
  }

  const data = await response.json();
  if (data.type === "error") return res.status(500).json({ error: data.error?.message || "API error" });

  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({ text });
}
