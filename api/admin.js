import { redis, isAdmin, rateLimited, notReady, adminState, setAdminPassword } from '../lib/store.js';

function parse(v) {
  if (v && typeof v === 'object') return v; // the client may already decode JSON
  try { return JSON.parse(v); } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (notReady(res)) return;
    if (await rateLimited(req, 'admin', 30, 600)) return res.status(429).json({ error: 'slow_down' });

    // first-time setup: no password yet -> tell the page, and let the owner set one
    if (req.method === 'GET' && req.query.check === '1') return res.status(200).json({ state: await adminState() });
    if (req.method === 'POST' && req.query.setup === '1') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const pass = String(b.password || '');
      if (pass.length < 6) return res.status(400).json({ error: 'too_short' });
      if (!(await setAdminPassword(pass))) return res.status(409).json({ error: 'already_set' });
      return res.status(200).json({ ok: true });
    }

    if (!(await isAdmin(req))) return res.status(401).json({ error: 'wrong_password' });

    if (req.method === 'GET') {
      const [votes, raw] = await Promise.all([redis.get('orenlm:votes'), redis.lrange('orenlm:ideas', 0, 1999)]);
      const ideas = raw.map(parse).filter(Boolean);
      return res.status(200).json({ votes: Number(votes || 0), ideas });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id || '');
      const raw = await redis.lrange('orenlm:ideas', 0, 1999);
      for (const item of raw) {
        const idea = parse(item);
        if (idea && idea.id === id) {
          await redis.lrem('orenlm:ideas', 1, typeof item === 'string' ? item : JSON.stringify(item));
          break;
        }
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
}
