<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Protected API contract

This repository is the BrathaMatu frontend. The Laravel API is maintained
separately. Treat `docs/API_CONTRACT.md`,
`docs/LOVABLE_API_COMPATIBILITY.md`, `src/lib/api.ts`, `src/api/hooks/`, and
`src/types/api.ts` as a compatibility boundary.

- Do not rename, remove, reinterpret, or silently change API routes, HTTP
  methods, request fields, response fields, status values, permission names,
  error codes, envelopes, or pagination semantics.
- Keep API JSON camelCase and preserve the `{data}` / `{data, meta}` response
  envelopes and `{message, code, errors}` error handling.
- Preserve Sanctum cookie/session authentication and the XSRF flow. Do not add
  bearer-token storage, localStorage auth, mock responses, or a parallel API
  client to work around the existing contract.
- Before changing an API-facing UI, follow its existing hook and DTO. Do not
  invent endpoints or substitute frontend-only formulas for server-owned
  business rules.
- If an API change is genuinely necessary, stop and document the exact
  incompatibility, coordinate the matching Laravel change with the backend
  owner, update `docs/API_CONTRACT.md`, and add/update tests on both sides.
  Keep existing clients working or explicitly version the breaking change;
  never deploy a frontend that expects a backend change that is not deployed.
- Run the focused tests and production build after frontend changes. Do not
  rewrite published Git history or push a broken build.
