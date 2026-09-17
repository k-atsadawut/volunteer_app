// Caching utility for API responses using Cloudflare KV
// ใช้ KV เพื่อ cache API responses ที่ไม่เปลี่ยนบ่อย เช่น รายการกิจกรรม

export const CACHE_TTL = {
  ACTIVITIES_LIST: 60, // 1 minute
  ACTIVITY_DETAIL: 300, // 5 minutes
  USER_REGISTRATIONS: 120, // 2 minutes
  STATISTICS: 300, // 5 minutes
};

export async function getCached(key, env) {
  if (!env.CACHE_KV) return null;
  
  try {
    const cached = await env.CACHE_KV.get(key, 'json');
    return cached;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

export async function setCached(key, value, ttl, env) {
  if (!env.CACHE_KV) return;
  
  try {
    await env.CACHE_KV.put(key, JSON.stringify(value), {
      expirationTtl: ttl
    });
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

export async function invalidateCache(pattern, env) {
  if (!env.CACHE_KV) return;
  
  try {
    // KV doesn't support pattern deletion, so we'll need to handle this differently
    // For now, we'll implement simple key-based invalidation
    // This can be enhanced with a cache versioning strategy
    const cacheVersion = await env.CACHE_KV.get('cache_version', 'json') || { version: 0 };
    cacheVersion.version += 1;
    await env.CACHE_KV.put('cache_version', JSON.stringify(cacheVersion));
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
}

export async function getCacheVersion(env) {
  if (!env.CACHE_KV) return 0;
  
  try {
    const version = await env.CACHE_KV.get('cache_version', 'json');
    return version?.version || 0;
  } catch (error) {
    console.error('Cache version error:', error);
    return 0;
  }
}

// Generate cache key with version to handle invalidation
export function generateCacheKey(baseKey, env) {
  const version = getCacheVersion(env);
  return `${baseKey}_v${version}`;
}