import { redis, notReady } from '../lib/store.js';

// Message relay for the presentation remote (oren-remote.vercel.app).
// The phone and the computer each POST short messages and poll for new ones by sequence number.
// Channels expire an hour after the last message.
const DIRS = new Set(['up', 'down']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (notReady(res)) return;
    const code = String(req.query.code || '');
    const dir = String(req.query.dir || '');
    if (!/^\d{6}$/.test(code) || !DIRS.has(dir)) return res.status(400).json({ error: 'bad_channel' });
    const key = `orenlm:relay:${code}:${dir}`;

    if (req.method === 'POST') {
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      if (raw.length > 600) return res.status(413).json({ error: 'too_big' });
      let msg; try { msg = JSON.parse(raw); } catch { return res.status(400).json({ error: 'bad_json' }); }
      const seq = await redis.incr(key + ':seq');
      const p = redis.pipeline();
      p.lpush(key, JSON.stringify({ id: seq, m: msg }));
      p.ltrim(key, 0, 19);
      p.expire(key, 3600);
      p.expire(key + ':seq', 3600);
      await p.exec();
      return res.status(200).json({ ok: true, id: seq });
    }

    if (req.method === 'GET') {
      const after = Number(req.query.after);
      if (!(after >= 0)) {
        // first call: just tell the listener where the channel is now, so it skips old messages
        return res.status(200).json({ seq: Number((await redis.get(key + ':seq')) || 0), msgs: [] });
      }
      const list = await redis.lrange(key, 0, 19);
      const msgs = list
        .map((x) => (typeof x === 'string' ? JSON.parse(x) : x))
        .filter((x) => x && x.id > after)
        .sort((a, b) => a.id - b.id);
      const seq = msgs.length ? msgs[msgs.length - 1].id : after;
      return res.status(200).json({ seq, msgs });
    }
    return res.status(405).json({ error: 'method' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
}
