import { Redis } from '@upstash/redis';
import { createHash, timingSafeEqual } from 'node:crypto';

// Works with the Upstash Redis integration from the Vercel Marketplace
// (it adds KV_REST_API_URL / KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const hasDb = Boolean(url && token);
export const redis = hasDb ? new Redis({ url, token }) : {};

// Call first in every handler: answers 503 with a clear code when setup is missing.
export function notReady(res) {
  if (hasDb) return false;
  res.status(503).json({ error: 'no_db' });
  return true;
}

export const CATS = ['כיף ואירועים', 'הפסקות', 'ספורט', 'לימודים', 'משהו אחר'];

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (Array.isArray(fwd) ? fwd[0] : (fwd || '')).split(',')[0].trim() || 'unknown';
}

// Hash the IP so raw addresses are never stored.
export function ipKey(req) {
  return createHash('sha256').update(clientIp(req) + (process.env.ADMIN_PASSWORD || '')).digest('hex').slice(0, 24);
}

// Simple fixed-window limit: max `limit` calls per `windowSec` per visitor.
export async function rateLimited(req, name, limit, windowSec) {
  const key = `rl:${name}:${ipKey(req)}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, windowSec);
  return n > limit;
}

// Admin password: ADMIN_PASSWORD env var if set, otherwise a hash the owner sets once from the admin panel.
function sha(x) { return createHash('sha256').update(String(x)).digest(); }

export async function adminState() {
  if ((process.env.ADMIN_PASSWORD || '').length >= 6) return 'env';
  return (await redis.get('admin:hash')) ? 'stored' : 'unset';
}

export async function isAdmin(req) {
  const given = String(req.headers['x-admin-key'] || '');
  if (!given) return false;
  const env = process.env.ADMIN_PASSWORD || '';
  let ref;
  if (env.length >= 6) ref = sha(env);
  else {
    const h = await redis.get('admin:hash');
    if (!h) return false;
    ref = Buffer.from(String(h), 'hex');
  }
  const a = sha(given);
  return a.length === ref.length && timingSafeEqual(a, ref);
}

// First-time setup only: stores the hash when no password exists yet.
export async function setAdminPassword(pass) {
  if ((await adminState()) !== 'unset') return false;
  const ok = await redis.set('admin:hash', sha(pass).toString('hex'), { nx: true });
  return ok === 'OK';
}
