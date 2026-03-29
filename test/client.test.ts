import { describe, it, expect, vi } from "vitest";
import { ZuzotoClient, ZuzotoError } from "../src/client.js";

function mockFetch(handler: (url: string, init?: RequestInit) => { status: number; body?: unknown }) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const { status, body } = handler(u, init);
    return new Response(body !== undefined ? JSON.stringify(body) : null, {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
}

describe("ZuzotoClient", () => {
  it("add() sends content and returns result", async () => {
    const fetch = mockFetch((url, init) => {
      expect(url).toBe("http://localhost:8080/v1/memories");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(init?.body as string);
      expect(body.content).toBe("hello world");
      // Check auth header
      const headers = init?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer test-key");
      return {
        status: 200,
        body: { memories: [{ id: "m-1", content: "hello world" }], entities_created: 1, facts_created: 2, facts_invalidated: 0, processing_ms: 42 },
      };
    });

    const client = new ZuzotoClient("http://localhost:8080", { apiKey: "test-key", fetch });
    const result = await client.add({ content: "hello world" });
    expect(result.memories).toHaveLength(1);
    expect(result.entities_created).toBe(1);
  });

  it("search() maps user_id to scope", async () => {
    const fetch = mockFetch((_url, init) => {
      const body = JSON.parse(init?.body as string);
      expect(body.text).toBe("vim");
      expect(body.scope.user_id).toBe("u1");
      expect(body.user_id).toBeUndefined();
      return {
        status: 200,
        body: { memories: [{ memory: { content: "uses vim" }, score: 0.95 }], total: 1 },
      };
    });

    const client = new ZuzotoClient("http://localhost:8080", { fetch });
    const result = await client.search({ text: "vim", user_id: "u1" });
    expect(result.total).toBe(1);
    expect(result.memories[0].score).toBe(0.95);
  });

  it("getContext() sends query params", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toContain("query=prefs");
      expect(url).toContain("user_id=u1");
      expect(url).toContain("max_tokens=2048");
      return {
        status: 200,
        body: { memories: [], facts: [], summary: "user likes vim", tokens: 512 },
      };
    });

    const client = new ZuzotoClient("http://localhost:8080", { fetch });
    const ctx = await client.getContext({ query: "prefs", user_id: "u1", max_tokens: 2048 });
    expect(ctx.tokens).toBe(512);
    expect(ctx.summary).toBe("user likes vim");
  });

  it("forget() handles 204", async () => {
    const fetch = mockFetch(() => ({ status: 204 }));
    const client = new ZuzotoClient("http://localhost:8080", { fetch });
    await expect(client.forget({ memory_id: "m-1" })).resolves.toBeUndefined();
  });

  it("batchAdd() sends items array", async () => {
    const fetch = mockFetch((_url, init) => {
      const body = JSON.parse(init?.body as string);
      expect(body.items).toHaveLength(2);
      return { status: 200, body: { results: [], total: 2, errors: 0 } };
    });

    const client = new ZuzotoClient("http://localhost:8080", { fetch });
    const result = await client.batchAdd([{ content: "first" }, { content: "second" }]);
    expect(result.total).toBe(2);
  });

  it("throws ZuzotoError on 400", async () => {
    const fetch = mockFetch(() => ({
      status: 400,
      body: { error: "text is required." },
    }));

    const client = new ZuzotoClient("http://localhost:8080", { fetch });
    try {
      await client.search({ text: "" });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ZuzotoError);
      expect((err as ZuzotoError).status).toBe(400);
      expect((err as ZuzotoError).message).toBe("text is required.");
    }
  });

  it("entity CRUD", async () => {
    let callIndex = 0;
    const fetch = mockFetch((url, init) => {
      callIndex++;
      switch (callIndex) {
        case 1: // create
          expect(init?.method).toBe("POST");
          return { status: 201, body: { id: "e-1", name: "Alice", entity_type: "person" } };
        case 2: // get
          expect(init?.method).toBe("GET");
          expect(url).toContain("/v1/entities/e-1");
          return { status: 200, body: { id: "e-1", name: "Alice" } };
        case 3: // update
          expect(init?.method).toBe("PATCH");
          return { status: 200, body: { id: "e-1", name: "Alice Updated" } };
        case 4: // delete
          expect(init?.method).toBe("DELETE");
          return { status: 204 };
        default:
          throw new Error(`unexpected call ${callIndex}`);
      }
    });

    const client = new ZuzotoClient("http://localhost:8080", { fetch });
    const entity = await client.createEntity({ name: "Alice", entity_type: "person" });
    expect(entity.name).toBe("Alice");

    const got = await client.getEntity("e-1");
    expect(got.id).toBe("e-1");

    const updated = await client.updateEntity("e-1", { name: "Alice Updated" });
    expect(updated.name).toBe("Alice Updated");

    await client.deleteEntity("e-1", "soft");
  });

  it("fact CRUD", async () => {
    let callIndex = 0;
    const fetch = mockFetch((_url, init) => {
      callIndex++;
      switch (callIndex) {
        case 1: // create
          return { status: 201, body: { id: "f-1", subject: "Alice", predicate: "works_at", object: "Acme" } };
        case 2: // invalidate
          expect(init?.method).toBe("POST");
          return { status: 204 };
        case 3: // delete
          expect(init?.method).toBe("DELETE");
          return { status: 204 };
        default:
          throw new Error(`unexpected call ${callIndex}`);
      }
    });

    const client = new ZuzotoClient("http://localhost:8080", { fetch });
    const fact = await client.createFact({ subject: "Alice", predicate: "works_at", object: "Acme" });
    expect(fact.subject).toBe("Alice");

    await client.invalidateFact("f-1");
    await client.deleteFact("f-1", "hard");
  });

  it("session lifecycle", async () => {
    let callIndex = 0;
    const fetch = mockFetch(() => {
      callIndex++;
      switch (callIndex) {
        case 1: return { status: 201, body: { id: "s-1", user_id: "u1", status: "active" } };
        case 2: return { status: 200, body: { id: "s-1", status: "active" } };
        case 3: return { status: 204 };
        default: throw new Error(`unexpected call ${callIndex}`);
      }
    });

    const client = new ZuzotoClient("http://localhost:8080", { fetch });
    const sess = await client.createSession({ user_id: "u1" });
    expect(sess.status).toBe("active");

    await client.getSession("s-1");
    await client.closeSession("s-1");
  });

  it("pointInTime() sends as_of param", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toContain("as_of=2025-06-01");
      expect(url).toContain("query=test");
      return { status: 200, body: { memories: [], total: 0 } };
    });

    const client = new ZuzotoClient("http://localhost:8080", { fetch });
    await client.pointInTime("test", "2025-06-01T00:00:00Z", 5);
  });

  it("pointInTime() accepts Date object", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toContain("as_of=");
      return { status: 200, body: { memories: [], total: 0 } };
    });

    const client = new ZuzotoClient("http://localhost:8080", { fetch });
    await client.pointInTime("test", new Date("2025-06-01"));
  });

  it("trailing slash in baseURL is handled", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toBe("http://localhost:8080/v1/memories/m-1");
      return { status: 200, body: { id: "m-1" } };
    });

    const client = new ZuzotoClient("http://localhost:8080/", { fetch });
    await client.get("m-1");
  });
});
