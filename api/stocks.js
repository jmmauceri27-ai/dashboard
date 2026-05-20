export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = req.query.key;
  if (!apiKey) return res.status(400).json({ error: 'Missing API key' });

  const symbols = [
    { symbol: 'SPY',  name: 'S&P 500' },
    { symbol: 'DIA',  name: 'Dow Jones' },
    { symbol: 'QQQ',  name: 'Nasdaq 100' },
    { symbol: '^TNX', name: '10-Yr Treasury' },
  ];

  const delay = ms => new Promise(r => setTimeout(r, ms));

  async function fetchQuote({ symbol, name }) {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
    const r    = await fetch(url);
    const json = await r.json();
    // AV returns rate-limit messages in 'Note' or 'Information' instead of data
    if (json['Note'] || json['Information']) throw new Error(`Rate limited for ${symbol}`);
    const q = json['Global Quote'];
    if (!q || !q['05. price']) throw new Error(`No data for ${symbol}`);

    const price         = parseFloat(q['05. price']);
    const change        = parseFloat(q['09. change']);
    const changePercent = parseFloat(q['10. change percent'].replace('%', ''));

    return { symbol, name, price, change, changePercent };
  }

  // Fetch sequentially to stay within the 5-req/min free tier limit
  const quotes = [];
  for (const sym of symbols) {
    try {
      quotes.push(await fetchQuote(sym));
      await delay(300);
    } catch {
      // skip symbols that fail or get rate-limited
    }
  }

  if (!quotes.length) return res.status(500).json({ error: 'All quotes failed' });
  res.json({ quotes });
}
