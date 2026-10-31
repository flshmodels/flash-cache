# Flash Cache

An HTTP cache for JSON values. Set a key and an expiry time, then read, replace or delete it. All data is kept in memory and disappears when the server stops.

Default address: **http://127.0.0.1:4312**.

## Setup

Requires Node.js 22 or later. No packages need to be installed.

```sh
npm start
```

Leave the server running. Open another terminal in the same folder:

```sh
npm run demo
npm test
```

The demo sends sample requests to the local server. Stop the server with Ctrl+C.

## Endpoints

| Method | Path | Input | Result |
| --- | --- | --- | --- |
| GET | /health | None | Service name, version, status |
| PUT | /v1/keys/:key | value, optional ttlSeconds | Create (201) or replace (200) a key |
| GET | /v1/keys/:key | None | Value, expiration and remaining TTL |
| DELETE | /v1/keys/:key | None | Remove an existing key (204) |
| GET | /v1/stats | None | Current key count, stored-value bytes and limits |

Example input: `{"value":{"displayName":"Player One"},"ttlSeconds":60}`.

Responses contain `key`, `value`, `expiresAt` (UTC ISO timestamp), and `ttlSeconds` (remaining time rounded up on reads). A missing or expired key returns 404. PUT replaces the value and restarts the TTL; concurrent PUTs use last-write-wins behavior. GET never extends expiry. TTL must be an integer from 1 to 86,400 seconds and defaults to 60 when omitted.

## Limits

The cache lives **only in memory**. Restarting loses all keys. Default limits are 1,000 keys, 32 KiB per serialized UTF-8 JSON value, and 4 MiB of stored-value bytes. Byte accounting excludes JavaScript object overhead. Capacity failures return 503 and preserve existing values; there is no silent eviction. Expired entries are removed on API access and by a 30-second cleanup timer. The `createService` factory accepts alternative limits and an injectable clock for testing.

This is not a Redis replacement or distributed cache. Do not use it as the only copy of important data.

Six service tests cover expiration boundaries, TTL resets, isolation, deletion, capacity and byte accounting. Seven transport tests cover the HTTP boundary.

## Access and requests

By default, the server listens on `127.0.0.1`. Set `PORT` and `HOST` to change the listener. Setting `API_TOKEN` enables Bearer authentication for all API routes; `GET /health` stays public. A token must be 32–256 characters. Non-loopback binding requires a token. For example, in PowerShell:

```powershell
$env:API_TOKEN = 'replace-with-a-random-secret-at-least-32-characters'
npm start
```

Send `Authorization: Bearer <your-token>` when authentication is enabled. The demo reads the same `API_TOKEN` environment variable; its optional `API_URL` changes the target server. The server does not read a .env file automatically. For access beyond your own computer, use a trusted HTTPS reverse proxy and restrict access. There is no built-in TLS, per-user authorization, CORS support, or managed hosting in this repository.

Requests with bodies must use `Content-Type: application/json`. Keys/IDs are 1–64 ASCII letters, numbers, underscores or hyphens and must start with a letter or number. No query parameters are supported. Responses are JSON except successful deletion (204). Error responses use `{"error":{"code":"...","message":"..."}}`.

Bodies are limited to 64 KiB, 32 nesting levels and 10,000 values. Numbers must be finite. Unsupported methods return 405, bad JSON 400, unsupported content types 415, oversized bodies 413, and missing/incorrect credentials 401. Responses use `Cache-Control: no-store`. The health route only confirms that this process is running. Submitted data is not executed or used to fetch URLs.

## Tests

Tests send HTTP requests to local servers on temporary ports. GitHub Actions runs them on Node 22 and 24.

MIT licensed. See [LICENSE](LICENSE).
