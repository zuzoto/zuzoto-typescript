# @zuzoto/sdk

## 0.0.3

### Patch Changes

- aae573d: Add retry/timeout support and DX tooling
  - Configurable retry with exponential backoff (default: 3 retries on 429/5xx)
  - Request timeout via `timeoutMs` option using AbortSignal
  - Respects `Retry-After` header from server
  - `retry: false` to disable retries entirely
  - Prettier, ESLint, lefthook pre-commit hooks
  - Auto-sync version.ts from package.json via changesets

## 0.0.2

### Patch Changes

- 9dd33b4: Initial automated release
