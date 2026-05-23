export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = req.query.key;
  if (!apiKey) return res.status(400).json({ error: 'Missing API key' });

  const symbols = [
    { symbol: 'SPY',   name: 'S&P 500' },
    { symbol: 'DIA',   name: 'Dow Jones' },
    { symbol: 'QQQ',   name: 'Nasdaq 100' },
    { symbol: 'FXAIX', name: 'FXAIX' },
    { symbol: 'FSDMX', name: 'FSDMX' },
    { symbol: 'FSSNX', name: 'FSSNX' },
    { symbol: 'FXNAX', name: 'FXNAX' },
    { symbol: 'SPAXX', name: 'SPAXX' },
  ];

  async function fetchQuote({ symbol, name }) {
    const url  = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`;
    const r    = await fetch(url);
    const json = await r.json();
    if (!json.c) throw new Error(`No data for ${symbol}`);
    return { symbol, name, price: json.c, change: json.d, changePercent: json.dp };
  }

  const results = await Promise.allSettled(symbols.map(fetchQuote));
  const quotes  = results.filter(r => r.status === 'fulfilled').map(r => r.value);

  if (!quotes.length) return res.status(500).json({ error: 'All quotes failed' });
  res.json({ quotes });
}
