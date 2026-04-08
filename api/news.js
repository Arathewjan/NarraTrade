module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');
  const KEY = process.env.FINNHUB_KEY || 'd0o3b09r01qi0jaoe3ogd0o3b09r01qi0jaoe3p0';
  const cats = ['general', 'forex', 'crypto', 'merger'];
  const catMap = { general: 'general', forex: 'macro', crypto: 'crypto', merger: 'merger' };
  try {
    const results = await Promise.all(
      cats.map(cat =>
        fetch('https://finnhub.io/api/v1/news?category=' + cat + '&minId=0&token=' + KEY)
          .then(r => r.json())
          .catch(() => [])
      )
    );
    const seen = new Set();
    const items = [];
    results.forEach((arr, ci) => {
      (Array.isArray(arr) ? arr : []).slice(0, 8).forEach(a => {
        if (!a.headline || seen.has(a.id)) return;
        seen.add(a.id);
        items.push({
          id: a.id,
          headline: a.headline,
          summary: (a.summary || '').slice(0, 180),
          source: a.source,
          url: a.url,
          datetime: a.datetime,
          _cat: catMap[cats[ci]] || 'general',
        });
      });
    });
    items.sort((a, b) => b.datetime - a.datetime);
    res.status(200).json(items.slice(0, 20));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};