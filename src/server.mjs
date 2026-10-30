import { createApi, fail, fields, keyFrom, method, startFromEnv } from './http.mjs';

export function createService({ token = '', now = Date.now, maxKeys = 1000, maxBytes = 4_194_304, maxValueBytes = 32_768 } = {}) {
  if (![maxKeys, maxBytes, maxValueBytes].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Limits must be positive integers.');
  const entries = new Map();
  let bytes = 0;
  function remove(key) { const entry = entries.get(key); if (entry) { bytes -= entry.bytes; entries.delete(key); } }
  function purge(time) { for (const [key, entry] of entries) if (entry.expiresAt <= time) remove(key); }
  const server = createApi({ name: 'flash-cache', token, handler: async ({ request, path, json }) => {
    const readTime = now(); purge(readTime);
    if (path === '/v1/stats') {
      method(request, ['GET']);
      return { body: { keys: entries.size, valueBytes: bytes, maxKeys, maxValueBytes, maxBytes } };
    }
    const match = /^\/v1\/keys\/([^/]+)$/.exec(path);
    if (!match) fail(404, 'not_found', 'No endpoint exists at this path.');
    const key = keyFrom(match[1]);
    method(request, ['GET', 'PUT', 'DELETE']);
    if (request.method === 'PUT') {
      const body = await json(); fields(body, ['value', 'ttlSeconds'], ['value']);
      const ttlSeconds = Object.hasOwn(body, 'ttlSeconds') ? body.ttlSeconds : 60;
      if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 86400) fail(400, 'invalid_ttl', 'ttlSeconds must be an integer from 1 to 86400.');
      const size = Buffer.byteLength(JSON.stringify(body.value));
      if (size > maxValueBytes) fail(413, 'value_too_large', `value exceeds ${maxValueBytes} serialized UTF-8 bytes.`);
      const time = now(); purge(time);
      const existing = entries.get(key);
      if ((!existing && entries.size >= maxKeys) || bytes - (existing?.bytes ?? 0) + size > maxBytes) fail(503, 'capacity_exceeded', 'The cache is full. Remove a key or wait for expiry.');
      remove(key);
      const entry = { value: body.value, bytes: size, expiresAt: time + ttlSeconds * 1000 };
      entries.set(key, entry); bytes += size;
      return { status: existing ? 200 : 201, body: { key, value: entry.value, expiresAt: new Date(entry.expiresAt).toISOString(), ttlSeconds } };
    }
    const entry = entries.get(key);
    if (!entry) fail(404, 'key_not_found', 'The key is missing or has expired.');
    if (request.method === 'DELETE') { remove(key); return { status: 204 }; }
    return { body: { key, value: entry.value, expiresAt: new Date(entry.expiresAt).toISOString(), ttlSeconds: Math.ceil((entry.expiresAt - readTime) / 1000) } };
  } });
  const cleanup = setInterval(() => purge(now()), 30_000);
  cleanup.unref();
  server.on('close', () => clearInterval(cleanup));
  return server;
}
startFromEnv(import.meta.url, createService, 4312);
