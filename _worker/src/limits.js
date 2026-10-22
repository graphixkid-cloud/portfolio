// Per-visitor and site-wide message limits, kept in Workers KV.
// Visitors are identified by a salted SHA-256 of their IP; the raw IP is never stored.
// Each allowed message costs 2 KV writes. The Workers free plan allows 1,000 KV writes
// a day, so the default daily cap (450) keeps the site inside the free tier.

export const VISITOR_PER_HOUR = 20;
export const DAILY_DEFAULT = 450;

export async function hashIp(ip, salt = "") {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${ip}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function checkLimits(env, ipHash, now = new Date()) {
  const iso = now.toISOString();
  const day = iso.slice(0, 10).replace(/-/g, "");
  const hour = day + iso.slice(11, 13);
  const daily = Number(env.DAILY_LIMIT) || DAILY_DEFAULT;
  const perVisitor = Number(env.VISITOR_LIMIT) || VISITOR_PER_HOUR;
  const vKey = `v:${ipHash}:${hour}`;
  const dKey = `d:${day}`;
  const [v, d] = await Promise.all([env.LIMITS.get(vKey), env.LIMITS.get(dKey)]);
  const vn = Number(v) || 0;
  const dn = Number(d) || 0;
  if (dn >= daily) return "daily";
  if (vn >= perVisitor) return "visitor";
  await Promise.all([
    env.LIMITS.put(vKey, String(vn + 1), { expirationTtl: 3600 }),
    env.LIMITS.put(dKey, String(dn + 1), { expirationTtl: 86400 }),
  ]);
  return "ok";
}
