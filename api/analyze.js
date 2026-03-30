export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
  const { headline, summary, impact, category, plays } = req.body || {};

  const tickers = (plays || []).map(p => `${p.ticker} (${p.direction})`).join(', ');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 700,
        messages: [{
          role: 'user',
          content: `You are a senior macro hedge fund analyst. A real news wire published this story:

HEADLINE: ${headline}
SUMMARY: ${summary}
IMPACT: ${impact} | CATEGORY: ${category}
TRADE PLAYS: ${tickers}

Write a sharp 5-6 sentence deep-dive covering:
1. Second and third-order market effects most traders will miss
2. Which specific play has the best risk/reward and the exact mechanism why
3. The key risk that would invalidate these trades
4. Time horizon: intraday / swing (days-weeks) / position (months)
5. Any correlated assets worth watching

Be surgical and specific. Prose only, no bullet points, no headers.`,
        }],
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error?.message || `Claude HTTP ${r.status}`);
    }

    const data = await r.json();
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');

    return res.status(200).json({ analysis: text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
