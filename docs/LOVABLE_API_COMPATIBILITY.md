# Lovable: preserve the BrathaMatu API contract

This repository contains the React frontend only. Its Laravel API is deployed
and maintained separately. Frontend changes must remain compatible with the
running API; do not refactor or replace the API contract to make a UI change
easier.

## Protected interface

- Keep existing paths, HTTP methods, request/response field names, enum/status
  values, permissions, error codes, and pagination behavior.
- Keep JSON property names camelCase. Do not expose database snake_case names
  in frontend DTOs or rename DTO fields without a coordinated API change.
- Preserve `{data}` resource responses, `{data, meta}` list responses, and the
  API's validation/error envelopes.
- Use the existing `apiFetch` helpers in `src/lib/api.ts` and feature hooks in
  `src/api/hooks/`. Keep DTOs in `src/types/api.ts` aligned with
  `docs/API_CONTRACT.md`.
- Authentication is Sanctum session-cookie authentication with an XSRF cookie.
  Preserve same-origin credentials and the existing CSRF setup. Do not add
  bearer tokens, localStorage token storage, or a parallel mock API.
- Permissions, branch access, shift checks, stock rules, payments, and other
  business decisions are enforced by the API. UI checks improve usability but
  must not be treated as backend authorization.

## Inventory conversion is form-driven

`POST /api/inventory/conversions` receives the quantities the authorized user
enters in the conversion form:

```json
{
  "branchId": "branch-ulid",
  "input": { "productId": "whole-product-ulid", "qty": 10 },
  "outputs": [
    { "productId": "cut-product-ulid", "qty": 6 }
  ],
  "wasteQty": 4,
  "note": "Optional"
}
```

The input, each output, and waste are kilogram quantities. Outputs and waste
must balance to the input. Do not add a separate settings-based yield
configuration, derive output quantities from percentages, or hide/override the
quantities entered by the operator. The backend validates and records these
form values and remains authoritative for stock movements and costing.

## If a contract change is unavoidable

Do not silently ship a frontend-only change that assumes a new backend
behavior. First identify the required request/response change, coordinate it
with the Laravel API owner, and update the backend and frontend together.
Document the change in `docs/API_CONTRACT.md`, keep old clients compatible or
explicitly version a breaking change, and add tests for the new contract. Never
deploy a frontend that calls an endpoint or expects a response not available
from the target backend.
