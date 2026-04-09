# @zuzoto/sdk

## 0.1.0

### Minor Changes

- f396aa2: Add `client.datasets` resource for hybrid product / catalog search.

  Datasets are a parallel subsystem to memories — schemaless JSON records with
  vector + BM25 hybrid search and optional LLM enrichment via curated presets
  (e.g. `ecommerce_clothes`). They power product catalogs, documentation
  search, and any "ingest → embed → search" workflow that doesn't need the
  memory engine's extraction pipeline.

  The new surface covers all 10 endpoints under `/v1/datasets/*`:
  - `client.datasets.create(input)` / `list()` / `get(id)` / `delete(id)`
  - `client.datasets.listPresets()`
  - `client.datasets.upsert(id, doc)` / `upsertBatch(id, docs)`
  - `client.datasets.getDocument(id, docId)` / `deleteDocument(id, docId)`
  - `client.datasets.search(id, query)`

  ```ts
  const ds = await client.datasets.create({
    name: "products",
    config: {
      embed_fields: ["title", "description"],
      filter_fields: ["price", "in_stock"],
    },
    enrichment_preset: "ecommerce_clothes",
  });

  await client.datasets.upsertBatch(
    ds.id,
    products.map((p) => ({ external_id: p.sku, data: p })),
  );

  const result = await client.datasets.search(ds.id, {
    query: "navy linen jumpsuit",
    filter: { price: { lte: 50 } },
    limit: 10,
  });
  ```

  The new methods live on a `DatasetsResource` accessed via a lazy getter on
  `ZuzotoClient`, keeping the existing flat client surface uncluttered while
  giving dataset operations a clean namespace.

  Internal: `list()`, `listPresets()`, and `search()` defensively coerce Go
  nil slices to `[]` so callers always get arrays.

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
