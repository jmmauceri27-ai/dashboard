export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const symbols = ['^GSPC', '^DJI', '^IXIC', '^TNX'];
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&fields=shortName,regularMarketPrice,regularMarketChange,regularMarketChangePercent`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!response.ok) throw new Error(`Yahoo returned ${response.status}`);
    const data = await response.json();
    const quotes = (data?.quoteResponse?.result || []).map(q => ({
      symbol:        q.symbol,
      name:          q.shortName || q.symbol,
      price:         q.regularMarketPrice,
      change:        q.regularMarketChange,
      changePercent: q.regularMarketChangePercent,
    }));
    res.json({ quotes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
