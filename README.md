# @zuzoto/sdk

The official TypeScript SDK for [Zuzoto](https://github.com/zuzoto/zuzoto) — cognitive memory infrastructure for AI agents.

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

// Defaults to https://api.zuzoto.ai
const client = new ZuzotoClient({ apiKey: "your-api-key" });

// Or specify a custom URL (e.g. self-hosted)
// const client = new ZuzotoClient("http://localhost:8080", { apiKey: "your-api-key" });

// Add a memory
const result = await client.add({
  content: "User prefers dark mode and uses vim",
  user_id: "user-123",
});
console.log(`Added ${result.memories.length} memories, extracted ${result.entities_created} entities`);

// Search memories
const results = await client.search({
  text: "What editor does the user prefer?",
  user_id: "user-123",
});
for (const m of results.memories) {
  console.log(`[${m.score.toFixed(2)}] ${m.memory.content}`);
}

// Get context for LLM
const ctx = await client.getContext({
  query: "Tell me about the user's preferences",
  user_id: "user-123",
  max_tokens: 4096,
});
console.log(`Context: ${ctx.memories.length} memories, ${ctx.facts.length} facts, ${ctx.tokens} tokens`);
```

## Features

- **Memory CRUD** — add, batchAdd, get, update, delete, search, getContext, forget
- **Async ingestion** — addAsync, batchAddAsync with job polling
- **Batch operations** — add up to 100 memories in one call
- **Hybrid search** — vector, BM25, graph, temporal strategies
- **Context assembly** — token-budgeted context windows for LLMs
- **Knowledge graph** — entity and fact CRUD, temporal state queries
- **Temporal queries** — point-in-time, entity timelines, natural language temporal questions
- **Sessions** — conversation session management
- **Jobs** — poll async job status
- **Typed errors** — `ZuzotoError` with RFC 7807 Problem Detail parsing
- **Zero dependencies** — uses native `fetch`

## API Reference

### Constructor

```typescript
// Default URL (https://api.zuzoto.ai)
const client = new ZuzotoClient({ apiKey: "key" });

// Custom URL
const client = new ZuzotoClient("https://your-instance.example.com", { apiKey: "key" });
```

| Option   | Type     | Description                           |
| -------- | -------- | ------------------------------------- |
| `apiKey` | `string` | API key for authentication            |
| `fetch`  | `fetch`  | Custom fetch implementation (optional)|

### Memory

```typescript
// Add a memory (sync — waits for extraction + embedding)
client.add(input: AddInput): Promise<AddResult>

// Add a memory (async — returns immediately with a job ID)
client.addAsync(input: AddInput, idempotencyKey?: string): Promise<AsyncAddResult>

// Batch add up to 100 memories (sync)
client.batchAdd(items: AddInput[]): Promise<BatchAddResult>

// Batch add up to 100 memories (async)
client.batchAddAsync(items: AddInput[], idempotencyKey?: string): Promise<AsyncAddResult>

// Get a memory by ID
client.get(id: string): Promise<Memory>

// Update a memory
client.update(id: string, input: UpdateMemoryInput): Promise<Memory>

// Delete a memory
client.delete(id: string, mode?: "soft" | "hard" | "gdpr"): Promise<void>

// Hybrid search across memories
client.search(query: SearchQuery): Promise<SearchResult>

// Assemble a token-budgeted context window for an LLM
client.getContext(query: ContextQuery): Promise<ContextWindow>

// Forget memories by ID or user
client.forget(input: ForgetInput): Promise<void>

// Query memories at a point in time
client.pointInTime(query: string, asOf: string | Date, limit?: number): Promise<SearchResult>

// Ask a temporal question (natural language)
client.queryTemporal(input: TemporalQueryInput): Promise<TemporalAnswer>
```

### Jobs

```typescript
// Get the status of an async job
client.getJob(id: string): Promise<Job>
```

### Entities

```typescript
// List entities
client.listEntities(opts?: ListEntitiesOpts): Promise<Page<Entity>>

// Create an entity
client.createEntity(input: CreateEntityInput): Promise<Entity>

// Get an entity by ID
client.getEntity(id: string): Promise<Entity>

// Update an entity
client.updateEntity(id: string, input: UpdateEntityInput): Promise<Entity>

// Delete an entity
client.deleteEntity(id: string, mode?: "soft" | "hard" | "gdpr"): Promise<void>

// Get entity state at a point in time
client.getEntityState(id: string, asOf?: string | Date): Promise<EntityState>

// Get entity change timeline
client.getEntityTimeline(id: string, from?: string | Date, to?: string | Date): Promise<EntityTimeline>
```

### Facts

```typescript
// List facts
client.listFacts(opts?: ListFactsOpts): Promise<Page<Fact>>

// Create a fact
client.createFact(input: CreateFactInput): Promise<Fact>

// Get a fact by ID
client.getFact(id: string): Promise<Fact>

// Invalidate a fact (mark as no longer true)
client.invalidateFact(id: string, input?: InvalidateFactInput): Promise<void>

// Delete a fact
client.deleteFact(id: string, mode?: "soft" | "hard" | "gdpr"): Promise<void>
```

### Sessions

```typescript
// Create a session
client.createSession(input: CreateSessionInput): Promise<Session>

// List sessions
client.listSessions(opts?: ListSessionsOpts): Promise<Page<Session>>

// Get a session by ID
client.getSession(id: string): Promise<Session>

// Close a session
client.closeSession(id: string): Promise<void>

// List episodes in a session
client.listSessionEpisodes(sessionId: string, opts?: ListEpisodesOpts): Promise<Page<Episode>>
```

### Health & Version

```typescript
// Check if the API is healthy
client.health(): Promise<HealthStatus>

// Check if the API is ready
client.ready(): Promise<HealthStatus>

// Get the API version
client.version(): Promise<VersionInfo>
```

## Error Handling

All API errors throw `ZuzotoError` with structured information:

```typescript
import { ZuzotoError } from "@zuzoto/sdk";

try {
  await client.search({ text: "" });
} catch (err) {
  if (err instanceof ZuzotoError) {
    console.error(`HTTP ${err.status}: ${err.message}`);
    console.error(`Type: ${err.type}`);       // RFC 7807 problem type URI
    console.error(`Instance: ${err.instance}`); // Request ID for debugging
  }
}
```

## Async Ingestion Pattern

For high-throughput scenarios, use async methods to avoid waiting for extraction:

```typescript
// Submit work
const { job_id } = await client.addAsync({
  content: "Large document...",
  user_id: "user-123",
}, "idempotency-key-123");

// Poll for completion
let job = await client.getJob(job_id);
while (job.status === "queued" || job.status === "processing") {
  await new Promise((r) => setTimeout(r, 1000));
  job = await client.getJob(job_id);
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
