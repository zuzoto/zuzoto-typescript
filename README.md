# @zuzoto/sdk

The official TypeScript SDK for [Zuzoto](https://github.com/zuzoto/zuzoto) — cognitive memory infrastructure for AI agents.

## Install

```bash
npm install @zuzoto/sdk
```

## Quick Start

```typescript
import { ZuzotoClient } from "@zuzoto/sdk";

const client = new ZuzotoClient("https://api.zuzoto.ai", {
  apiKey: "your-api-key",
});

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

- **Memory CRUD** — add, batchAdd, get, update, search, getContext, forget
- **Batch ingestion** — add up to 100 memories in one call
- **Hybrid search** — vector, BM25, graph, temporal strategies
- **Context assembly** — token-budgeted context windows for LLMs
- **Knowledge graph** — entity and fact CRUD, temporal state queries
- **Sessions** — conversation session management
- **Temporal queries** — point-in-time and entity timeline queries
- **Typed errors** — `ZuzotoError` with status code and message
- **Zero dependencies** — uses native `fetch`

## API

### Memory

```typescript
client.add(input: AddInput): Promise<AddResult>
client.batchAdd(items: AddInput[]): Promise<BatchAddResult>
client.get(id: string): Promise<Memory>
client.update(id: string, input: UpdateMemoryInput): Promise<Memory>
client.search(query: SearchQuery): Promise<SearchResult>
client.getContext(query: ContextQuery): Promise<ContextWindow>
client.forget(input: ForgetInput): Promise<void>
client.pointInTime(query: string, asOf: string | Date, limit?: number): Promise<SearchResult>
```

### Entities

```typescript
client.createEntity(input: CreateEntityInput): Promise<Entity>
client.getEntity(id: string): Promise<Entity>
client.updateEntity(id: string, input: UpdateEntityInput): Promise<Entity>
client.deleteEntity(id: string, mode?: "soft" | "hard" | "gdpr"): Promise<void>
client.listEntities(opts?: ListEntitiesOpts): Promise<Page<Entity>>
client.getEntityState(id: string, asOf?: string | Date): Promise<EntityState>
client.getEntityTimeline(id: string, from?: string | Date, to?: string | Date): Promise<EntityTimeline>
```

### Facts

```typescript
client.createFact(input: CreateFactInput): Promise<Fact>
client.getFact(id: string): Promise<Fact>
client.invalidateFact(id: string, input?: InvalidateFactInput): Promise<void>
client.deleteFact(id: string, mode?: "soft" | "hard" | "gdpr"): Promise<void>
client.listFacts(opts?: ListFactsOpts): Promise<Page<Fact>>
```

### Sessions

```typescript
client.createSession(input: CreateSessionInput): Promise<Session>
client.getSession(id: string): Promise<Session>
client.closeSession(id: string): Promise<void>
client.listSessions(opts?: ListSessionsOpts): Promise<Page<Session>>
client.listSessionEpisodes(sessionId: string, opts?: ListEpisodesOpts): Promise<Page<Episode>>
```

## License

Apache 2.0
