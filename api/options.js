module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TRADIER_KEY = process.env.TRADIER_KEY;
  if (!TRADIER_KEY) return res.status(500).json({ error: 'TRADIER_KEY not set' });

  const { ticker, optionDirection, targetExpiry, conviction } = req.body || {};
  if (!ticker || !optionDirection || !targetExpiry) {
    return res.status(400).json({ error: 'Missing required fields: ticker, optionDirection, targetExpiry' });
  }

  const TRADIER_BASE = 'https://api.tradier.com/v1';
  const headers = {
    'Authorization': `Bearer ${TRADIER_KEY}`,
    'Accept': 'application/json'
  };

  try {
    // ── 1. Get current stock price for ATM strike selection ──────────────────
    const quoteRes = await fetch(`${TRADIER_BASE}/markets/quotes?symbols=${ticker}`, { headers });
    if (!quoteRes.ok) throw new Error(`Tradier quote fetch failed: ${quoteRes.status}`);
    const quoteData = await quoteRes.json();
    const stockPrice = quoteData?.quotes?.quote?.last;
    if (!stockPrice) throw new Error(`Could not fetch price for ${ticker}`);

    // ── 2. Get available expirations ─────────────────────────────────────────
    const expRes = await fetch(
      `${TRADIER_BASE}/markets/options/expirations?symbol=${ticker}&includeAllRoots=true&strikes=false`,
      { headers }
    );
    if (!expRes.ok) throw new Error(`Tradier expirations fetch failed: ${expRes.status}`);
    const expData = await expRes.json();
    const expirations = expData?.expirations?.date;
    if (!expirations || !expirations.length) throw new Error(`No expirations found for ${ticker}`);

    // ── 3. Find nearest expiry >= targetExpiry with at least 5 days out ──────
    const today = new Date();
    const minDate = new Date(today);
    minDate.setDate(today.getDate() + 5);
    const target = new Date(targetExpiry);
    const useTarget = target >= minDate ? target : minDate;

    const expList = (Array.isArray(expirations) ? expirations : [expirations])
      .map(d => new Date(d))
      .filter(d => d >= minDate)
      .sort((a, b) => a - b);

    if (!expList.length) throw new Error(`No valid expirations found for ${ticker}`);

    // Pick the expiry closest to our target
    const chosenExpiry = expList.reduce((prev, curr) =>
      Math.abs(curr - useTarget) < Math.abs(prev - useTarget) ? curr : prev
    );
    const chosenExpiryStr = chosenExpiry.toISOString().split('T')[0];

    // ── 4. Fetch options chain for chosen expiry ──────────────────────────────
    const chainRes = await fetch(
      `${TRADIER_BASE}/markets/options/chains?symbol=${ticker}&expiration=${chosenExpiryStr}&greeks=true`,
      { headers }
    );
    if (!chainRes.ok) throw new Error(`Tradier chain fetch failed: ${chainRes.status}`);
    const chainData = await chainRes.json();
    const options = chainData?.options?.option;
    if (!options || !options.length) throw new Error(`No options chain data for ${ticker} ${chosenExpiryStr}`);

    // ── 5. Filter to call/put and find best contract ──────────────────────────
    const optionType = optionDirection.toLowerCase() === 'call' ? 'call' : 'put';
    const filtered = (Array.isArray(options) ? options : [options])
      .filter(o =>
        o.option_type === optionType &&
        o.ask > 0 &&
        (o.open_interest || 0) >= 100 &&
        o.strike != null
      );

    if (!filtered.length) throw new Error(`No liquid ${optionType} contracts found for ${ticker}`);

    // Find nearest ATM or first OTM strike
    // For calls: first strike >= stock price (ATM or OTM)
    // For puts: first strike <= stock price (ATM or OTM)
    let bestContract;
    if (optionType === 'call') {
      const otmCalls = filtered
        .filter(o => o.strike >= stockPrice)
        .sort((a, b) => a.strike - b.strike);
      bestContract = otmCalls[0] || filtered.sort((a, b) =>
        Math.abs(a.strike - stockPrice) - Math.abs(b.strike - stockPrice))[0];
    } else {
      const otmPuts = filtered
        .filter(o => o.strike <= stockPrice)
        .sort((a, b) => b.strike - a.strike);
      bestContract = otmPuts[0] || filtered.sort((a, b) =>
        Math.abs(a.strike - stockPrice) - Math.abs(b.strike - stockPrice))[0];
    }

    if (!bestContract) throw new Error(`Could not select best contract for ${ticker}`);

    // ── 6. Calculate trade levels ─────────────────────────────────────────────
    const entry = parseFloat((bestContract.ask).toFixed(2));
    const tp1   = parseFloat((entry * 1.20).toFixed(2));  // +20%
    const tp2   = parseFloat((entry * 1.40).toFixed(2));  // +40%
    const sl    = parseFloat((entry * 0.70).toFixed(2));  // -30%

    // ── 7. IV-based conviction adjustment (±2) ────────────────────────────────
    const iv = bestContract.greeks?.mid_iv || bestContract.implied_volatility || null;
    let adjustedConviction = conviction || 5;

    if (iv !== null) {
      // Low IV (<0.30) = cleaner, cheaper entry → bump up
      // Very high IV (>0.80) = expensive premium, elevated risk → bump down
      if (iv < 0.30) {
        adjustedConviction = Math.min(10, adjustedConviction + 2);
      } else if (iv >= 0.30 && iv < 0.55) {
        adjustedConviction = Math.min(10, adjustedConviction + 1);
      } else if (iv >= 0.55 && iv < 0.80) {
        // No adjustment — moderate IV is neutral
      } else if (iv >= 0.80) {
        adjustedConviction = Math.max(1, adjustedConviction - 2);
      }
    }

    // ── 8. Format contract label ──────────────────────────────────────────────
    const expiryFormatted = chosenExpiry.toLocaleDateString('en-US', {
      month: 'numeric', day: 'numeric', year: '2-digit'
    });
    const strikeLabel = bestContract.strike % 1 === 0
      ? bestContract.strike.toString()
      : bestContract.strike.toFixed(1);
    const typeLabel = optionType === 'call' ? 'C' : 'P';
    const contractLabel = `$${ticker} ${strikeLabel}${typeLabel} ${expiryFormatted}`;

    // ── 9. Return structured options data ─────────────────────────────────────
    return res.status(200).json({
      ticker: `$${ticker}`,
      contract: contractLabel,
      entry,
      tp1,
      tp2,
      sl,
      conviction: adjustedConviction,
      expiry: chosenExpiryStr,
      strike: bestContract.strike,
      optionType,
      iv: iv ? parseFloat((iv * 100).toFixed(1)) : null, // as percentage
      openInterest: bestContract.open_interest || null,
      marketStatus: 'open'
    });

  } catch (err) {
    // If markets are closed or Tradier returns nothing, return a clean closed state
    const isMarketClosed =
      err.message.includes('No options chain') ||
      err.message.includes('No liquid') ||
      err.message.includes('No expirations') ||
      err.message.includes('No valid expirations');

    return res.status(200).json({
      marketStatus: isMarketClosed ? 'closed' : 'error',
      error: err.message
    });
  }
};
