export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const FINNHUB_KEY = process.env.FINNHUB_KEY;
  if (!FINNHUB_KEY) return res.status(500).json({ error: 'FINNHUB_KEY not set' });

  const cats = ['general', 'forex', 'crypto', 'merger'];

  try {
    const results = await Promise.all(cats.map(async (cat) => {
      const r = await fetch(
        `https://finnhub.io/api/v1/news?category=${cat}&token=${FINNHUB_KEY}`,
        { headers: { 'User-Agent': 'NarraTrade/1.0' } }
      );
      if (!r.ok) return [];
      const items = await r.json();
      return Array.isArray(items) ? items.map(i => ({ ...i, _cat: cat })) : [];
    }));

    const cutoff = Math.floor(Date.now() / 1000) - 86400;
    const seen = new Set();
    const merged = results.flat()
      .filter(i => i.id && i.headline && i.headline.length > 10)
      .filter(i => !i.datetime || i.datetime > cutoff)
      .filter(i => {
        const key = i.id || i.headline;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => (b.datetime || 0) - (a.datetime || 0))
      .slice(0, 12);

    return res.status(200).json(merged);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
