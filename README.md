# BrathaMatu Frontend

React, TypeScript, Vite, and TanStack Router frontend for the BrathaMatu POS
and poultry storefront. The Laravel API is maintained separately.

## Development

```sh
npm ci
npm run dev
```

By default, the frontend calls `/api` on the same origin. Vite proxies `/api`
and `/sanctum` to the local Laravel server at `http://127.0.0.1:8000`. Set
`VITE_API_BASE_URL` only when the frontend is intentionally hosted separately
from the API; the API must allow that origin for Sanctum stateful sessions.
Never put credentials or private tokens in `VITE_*` variables.

## API compatibility

Read [the API contract](./docs/API_CONTRACT.md) and [Lovable instructions](./AGENTS.md)
before making API-facing changes. This frontend relies on the existing Laravel
routes, camelCase DTOs, response envelopes, permission codes, and Sanctum
cookie/XSRF authentication. Coordinate any necessary breaking API change with
the backend owner; do not replace production API behavior with mock data.

## Checks

```sh
npm test
npm run build
```
