module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_KEY not set' });

  const { headline, summary, impact, category, plays } = req.body || {};
  if (!headline) return res.status(400).json({ error: 'No headline provided' });

  const prompt = `You are a senior financial analyst. Provide a deep analysis of this news event for traders.

HEADLINE: ${headline}
SUMMARY: ${summary || 'N/A'}
SIGNAL: ${impact?.toUpperCase() || 'MIXED'}
CATEGORY: ${category?.toUpperCase() || 'GENERAL'}
CURRENT PLAYS: ${plays?.map(p => `${p.direction} ${p.ticker}`).join(', ') || 'None'}

Write 3-4 sentences covering:
1. What this means for markets right now
2. Which sectors/assets are most affected and why
3. Key risk factors traders should watch
4. Timeframe for this catalyst to play out

Be specific, direct, and actionable. No fluff.`;

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
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error?.message || `Claude HTTP ${r.status}`);
    }

    const data = await r.json();
    const analysis = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
    return res.status(200).json({ analysis });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
