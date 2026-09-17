import { createMiddleware } from 'hono/factory';

export const createRateLimit = (options = {}) => {
  const windowMs = options.windowMs || 60000;
  const maxRequests = options.maxRequests || 10;
  const keyPrefix = options.keyPrefix || 'rl';

  return createMiddleware(async (c, next) => {
    // 1. Extract IP
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
    const path = new URL(c.req.url).pathname;

    // 2. Build KV key
    const key = `${keyPrefix}:${ip}:${path}`;

    // 3. Get current count
    const kv = c.env.SESSIONS;
    const currentCountStr = await kv.get(key);
    let currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;

    // 4. Check limit
    if (currentCount >= maxRequests) {
      c.header('Retry-After', Math.ceil(windowMs / 1000).toString());
      c.header('X-RateLimit-Remaining', '0');
      return c.json({ error: 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง' }, 429);
    }

    // 5. Increment and save
    currentCount++;
    await kv.put(key, currentCount.toString(), { expirationTtl: Math.ceil(windowMs / 1000) });

    // 6. Set headers and proceed
    c.header('X-RateLimit-Remaining', Math.max(0, maxRequests - currentCount).toString());
    await next();
  });
};
