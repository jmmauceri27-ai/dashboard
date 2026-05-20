export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const symbols = [
    { encoded: '%5EGSPC', key: '^GSPC',  name: 'S&P 500' },
    { encoded: '%5EDJI',  key: '^DJI',   name: 'Dow Jones' },
    { encoded: '%5EIXIC', key: '^IXIC',  name: 'Nasdaq' },
    { encoded: '%5ETNX',  key: '^TNX',   name: '10-Yr Treasury' },
  ];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
  };

  try {
    const quotes = await Promise.all(symbols.map(async ({ encoded, key, name }) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1d&includePrePost=false`;
      const r   = await fetch(url, { headers });
      const d   = await r.json();
      const meta = d?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) throw new Error(`No data for ${key}`);
      const price  = meta.regularMarketPrice;
      const prev   = meta.chartPreviousClose ?? meta.previousClose ?? price;
      const change = price - prev;
      return {
        symbol:        key,
        name,
        price,
        change,
        changePercent: prev ? (change / prev) * 100 : 0,
      };
    }));

    res.json({ quotes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
