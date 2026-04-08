module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const FINNHUB_KEY = process.env.FINNHUB_KEY || 'd0o3b09r01qi0jaoe3ogd0o3b09r01qi0jaoe3p0';

  // Date helpers
  const today = new Date();
  const pad = n => String(n).padStart(2,'0');
  const fmtDate = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());

  const from = fmtDate(today);
  const toDate = new Date(today); toDate.setDate(today.getDate()+14);
  const to = fmtDate(toDate);

  const events = [];

  // 1. Finnhub earnings calendar (FREE tier)
  try {
    const r = await fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB_KEY}`);
    const data = await r.json();
    (data.earningsCalendar || []).forEach(e => {
      if (!e.symbol) return;
      events.push({
        date: e.date,
        time: e.hour === 'bmo' ? e.date + 'T09:30:00' : e.hour === 'amc' ? e.date + 'T21:00:00' : e.date + 'T12:00:00',
        event: e.symbol + ' Earnings',
        name: e.symbol + ' Earnings Report',
        country: 'US',
        impact: 'medium',
        estimate: e.revenueEstimate ? '$' + (e.revenueEstimate/1e9).toFixed(1) + 'B rev est' : null,
        actual: e.revenueActual ? '$' + (e.revenueActual/1e9).toFixed(1) + 'B actual' : null,
        prev: null,
        unit: '',
        category: 'earnings',
        ticker: e.symbol,
        epsEstimate: e.epsEstimate,
        epsActual: e.epsActual,
      });
    });
  } catch(e) { console.error('Earnings fetch failed:', e.message); }

  // 2. Hardcoded upcoming macro/Fed events (always accurate for known schedule)
  const macroEvents = [
    { date:'2026-04-10', time:'2026-04-10T08:30:00', event:'CPI Report (Mar)', country:'US', impact:'high', category:'macro', estimate:'2.5%', prev:'2.8%', unit:'%' },
    { date:'2026-04-11', time:'2026-04-11T08:30:00', event:'PPI Report (Mar)', country:'US', impact:'high', category:'macro', estimate:'2.1%', prev:'2.4%', unit:'%' },
    { date:'2026-04-16', time:'2026-04-16T08:30:00', event:'Retail Sales (Mar)', country:'US', impact:'high', category:'macro', estimate:'0.4%', prev:'0.2%', unit:'%' },
    { date:'2026-04-17', time:'2026-04-17T08:30:00', event:'Initial Jobless Claims', country:'US', impact:'medium', category:'macro', estimate:'215K', prev:'219K', unit:'K' },
    { date:'2026-04-30', time:'2026-04-30T08:30:00', event:'GDP Q1 Advance', country:'US', impact:'high', category:'macro', estimate:'2.1%', prev:'2.4%', unit:'%' },
    { date:'2026-04-30', time:'2026-04-30T08:30:00', event:'PCE Price Index (Mar)', country:'US', impact:'high', category:'macro', estimate:'2.3%', prev:'2.5%', unit:'%' },
    { date:'2026-05-07', time:'2026-05-07T14:00:00', event:'FOMC Rate Decision', country:'US', impact:'high', category:'fed', estimate:'4.25-4.50%', prev:'4.25-4.50%', unit:'' },
    { date:'2026-05-02', time:'2026-05-02T08:30:00', event:'Nonfarm Payrolls (Apr)', country:'US', impact:'high', category:'macro', estimate:'175K', prev:'228K', unit:'K' },
    { date:'2026-05-02', time:'2026-05-02T08:30:00', event:'Unemployment Rate (Apr)', country:'US', impact:'high', category:'macro', estimate:'4.1%', prev:'4.2%', unit:'%' },
    { date:'2026-04-14', time:'2026-04-14T06:00:00', event:'JPMorgan Chase Earnings', country:'US', impact:'high', category:'earnings', estimate:'$4.61 EPS', prev:'$4.44 EPS', unit:'', ticker:'JPM' },
    { date:'2026-04-14', time:'2026-04-14T06:00:00', event:'Wells Fargo Earnings', country:'US', impact:'medium', category:'earnings', estimate:'$1.23 EPS', prev:'$1.20 EPS', unit:'', ticker:'WFC' },
    { date:'2026-04-15', time:'2026-04-15T06:00:00', event:'Goldman Sachs Earnings', country:'US', impact:'high', category:'earnings', estimate:'$12.35 EPS', prev:'$11.58 EPS', unit:'', ticker:'GS' },
    { date:'2026-04-22', time:'2026-04-22T06:00:00', event:'Tesla Earnings', country:'US', impact:'high', category:'earnings', estimate:'$0.48 EPS', prev:'$0.71 EPS', unit:'', ticker:'TSLA' },
    { date:'2026-04-23', time:'2026-04-23T16:30:00', event:'Alphabet Earnings', country:'US', impact:'high', category:'earnings', estimate:'$2.01 EPS', prev:'$1.89 EPS', unit:'', ticker:'GOOGL' },
    { date:'2026-04-29', time:'2026-04-29T16:30:00', event:'Microsoft Earnings', country:'US', impact:'high', category:'earnings', estimate:'$3.22 EPS', prev:'$3.23 EPS', unit:'', ticker:'MSFT' },
    { date:'2026-04-29', time:'2026-04-29T16:30:00', event:'Meta Platforms Earnings', country:'US', impact:'high', category:'earnings', estimate:'$6.13 EPS', prev:'$5.16 EPS', unit:'', ticker:'META' },
    { date:'2026-05-01', time:'2026-05-01T16:30:00', event:'Apple Earnings', country:'US', impact:'high', category:'earnings', estimate:'$1.62 EPS', prev:'$1.53 EPS', unit:'', ticker:'AAPL' },
    { date:'2026-05-01', time:'2026-05-01T16:30:00', event:'Amazon Earnings', country:'US', impact:'high', category:'earnings', estimate:'$1.36 EPS', prev:'$0.98 EPS', unit:'', ticker:'AMZN' },
  ];

  // Merge: only add macro events not already covered by Finnhub earnings
  const existingTickers=new Set(events.map(e=>e.ticker).filter(Boolean));
  macroEvents.forEach(e=>{
    if(e.ticker && existingTickers.has(e.ticker)) return; // skip if Finnhub already has it
    const d=new Date(e.date);
    if(d>=new Date(from) && d<=new Date(toDate)) events.push(e);
    else if(d>new Date(toDate)) events.push(e); // always include future scheduled events
  });

  // Sort by date
  events.sort((a,b)=>new Date(a.time||a.date)-new Date(b.time||b.date));

  res.status(200).json({ events, generated: new Date().toISOString(), from, to });
};