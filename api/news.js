export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const FINNHUB_KEY = process.env.FINNHUB_KEY;
  const cats = ['general', 'forex', 'crypto', 'merger'];

  try {
    const results = await Promise.all(cats.map(async (cat) => {
      const r = await fetch(
        `https://finnhub.io/api/v1/news?category=${cat}&token=${FINNHUB_KEY}`
      );
      if (!r.ok) return [];
      const items = await r.json();
      return Array.isArray(items) ? items.map(i => ({ ...i, _cat: cat })) : [];
    }));

    const seen = new Set();
    const merged = results.flat()
      .filter(i => i.id && i.headline && i.headline.length > 10)
      .filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; })
      .sort((a, b) => (b.datetime || 0) - (a.datetime || 0))
      .slice(0, 8);

    return res.status(200).json(merged);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
