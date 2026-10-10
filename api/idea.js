import { randomUUID } from 'node:crypto';
import { redis, CATS, rateLimited, notReady } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  try {
    if (notReady(res)) return;
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const text = String(body.text || '').trim().slice(0, 500);
    const name = String(body.name || '').trim().slice(0, 40);
    const cat = CATS.includes(body.cat) ? body.cat : 'משהו אחר';
    if (!text) return res.status(400).json({ error: 'empty' });
    if (await rateLimited(req, 'idea', 8, 600)) return res.status(429).json({ error: 'slow_down' });

    const idea = { id: randomUUID(), text, name, cat, t: Date.now() };
    await redis.lpush('ideas', JSON.stringify(idea));
    await redis.ltrim('ideas', 0, 1999); // keep the newest 2000
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
}
