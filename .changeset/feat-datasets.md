---
"@zuzoto/sdk": minor
---

Add `client.datasets` resource for hybrid product / catalog search.

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
