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

  async function fetchQuote({ symbol, name }) {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
    const r    = await fetch(url);
    const json = await r.json();
    const q    = json['Global Quote'];
    if (!q || !q['05. price']) throw new Error(`No data for ${symbol}`);

    const price         = parseFloat(q['05. price']);
    const change        = parseFloat(q['09. change']);
    const changePctRaw  = q['10. change percent'].replace('%', '');
    const changePercent = parseFloat(changePctRaw);

    return { symbol, name, price, change, changePercent };
  }

  const results = await Promise.allSettled(symbols.map(fetchQuote));
  const quotes  = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  if (!quotes.length) return res.status(500).json({ error: 'All quotes failed' });
  res.json({ quotes });
}
