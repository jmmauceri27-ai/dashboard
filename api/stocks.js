export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = req.query.key;
  if (!apiKey) return res.status(400).json({ error: 'Missing API key' });

  const symbols = [
    { symbol: 'SPY', name: 'S&P 500' },
    { symbol: 'DIA', name: 'Dow Jones' },
    { symbol: 'QQQ', name: 'Nasdaq 100' },
  ];

  const delay = ms => new Promise(r => setTimeout(r, ms));

  async function fetchQuote({ symbol, name }) {
    const url  = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`;
    const r    = await fetch(url);
    const json = await r.json();
    if (json['Note'] || json['Information']) throw new Error('Rate limited');
    const q = json['Global Quote'];
    if (!q || !q['05. price']) throw new Error(`No data for ${symbol}`);
    return {
      symbol,
      name,
      price:         parseFloat(q['05. price']),
      change:        parseFloat(q['09. change']),
      changePercent: parseFloat(q['10. change percent'].replace('%', '')),
    };
  }

  const quotes = [];
  for (const sym of symbols) {
    try {
      quotes.push(await fetchQuote(sym));
      if (quotes.length < symbols.length) await delay(500);
    } catch {
      // skip on rate limit or missing data
    }
  }

  if (!quotes.length) return res.status(500).json({ error: 'All quotes failed — daily limit may be reached' });
  res.json({ quotes });
}
