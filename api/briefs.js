module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_KEY not set' });

  const { newsItems } = req.body || {};
  if (!newsItems || !newsItems.length) return res.status(400).json({ error: 'No news items' });

  // Process up to 12 stories
  const batch = newsItems.slice(0, 12);
  const input = batch.map((item, i) => ({
    i,
    h: item.headline,
    s: (item.summary || '').slice(0, 200),
    cat: item._cat || 'general',
  }));

  const prompt = `You are a financial analyst. Analyze these ${input.length} financial news headlines and return trade intelligence.

Return ONLY a valid JSON array. No markdown, no explanation, just the array.

Each object must have:
{"i":<index>,"impact":"bearish|bullish|mixed","category":"geopolitical|macro|earnings|commodities|crypto|forex|merger|general","oneLiner":"<under 12 words describing market impact>","plays":[{"direction":"LONG|SHORT|COMMODITY","ticker":"<US ticker symbol>","name":"<company or ETF name>","rationale":"<one sentence why>","conviction":<1|2|3>,"type":"equity|etf|commodity|crypto|bond"}]}

Rules:
- 1-2 plays per story max
- conviction: 1=low, 2=medium, 3=high
- Use real US-listed tickers only
- oneLiner must be market-impact focused

NEWS TO ANALYZE:
${JSON.stringify(input)}

Return the JSON array now:`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error?.message || `Claude HTTP ${r.status}`);
    }

    const data = await r.json();
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();

    let parsed = null;
    const match = clean.match(/\[[\s\S]*\]/);
    if (match) { try { parsed = JSON.parse(match[0]); } catch(e) {} }
    if (!parsed) {
      const s = clean.indexOf('['), e = clean.lastIndexOf(']');
      if (s !== -1 && e > s) { try { parsed = JSON.parse(clean.slice(s, e+1)); } catch(e) {} }
    }
    if (!parsed) throw new Error('Could not parse Claude response as JSON');

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
