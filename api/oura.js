export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'x-oura-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = req.headers['x-oura-token'];
  if (!token) return res.status(401).json({ error: 'Missing token' });

  const { endpoint, ...params } = req.query;
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });

  const qs = new URLSearchParams(params).toString();
  const url = `https://api.ouraring.com/v2/usercollection/${endpoint}${qs ? '?' + qs : ''}`;

  try {
    const ouraRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await ouraRes.json();
    res.status(ouraRes.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
