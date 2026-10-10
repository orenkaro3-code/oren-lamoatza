import { redis, rateLimited, notReady } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  try {
    if (notReady(res)) return;
    // The page counts once per browser; this caps spam from one network (school Wi-Fi shares one address).
    if (await rateLimited(req, 'vote', 40, 3600)) return res.status(429).json({ error: 'slow_down' });
    const votes = await redis.incr('votes');
    return res.status(200).json({ ok: true, votes });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
}
