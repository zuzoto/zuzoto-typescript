# @zuzoto/sdk

The official TypeScript SDK for [Zuzoto](https://github.com/zuzoto/zuzoto), cognitive memory infrastructure for AI agents.

[![npm version](https://img.shields.io/npm/v/@zuzoto/sdk)](https://www.npmjs.com/package/@zuzoto/sdk)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

## Install

```bash
pnpm add @zuzoto/sdk
# or
npm install @zuzoto/sdk
# or
yarn add @zuzoto/sdk
```

## Quick Start

```typescript
import { ZuzotoClient } from "@zuzoto/sdk";

const zo = new ZuzotoClient({ apiKey: "your-api-key" });

// Add a memory
const result = await zo.add({
  content: "User prefers dark mode and uses vim",
  user_id: "user-123",
});
console.log(`Added ${result.memories.length} memories, extracted ${result.entities_created} entities`);

// Search memories
const results = await zo.search({
  text: "What editor does the user prefer?",
  user_id: "user-123",
});
for (const m of results.memories) {
  console.log(`[${m.score.toFixed(2)}] ${m.memory.content}`);
}

// Get context for LLM
const ctx = await zo.getContext({
  query: "Tell me about the user's preferences",
  user_id: "user-123",
  max_tokens: 4096,
});
console.log(`Context: ${ctx.memories.length} memories, ${ctx.facts.length} facts, ${ctx.tokens} tokens`);
```

## Features

- **Memory CRUD** add, batchAdd, get, update, delete, search, getContext, forget
- **Async ingestion** addAsync, batchAddAsync with job polling
- **Batch operations** add up to 100 memories in one call
- **Hybrid search** vector, BM25, graph, temporal strategies
- **Context assembly** token-budgeted context windows for LLMs
- **Knowledge graph** entity and fact CRUD, temporal state queries
- **Temporal queries** point-in-time, entity timelines, natural language temporal questions
- **Sessions** conversation session management
- **Jobs** poll async job status
- **Typed errors** `ZuzotoError` with RFC 7807 Problem Detail parsing
- **Zero dependencies** uses native `fetch`

## API Reference

### Constructor

```typescript
// Default URL (https://api.zuzoto.ai)
const zo = new ZuzotoClient({ apiKey: "key" });

// Custom URL (e.g. self-hosted)
const zo = new ZuzotoClient("https://your-instance.example.com", { apiKey: "key" });
```

| Option   | Type     | Description                            |
| -------- | -------- | -------------------------------------- |
| `apiKey` | `string` | API key for authentication             |
| `fetch`  | `fetch`  | Custom fetch implementation (optional) |

### Memory

```typescript
// Add a memory (sync, waits for extraction + embedding)
zo.add(input: AddInput): Promise<AddResult>

// Add a memory (async, returns immediately with a job ID)
zo.addAsync(input: AddInput, idempotencyKey?: string): Promise<AsyncAddResult>

// Batch add up to 100 memories (sync)
zo.batchAdd(items: AddInput[]): Promise<BatchAddResult>

// Batch add up to 100 memories (async)
zo.batchAddAsync(items: AddInput[], idempotencyKey?: string): Promise<AsyncAddResult>

// Get a memory by ID
zo.get(id: string): Promise<Memory>

// Update a memory
zo.update(id: string, input: UpdateMemoryInput): Promise<Memory>

// Delete a memory
zo.delete(id: string, mode?: "soft" | "hard" | "gdpr"): Promise<void>

// Hybrid search across memories
zo.search(query: SearchQuery): Promise<SearchResult>

// Assemble a token-budgeted context window for an LLM
zo.getContext(query: ContextQuery): Promise<ContextWindow>

// Forget memories by ID or user
zo.forget(input: ForgetInput): Promise<void>

// Query memories at a point in time
zo.pointInTime(query: string, asOf: string | Date, limit?: number): Promise<SearchResult>

// Ask a temporal question (natural language)
zo.queryTemporal(input: TemporalQueryInput): Promise<TemporalAnswer>
```

### Jobs

```typescript
zo.getJob(id: string): Promise<Job>
```

### Entities

```typescript
zo.listEntities(opts?: ListEntitiesOpts): Promise<Page<Entity>>
zo.createEntity(input: CreateEntityInput): Promise<Entity>
zo.getEntity(id: string): Promise<Entity>
zo.updateEntity(id: string, input: UpdateEntityInput): Promise<Entity>
zo.deleteEntity(id: string, mode?: "soft" | "hard" | "gdpr"): Promise<void>
zo.getEntityState(id: string, asOf?: string | Date): Promise<EntityState>
zo.getEntityTimeline(id: string, from?: string | Date, to?: string | Date): Promise<EntityTimeline>
```

### Facts

```typescript
zo.listFacts(opts?: ListFactsOpts): Promise<Page<Fact>>
zo.createFact(input: CreateFactInput): Promise<Fact>
zo.getFact(id: string): Promise<Fact>
zo.invalidateFact(id: string, input?: InvalidateFactInput): Promise<void>
zo.deleteFact(id: string, mode?: "soft" | "hard" | "gdpr"): Promise<void>
```

### Sessions

```typescript
zo.createSession(input: CreateSessionInput): Promise<Session>
zo.listSessions(opts?: ListSessionsOpts): Promise<Page<Session>>
zo.getSession(id: string): Promise<Session>
zo.closeSession(id: string): Promise<void>
zo.listSessionEpisodes(sessionId: string, opts?: ListEpisodesOpts): Promise<Page<Episode>>
```

### Health & Version

```typescript
zo.health(): Promise<HealthStatus>
zo.ready(): Promise<HealthStatus>
zo.version(): Promise<VersionInfo>
```

## Error Handling

All API errors throw `ZuzotoError` with structured information:

```typescript
import { ZuzotoError } from "@zuzoto/sdk";

try {
  await zo.search({ text: "" });
} catch (err) {
  if (err instanceof ZuzotoError) {
    console.error(`HTTP ${err.status}: ${err.message}`);
    console.error(`Type: ${err.type}`);
    console.error(`Instance: ${err.instance}`);
  }
}
```

## Async Ingestion

For high-throughput scenarios, use async methods to avoid waiting for extraction:

```typescript
// Submit work
const { job_id } = await zo.addAsync(
  {
    content: "Large document...",
    user_id: "user-123",
  },
  "idempotency-key-123",
);

// Poll for completion
let job = await zo.getJob(job_id);
while (job.status === "queued" || job.status === "processing") {
  await new Promise((r) => setTimeout(r, 1000));
  job = await zo.getJob(job_id);
}

if (job.status === "completed") {
  console.log("Done!", job.result);
} else {
  console.error("Failed:", job.error);
}
```

## Requirements

- Node.js 18+ (uses native `fetch`)
- Works in any runtime with a global `fetch` (Deno, Bun, Cloudflare Workers, etc.)

## License

Apache 2.0
