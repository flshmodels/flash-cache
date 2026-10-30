import test from 'node:test';
import assert from 'node:assert/strict';
import { createService } from '../src/server.mjs';
import { fixture } from './fixture.mjs';
const route = '/v1/keys/player_42';
const put = (value, ttlSeconds = 60) => ({ method: 'PUT', body: { value, ttlSeconds } });

test('stores JSON values, overwrites them and deletes keys', async t => {
  const { call } = await fixture(t, createService());
  assert.equal((await call(route, put({ role: 'staff' }))).status, 201);
  assert.deepEqual((await call(route)).body.value, { role: 'staff' });
  assert.equal((await call(route, put(false))).status, 200);
  assert.equal((await call(route)).body.value, false);
  assert.equal((await call(route, { method: 'DELETE' })).status, 204);
  assert.equal((await call(route)).status, 404);
});
test('expires exactly at the TTL boundary and frees capacity', async t => {
  let time = 1700000000000;
  const { call } = await fixture(t, createService({ now: () => time, maxKeys: 1 }));
  await call(route, put(null, 1)); time += 999;
  assert.equal((await call(route)).body.ttlSeconds, 1);
  time++;
  assert.equal((await call(route)).status, 404);
  assert.equal((await call('/v1/stats')).body.keys, 0);
  assert.equal((await call('/v1/keys/new', put(1))).status, 201);
});
test('overwriting a key restarts its TTL', async t => {
  let time = 0;
  const { call } = await fixture(t, createService({ now: () => time }));
  await call(route, put('a', 1)); time = 500;
  await call(route, put('b', 2)); time = 1001;
  assert.equal((await call(route)).body.value, 'b');
  time = 2500; assert.equal((await call(route)).status, 404);
});
test('capacity failures preserve previous entries and byte accounting', async t => {
  const { call } = await fixture(t, createService({ maxKeys: 1, maxBytes: 5 }));
  await call(route, put('ab'));
  assert.equal((await call('/v1/keys/new', put(1))).status, 503);
  assert.equal((await call(route, put('abcd'))).status, 503);
  assert.equal((await call(route)).body.value, 'ab');
  assert.equal((await call('/v1/stats')).body.valueBytes, 4);
  await call(route, put(0));
  assert.equal((await call('/v1/stats')).body.valueBytes, 1);
});
test('invalid TTLs, payloads and key paths are rejected', async t => {
  const { call } = await fixture(t, createService({ maxValueBytes: 8 }));
  for (const ttl of [0, -1, 1.5, 86401, null, '60']) assert.equal((await call(route, put(1, ttl))).status, 400);
  assert.equal((await call(route, { method: 'PUT', body: { ttlSeconds: 5 } })).status, 400);
  assert.equal((await call(route, { method: 'PUT', body: { value: 1, extra: true } })).status, 400);
  assert.equal((await call(route, put('x'.repeat(8)))).status, 413);
  assert.equal((await call('/v1/keys/bad%2Fkey', put(1))).status, 400);
  assert.equal((await call('/v1/stats')).body.keys, 0);
});
test('default TTL is sixty seconds and independent keys do not overwrite each other', async t => {
  const { call } = await fixture(t, createService({ now: () => 0 }));
  const result = await call(route, { method: 'PUT', body: { value: 1 } });
  assert.equal(result.body.ttlSeconds, 60);
  await call('/v1/keys/other', put(2));
  assert.equal((await call(route)).body.value, 1);
  assert.equal((await call('/v1/stats')).body.keys, 2);
});
