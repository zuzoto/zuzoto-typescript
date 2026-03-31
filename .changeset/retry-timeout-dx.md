---
"@zuzoto/sdk": patch
---

Add retry/timeout support and DX tooling

- Configurable retry with exponential backoff (default: 3 retries on 429/5xx)
- Request timeout via `timeoutMs` option using AbortSignal
- Respects `Retry-After` header from server
- `retry: false` to disable retries entirely
- Prettier, ESLint, lefthook pre-commit hooks
- Auto-sync version.ts from package.json via changesets
