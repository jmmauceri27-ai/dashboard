export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const symbols = [
    { stooq: '%5Espx',   key: '^GSPC', name: 'S&P 500' },
    { stooq: '%5Edji',   key: '^DJI',  name: 'Dow Jones' },
    { stooq: '%5Endq',   key: '^NDQ',  name: 'Nasdaq 100' },
    { stooq: '10usy.b',  key: '^TNX',  name: '10-Yr Treasury' },
  ];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'text/csv,text/plain,*/*',
  };

  async function fetchQuote({ stooq, key, name }) {
    const url = `https://stooq.com/q/d/l/?s=${stooq}&i=d`;
    const r   = await fetch(url, { headers });
    const csv = await r.text();

    const lines = csv.trim().split('\n')
      .slice(1)                          // skip header
      .map(l => l.split(','))
      .filter(c => c.length >= 5 && !isNaN(parseFloat(c[4])));

    if (lines.length < 2) throw new Error(`Insufficient data for ${key}`);

    // Stooq returns ascending order (oldest first)
    const curr = parseFloat(lines[lines.length - 1][4]);
    const prev = parseFloat(lines[lines.length - 2][4]);
    const change = curr - prev;

    return { symbol: key, name, price: curr, change, changePercent: (change / prev) * 100 };
  }

  try {
    const quotes = await Promise.all(symbols.map(fetchQuote));
    res.json({ quotes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
