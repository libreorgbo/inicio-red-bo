# KV vs D1 Strategy — inicio.red.bo

## Overview
This document describes when to use Cloudflare KV (KV_CACHE) vs D1 (DB) in the worker.

## KV_CACHE Usage (Read-heavy, low latency)

### What to cache:
- **categories list**: Cache for 5 minutes. Key: `cats:all`
- **links page 0**: First page of links per category. Key: `links:{category_id}:0`
- **search engines list**: Cache for 30 minutes. Key: `engines:active`
- **ad selection**: Cache winning ad per geo+device for 1 minute. Key: `ad:{country}:{device}`
- **link redirects**: hash_custom → url_final, TTL 10 minutes. Key: `redirect:{hash}`

### TTL Guidelines:
| Data Type       | TTL     | Invalidation Trigger        |
|-----------------|---------|------------------------------|
| categories      | 5 min   | Admin creates/updates cat    |
| links page 0    | 5 min   | Admin approves/rejects link  |
| search engines  | 30 min  | Admin updates engine         |
| ad selection    | 1 min   | Ad impression count update   |
| redirects       | 10 min  | Link URL updated             |

## D1 (DB) Usage (Source of truth, writes, complex queries)

### Always go to D1 for:
- User authentication (upsert on login)
- Link click/impression tracking
- Analytics events insertion
- Admin CRUD operations
- Paginated link queries (page > 0)
- Full-text search queries
- Moderation queue

## Pattern: Cache-First with D1 Fallback

```javascript
async function getCached(kv, key, ttl, fetchFn) {
  const cached = await kv.get(key, { type: 'json' });
  if (cached) return cached;
  const fresh = await fetchFn();
  await kv.put(key, JSON.stringify(fresh), { expirationTtl: ttl });
  return fresh;
}
```

## Cache Invalidation

After any admin write operation, invalidate related KV keys immediately:
- Approve/reject link → delete `links:{category_id}:0`
- Update category → delete `cats:all`
- Update engine → delete `engines:active`
