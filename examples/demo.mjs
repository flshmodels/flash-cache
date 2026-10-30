// Start this project's server in another terminal before running the demo.
const base = process.env.API_URL ?? 'http://127.0.0.1:4312';
const token = process.env.API_TOKEN;
const target = new URL(base);
if (token && target.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) throw new Error('Use HTTPS when sending a token to a remote host.');
async function call(path, method = 'GET', body) {
  const response = await fetch(new URL(path, base), { method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000), redirect: 'error' });
  const text = await response.text();
  const result = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(JSON.stringify(result));
  console.log(method, path, response.status, JSON.stringify(result));
  return result;
}

const route = '/v1/keys/demo-' + Date.now();
await call(route, 'PUT', { value: { displayName: 'Player One' }, ttlSeconds: 60 });
await call(route);
await call('/v1/stats');
await call(route, 'DELETE');
