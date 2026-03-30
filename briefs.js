export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
  const { newsItems } = req.body || {};

  if (!newsItems || !newsItems.length) {
    return res.status(400).json({ error: 'No news items' });
  }

  const batch = newsItems.slice(0, 4);
  const input = batch.map((item, i) => ({
    i,
    h: item.headline,
    s: (item.summary || '').slice(0, 150),
  }));

  const prompt = `Analyze these ${input.length} financial news headlines. Return ONLY a JSON array starting with [ and ending with ].

Each object: {"i":<index>,"impact":"bearish|bullish|mixed","category":"geopolitical|macro|earnings|commodities|crypto|forex|merger|general","oneLiner":"<10 words on market impact>","plays":[{"direction":"LONG|SHORT|COMMODITY","ticker":"<ticker>","name":"<name>","rationale":"<one sentence>","conviction":<1|2|3>,"type":"equity|etf|commodity|crypto|bond"}]}

2 plays per story max. No markdown. Only the JSON array.

NEWS: ${JSON.stringify(input)}`;

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
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error?.message || `Claude HTTP ${r.status}`);
    }

    const data = await r.json();
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');

    let parsed = null;
    const match = text.replace(/```json|```/g, '').trim().match(/\[[\s\S]*\]/);
    if (match) { try { parsed = JSON.parse(match[0]); } catch(e) {} }
    if (!parsed) {
      const s = text.indexOf('['), e = text.lastIndexOf(']');
      if (s !== -1 && e > s) { try { parsed = JSON.parse(text.slice(s, e+1)); } catch(e) {} }
    }
    if (!parsed) throw new Error('No valid JSON from Claude');

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
