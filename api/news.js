export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sources = {
    reuters:     'https://feeds.reuters.com/reuters/businessNews',
    marketwatch: 'https://feeds.marketwatch.com/marketwatch/topstories/',
    cnbc:        'https://www.cnbc.com/id/10001147/device/rss/rss.html',
    yahoo:       'https://finance.yahoo.com/news/rssindex',
  };

  const source = req.query.source;
  const url    = sources[source];
  if (!url) return res.status(400).json({ error: 'Invalid source' });

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; news-briefing-bot/1.0)' },
    });
    if (!response.ok) throw new Error(`Feed returned ${response.status}`);
    const xml = await response.text();

    const items = [];
    const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRe.exec(xml)) !== null && items.length < 8) {
      const block   = m[1];
      const getText = tag => {
        const r = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
        return (block.match(r) || [])[1]?.trim().replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'") || '';
      };
      const linkM = block.match(/<link>([^<]+)<\/link>/) || block.match(/<link[^>]+href="([^"]+)"/);
      const title   = getText('title');
      const link    = (linkM || [])[1]?.trim() || '';
      const pubDate = getText('pubDate') || getText('dc:date') || '';
      if (title && link) items.push({ title, link, pubDate });
    }

    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
