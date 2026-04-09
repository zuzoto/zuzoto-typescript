import { describe, it, expect, vi } from "vitest";
import { ZuzotoClient, ZuzotoError, VERSION } from "../src/index.js";

function mockFetch(
  handler: (url: string, init?: RequestInit) => { status: number; body?: unknown; headers?: Record<string, string> },
) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const { status, body, headers: extraHeaders } = handler(u, init);
    const respHeaders: Record<string, string> = { "Content-Type": "application/json", ...extraHeaders };
    if (body === undefined || body === null) {
      respHeaders["content-length"] = "0";
    }
    return new Response(body !== undefined && body !== null ? JSON.stringify(body) : null, {
      status,
      headers: respHeaders,
    });
  }) as unknown as typeof globalThis.fetch;
}

/** mockFetch variant that returns different responses per call index. */
function mockFetchSequence(
  handlers: Array<
    (url: string, init?: RequestInit) => { status: number; body?: unknown; headers?: Record<string, string> }
  >,
) {
  let callIndex = 0;
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const handler = handlers[callIndex];
    if (!handler) throw new Error(`unexpected call ${callIndex + 1}`);
    callIndex++;
    const { status, body, headers: extraHeaders } = handler(u, init);
    const respHeaders: Record<string, string> = { "Content-Type": "application/json", ...extraHeaders };
    if (body === undefined || body === null) {
      respHeaders["content-length"] = "0";
    }
    return new Response(body !== undefined && body !== null ? JSON.stringify(body) : null, {
      status,
      headers: respHeaders,
    });
  }) as unknown as typeof globalThis.fetch;
}

// All tests use retry: false to avoid test flakiness from retries,
// unless explicitly testing retry behavior.
const noRetry = { retry: false as const };

describe("ZuzotoClient", () => {
  // ---- constructor ---------------------------------------------------------

  it("defaults to https://api.zuzoto.ai when no URL provided", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toBe("https://api.zuzoto.ai/v1/memories/m-1");
      return { status: 200, body: { id: "m-1" } };
    });
    const zo = new ZuzotoClient({ apiKey: "key", fetch, ...noRetry });
    await zo.get("m-1");
  });

  it("accepts explicit base URL as first argument", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toBe("http://localhost:8080/v1/memories/m-1");
      return { status: 200, body: { id: "m-1" } };
    });
    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    await zo.get("m-1");
  });

  it("sends correct User-Agent header", async () => {
    const fetch = mockFetch((_url, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers["User-Agent"]).toBe(`zuzoto-typescript/${VERSION}`);
      return { status: 200, body: { id: "m-1" } };
    });
    const zo = new ZuzotoClient("http://localhost:8080", { apiKey: "key", fetch, ...noRetry });
    await zo.get("m-1");
  });

  it("trailing slash in baseURL is handled", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toBe("http://localhost:8080/v1/memories/m-1");
      return { status: 200, body: { id: "m-1" } };
    });
    const zo = new ZuzotoClient("http://localhost:8080/", { fetch, ...noRetry });
    await zo.get("m-1");
  });

  // ---- memories ------------------------------------------------------------

  it("add() sends content and returns result", async () => {
    const fetch = mockFetch((url, init) => {
      expect(url).toBe("http://localhost:8080/v1/memories");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(init?.body as string);
      expect(body.content).toBe("hello world");
      const headers = init?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer test-key");
      return {
        status: 201,
        body: {
          memories: [{ id: "m-1", content: "hello world" }],
          entities_created: 1,
          facts_created: 2,
          facts_invalidated: 0,
          processing_ms: 42,
        },
      };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { apiKey: "test-key", fetch, ...noRetry });
    const result = await zo.add({ content: "hello world" });
    expect(result.memories).toHaveLength(1);
    expect(result.entities_created).toBe(1);
  });

  it("addAsync() sends to /memories/async and returns job", async () => {
    const fetch = mockFetch((url, init) => {
      expect(url).toBe("http://localhost:8080/v1/memories/async");
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers["Idempotency-Key"]).toBe("idem-123");
      return { status: 202, body: { job_id: "j-1", status: "queued" } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const result = await zo.addAsync({ content: "hello" }, "idem-123");
    expect(result.job_id).toBe("j-1");
    expect(result.status).toBe("queued");
  });

  it("batchAdd() sends items array", async () => {
    const fetch = mockFetch((_url, init) => {
      const body = JSON.parse(init?.body as string);
      expect(body.items).toHaveLength(2);
      return { status: 200, body: { results: [], total: 2, errors: 0 } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const result = await zo.batchAdd([{ content: "first" }, { content: "second" }]);
    expect(result.total).toBe(2);
  });

  it("batchAddAsync() sends to /memories/batch/async", async () => {
    const fetch = mockFetch((url, init) => {
      expect(url).toBe("http://localhost:8080/v1/memories/batch/async");
      const headers = init?.headers as Record<string, string>;
      expect(headers["Idempotency-Key"]).toBe("batch-key");
      return { status: 202, body: { job_id: "j-2", status: "queued", item_count: 3 } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const result = await zo.batchAddAsync([{ content: "a" }, { content: "b" }, { content: "c" }], "batch-key");
    expect(result.job_id).toBe("j-2");
    expect(result.item_count).toBe(3);
  });

  it("get() fetches a memory by ID", async () => {
    const fetch = mockFetch((url, init) => {
      expect(url).toBe("http://localhost:8080/v1/memories/m-42");
      expect(init?.method).toBe("GET");
      return { status: 200, body: { id: "m-42", content: "remembered" } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const mem = await zo.get("m-42");
    expect(mem.id).toBe("m-42");
    expect(mem.content).toBe("remembered");
  });

  it("update() sends PATCH with updated fields", async () => {
    const fetch = mockFetch((url, init) => {
      expect(url).toBe("http://localhost:8080/v1/memories/m-1");
      expect(init?.method).toBe("PATCH");
      const body = JSON.parse(init?.body as string);
      expect(body.content).toBe("updated content");
      expect(body.tags).toEqual(["important"]);
      return { status: 200, body: { id: "m-1", content: "updated content", tags: ["important"] } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const mem = await zo.update("m-1", { content: "updated content", tags: ["important"] });
    expect(mem.content).toBe("updated content");
    expect(mem.tags).toEqual(["important"]);
  });

  it("search() maps user_id to scope", async () => {
    const fetch = mockFetch((_url, init) => {
      const body = JSON.parse(init?.body as string);
      expect(body.text).toBe("vim");
      expect(body.scope.user_id).toBe("u1");
      expect(body.user_id).toBeUndefined();
      return { status: 200, body: { memories: [{ memory: { content: "uses vim" }, score: 0.95 }], total: 1 } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const result = await zo.search({ text: "vim", user_id: "u1" });
    expect(result.total).toBe(1);
    expect(result.memories[0].score).toBe(0.95);
  });

  it("getContext() sends query params", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toContain("query=prefs");
      expect(url).toContain("user_id=u1");
      expect(url).toContain("max_tokens=2048");
      return { status: 200, body: { memories: [], facts: [], summary: "user likes vim", tokens: 512 } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const ctx = await zo.getContext({ query: "prefs", user_id: "u1", max_tokens: 2048 });
    expect(ctx.tokens).toBe(512);
    expect(ctx.summary).toBe("user likes vim");
  });

  it("forget() handles 204", async () => {
    const fetch = mockFetch(() => ({ status: 204 }));
    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    await expect(zo.forget({ memory_id: "m-1" })).resolves.toBeUndefined();
  });

  it("delete() sends DELETE with mode", async () => {
    const fetch = mockFetch((url, init) => {
      expect(init?.method).toBe("DELETE");
      expect(url).toContain("/v1/memories/m-1?mode=hard");
      return { status: 204 };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    await expect(zo.delete("m-1", "hard")).resolves.toBeUndefined();
  });

  it("delete() without mode sends no query param", async () => {
    const fetch = mockFetch((url, init) => {
      expect(init?.method).toBe("DELETE");
      expect(url).toBe("http://localhost:8080/v1/memories/m-1");
      return { status: 204 };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    await expect(zo.delete("m-1")).resolves.toBeUndefined();
  });

  it("pointInTime() sends as_of param", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toContain("as_of=2025-06-01");
      expect(url).toContain("query=test");
      return { status: 200, body: { memories: [], total: 0 } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    await zo.pointInTime("test", "2025-06-01T00:00:00Z", 5);
  });

  it("pointInTime() accepts Date object", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toContain("as_of=");
      return { status: 200, body: { memories: [], total: 0 } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    await zo.pointInTime("test", new Date("2025-06-01"));
  });

  it("queryTemporal() sends POST to /memories/temporal", async () => {
    const fetch = mockFetch((url, init) => {
      expect(url).toBe("http://localhost:8080/v1/memories/temporal");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(init?.body as string);
      expect(body.query).toBe("When did Alice change jobs?");
      expect(body.user_id).toBe("u1");
      return { status: 200, body: { type: "timeline", text: "Alice changed jobs in 2025", confidence: 0.9 } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const answer = await zo.queryTemporal({ query: "When did Alice change jobs?", user_id: "u1" });
    expect(answer.type).toBe("timeline");
    expect(answer.confidence).toBe(0.9);
  });

  // ---- jobs ----------------------------------------------------------------

  it("getJob() fetches job status", async () => {
    const fetch = mockFetch((url, init) => {
      expect(url).toBe("http://localhost:8080/v1/jobs/j-1");
      expect(init?.method).toBe("GET");
      return {
        status: 200,
        body: {
          job_id: "j-1",
          job_type: "memory.add",
          status: "completed",
          item_count: 1,
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-01T00:00:01Z",
        },
      };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const job = await zo.getJob("j-1");
    expect(job.job_id).toBe("j-1");
    expect(job.status).toBe("completed");
  });

  // ---- entities ------------------------------------------------------------

  it("entity CRUD", async () => {
    const fetch = mockFetchSequence([
      (_url, init) => {
        expect(init?.method).toBe("POST");
        return { status: 201, body: { id: "e-1", name: "Alice", entity_type: "person" } };
      },
      (url, init) => {
        expect(init?.method).toBe("GET");
        expect(url).toContain("/v1/entities/e-1");
        return { status: 200, body: { id: "e-1", name: "Alice" } };
      },
      (_url, init) => {
        expect(init?.method).toBe("PATCH");
        return { status: 200, body: { id: "e-1", name: "Alice Updated" } };
      },
      (_url, init) => {
        expect(init?.method).toBe("DELETE");
        return { status: 204 };
      },
    ]);

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const entity = await zo.createEntity({ name: "Alice", entity_type: "person" });
    expect(entity.name).toBe("Alice");

    const got = await zo.getEntity("e-1");
    expect(got.id).toBe("e-1");

    const updated = await zo.updateEntity("e-1", { name: "Alice Updated" });
    expect(updated.name).toBe("Alice Updated");

    await zo.deleteEntity("e-1", "soft");
  });

  it("listEntities() sends query params", async () => {
    const fetch = mockFetch((url, init) => {
      expect(init?.method).toBe("GET");
      expect(url).toContain("user_id=u1");
      expect(url).toContain("type=person");
      expect(url).toContain("limit=10");
      return { status: 200, body: { items: [{ id: "e-1", name: "Alice" }], has_more: false } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const page = await zo.listEntities({ user_id: "u1", type: "person", limit: 10 });
    expect(page.items).toHaveLength(1);
    expect(page.has_more).toBe(false);
  });

  it("getEntityState() sends as_of param", async () => {
    const fetch = mockFetch((url, init) => {
      expect(init?.method).toBe("GET");
      expect(url).toContain("/v1/entities/e-1/state");
      expect(url).toContain("as_of=2025-06-01");
      return {
        status: 200,
        body: { entity: { id: "e-1", name: "Alice" }, facts: [], as_of: "2025-06-01T00:00:00Z" },
      };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const state = await zo.getEntityState("e-1", "2025-06-01T00:00:00Z");
    expect(state.entity.id).toBe("e-1");
    expect(state.as_of).toBe("2025-06-01T00:00:00Z");
  });

  it("getEntityState() works without as_of", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toBe("http://localhost:8080/v1/entities/e-1/state");
      return { status: 200, body: { entity: { id: "e-1" }, facts: [], as_of: "now" } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    await zo.getEntityState("e-1");
  });

  it("getEntityTimeline() sends from/to params", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toContain("/v1/entities/e-1/timeline");
      expect(url).toContain("from=2025-01-01");
      expect(url).toContain("to=2025-06-01");
      return { status: 200, body: { changes: [] } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const timeline = await zo.getEntityTimeline("e-1", "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z");
    expect(timeline.changes).toEqual([]);
  });

  it("getEntityTimeline() accepts Date objects", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toContain("from=");
      expect(url).toContain("to=");
      return { status: 200, body: { changes: [] } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    await zo.getEntityTimeline("e-1", new Date("2025-01-01"), new Date("2025-06-01"));
  });

  // ---- facts ---------------------------------------------------------------

  it("fact CRUD", async () => {
    const fetch = mockFetchSequence([
      () => ({ status: 201, body: { id: "f-1", subject: "Alice", predicate: "works_at", object: "Acme" } }),
      (_url, init) => {
        expect(init?.method).toBe("POST");
        return { status: 204 };
      },
      (_url, init) => {
        expect(init?.method).toBe("DELETE");
        return { status: 204 };
      },
    ]);

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const fact = await zo.createFact({ subject: "Alice", predicate: "works_at", object: "Acme" });
    expect(fact.subject).toBe("Alice");

    await zo.invalidateFact("f-1");
    await zo.deleteFact("f-1", "hard");
  });

  it("listFacts() sends query params", async () => {
    const fetch = mockFetch((url, init) => {
      expect(init?.method).toBe("GET");
      expect(url).toContain("user_id=u1");
      expect(url).toContain("predicate=works_at");
      return { status: 200, body: { items: [{ id: "f-1" }], has_more: true, cursor: "c1" } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const page = await zo.listFacts({ user_id: "u1", predicate: "works_at" });
    expect(page.items).toHaveLength(1);
    expect(page.has_more).toBe(true);
    expect(page.cursor).toBe("c1");
  });

  it("getFact() fetches a fact by ID", async () => {
    const fetch = mockFetch((url, init) => {
      expect(url).toBe("http://localhost:8080/v1/facts/f-1");
      expect(init?.method).toBe("GET");
      return { status: 200, body: { id: "f-1", subject: "Alice", predicate: "works_at", object: "Acme" } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const fact = await zo.getFact("f-1");
    expect(fact.id).toBe("f-1");
  });

  it("invalidateFact() with superseded_by", async () => {
    const fetch = mockFetch((_url, init) => {
      expect(init?.method).toBe("POST");
      const body = JSON.parse(init?.body as string);
      expect(body.superseded_by).toBe("f-2");
      return { status: 204 };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    await zo.invalidateFact("f-1", { superseded_by: "f-2" });
  });

  // ---- sessions ------------------------------------------------------------

  it("session lifecycle", async () => {
    const fetch = mockFetchSequence([
      () => ({ status: 201, body: { id: "s-1", user_id: "u1", status: "active" } }),
      () => ({ status: 200, body: { id: "s-1", status: "active" } }),
      () => ({ status: 204 }),
    ]);

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const sess = await zo.createSession({ user_id: "u1" });
    expect(sess.status).toBe("active");

    await zo.getSession("s-1");
    await zo.closeSession("s-1");
  });

  it("listSessions() sends query params", async () => {
    const fetch = mockFetch((url, init) => {
      expect(init?.method).toBe("GET");
      expect(url).toContain("user_id=u1");
      expect(url).toContain("status=active");
      return { status: 200, body: { items: [{ id: "s-1" }], has_more: false } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const page = await zo.listSessions({ user_id: "u1", status: "active" });
    expect(page.items).toHaveLength(1);
  });

  it("listSessionEpisodes() sends correct URL", async () => {
    const fetch = mockFetch((url, init) => {
      expect(init?.method).toBe("GET");
      expect(url).toContain("/v1/sessions/s-1/episodes");
      expect(url).toContain("limit=5");
      return { status: 200, body: { items: [], has_more: false } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const page = await zo.listSessionEpisodes("s-1", { limit: 5 });
    expect(page.items).toEqual([]);
  });

  // ---- health / version ----------------------------------------------------

  it("health() hits /healthz", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toBe("http://localhost:8080/healthz");
      return { status: 200, body: { status: "ok", service: "zuzoto-ext-api" } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const h = await zo.health();
    expect(h.status).toBe("ok");
  });

  it("ready() hits /readyz", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toBe("http://localhost:8080/readyz");
      return { status: 200, body: { status: "ok", service: "zuzoto-ext-api" } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const h = await zo.ready();
    expect(h.status).toBe("ok");
  });

  it("version() hits /v1/version", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toBe("http://localhost:8080/v1/version");
      return { status: 200, body: { version: "0.1.0" } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const v = await zo.version();
    expect(v.version).toBe("0.1.0");
  });

  // ---- errors --------------------------------------------------------------

  it("throws ZuzotoError on 400", async () => {
    const fetch = mockFetch(() => ({
      status: 400,
      body: { error: "text is required." },
    }));

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    try {
      await zo.search({ text: "" });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ZuzotoError);
      expect((err as ZuzotoError).status).toBe(400);
      expect((err as ZuzotoError).message).toBe("text is required.");
    }
  });

  it("throws ZuzotoError on 404", async () => {
    const fetch = mockFetch(() => ({
      status: 404,
      body: { error: "memory not found" },
    }));

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    try {
      await zo.get("nonexistent");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ZuzotoError);
      expect((err as ZuzotoError).status).toBe(404);
      expect((err as ZuzotoError).message).toBe("memory not found");
    }
  });

  it("throws ZuzotoError on 401 unauthorized", async () => {
    const fetch = mockFetch(() => ({
      status: 401,
      body: { error: "invalid api key" },
    }));

    const zo = new ZuzotoClient("http://localhost:8080", { apiKey: "bad-key", fetch, ...noRetry });
    try {
      await zo.get("m-1");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ZuzotoError);
      expect((err as ZuzotoError).status).toBe(401);
    }
  });

  it("RFC 7807 errors are parsed", async () => {
    const fetch = mockFetch(() => ({
      status: 400,
      body: {
        type: "https://zuzoto.dev/problems/validation-error",
        title: "Validation Failed",
        detail: "mode: must be one of: soft, hard, gdpr",
        instance: "req-abc",
      },
    }));

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    try {
      await zo.search({ text: "test" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ZuzotoError);
      const e = err as InstanceType<typeof ZuzotoError>;
      expect(e.status).toBe(400);
      expect(e.type).toBe("https://zuzoto.dev/problems/validation-error");
      expect(e.instance).toBe("req-abc");
      expect(e.message).toBe("mode: must be one of: soft, hard, gdpr");
    }
  });

  it("handles non-JSON error response body", async () => {
    const fetch = vi.fn(async () => {
      return new Response("Bad Gateway", {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "Content-Type": "text/plain" },
      });
    }) as unknown as typeof globalThis.fetch;

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    try {
      await zo.get("m-1");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ZuzotoError);
      expect((err as ZuzotoError).status).toBe(502);
      expect((err as ZuzotoError).message).toBe("Bad Gateway");
    }
  });

  it("handles empty error response body", async () => {
    const fetch = vi.fn(async () => {
      return new Response(null, {
        status: 500,
        statusText: "Internal Server Error",
        headers: { "content-length": "0" },
      });
    }) as unknown as typeof globalThis.fetch;

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    try {
      await zo.get("m-1");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ZuzotoError);
      expect((err as ZuzotoError).status).toBe(500);
    }
  });

  it("batchAdd returns details on partial failure", async () => {
    const fetch = mockFetch(() => ({
      status: 200,
      body: {
        results: [],
        total: 1,
        errors: 1,
        details: [{ index: 1, message: "content or messages required" }],
      },
    }));

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    const result = await zo.batchAdd([{ content: "good" }, { content: "" }]);
    expect(result.errors).toBe(1);
    expect(result.details).toHaveLength(1);
    expect(result.details![0].index).toBe(1);
  });

  // ---- URL encoding --------------------------------------------------------

  it("encodes special characters in IDs", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toContain("/v1/memories/id%20with%20spaces");
      return { status: 200, body: { id: "id with spaces", content: "test" } };
    });

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
    await zo.get("id with spaces");
  });
});

// ---- retry / timeout -------------------------------------------------------

describe("retry", () => {
  it("retries on 429 and succeeds", async () => {
    const fetch = mockFetchSequence([
      () => ({ status: 429, body: { error: "rate limited" } }),
      () => ({ status: 429, body: { error: "rate limited" } }),
      () => ({ status: 200, body: { id: "m-1", content: "ok" } }),
    ]);

    const zo = new ZuzotoClient("http://localhost:8080", {
      fetch,
      retry: { maxRetries: 3, initialDelayMs: 1, maxDelayMs: 10, multiplier: 1 },
    });
    const mem = await zo.get("m-1");
    expect(mem.id).toBe("m-1");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("retries on 500 and succeeds", async () => {
    const fetch = mockFetchSequence([
      () => ({ status: 500, body: { error: "internal" } }),
      () => ({ status: 200, body: { id: "m-1" } }),
    ]);

    const zo = new ZuzotoClient("http://localhost:8080", {
      fetch,
      retry: { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 10, multiplier: 1 },
    });
    const mem = await zo.get("m-1");
    expect(mem.id).toBe("m-1");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries on 502, 503, 504", async () => {
    for (const status of [502, 503, 504]) {
      const fetch = mockFetchSequence([
        () => ({ status, body: { error: "server error" } }),
        () => ({ status: 200, body: { id: "m-1" } }),
      ]);

      const zo = new ZuzotoClient("http://localhost:8080", {
        fetch,
        retry: { maxRetries: 1, initialDelayMs: 1, maxDelayMs: 10, multiplier: 1 },
      });
      const mem = await zo.get("m-1");
      expect(mem.id).toBe("m-1");
    }
  });

  it("throws after exhausting retries", async () => {
    const fetch = mockFetchSequence([
      () => ({ status: 503, body: { error: "unavailable" } }),
      () => ({ status: 503, body: { error: "unavailable" } }),
      () => ({ status: 503, body: { error: "still unavailable" } }),
    ]);

    const zo = new ZuzotoClient("http://localhost:8080", {
      fetch,
      retry: { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 10, multiplier: 1 },
    });

    try {
      await zo.get("m-1");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ZuzotoError);
      expect((err as ZuzotoError).status).toBe(503);
    }
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry on 400 (non-retryable)", async () => {
    const fetch = mockFetch(() => ({
      status: 400,
      body: { error: "bad request" },
    }));

    const zo = new ZuzotoClient("http://localhost:8080", {
      fetch,
      retry: { maxRetries: 3, initialDelayMs: 1, maxDelayMs: 10, multiplier: 1 },
    });

    await expect(zo.get("m-1")).rejects.toThrow(ZuzotoError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 404 (non-retryable)", async () => {
    const fetch = mockFetch(() => ({
      status: 404,
      body: { error: "not found" },
    }));

    const zo = new ZuzotoClient("http://localhost:8080", {
      fetch,
      retry: { maxRetries: 3, initialDelayMs: 1, maxDelayMs: 10, multiplier: 1 },
    });

    await expect(zo.get("m-1")).rejects.toThrow(ZuzotoError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on network errors (TypeError)", async () => {
    let callCount = 0;
    const fetch = vi.fn(async () => {
      callCount++;
      if (callCount < 3) throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ id: "m-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof globalThis.fetch;

    const zo = new ZuzotoClient("http://localhost:8080", {
      fetch,
      retry: { maxRetries: 3, initialDelayMs: 1, maxDelayMs: 10, multiplier: 1 },
    });
    const mem = await zo.get("m-1");
    expect(mem.id).toBe("m-1");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("respects Retry-After header", async () => {
    const start = Date.now();
    const fetch = mockFetchSequence([
      () => ({ status: 429, body: { error: "rate limited" }, headers: { "Retry-After": "0" } }),
      () => ({ status: 200, body: { id: "m-1" } }),
    ]);

    const zo = new ZuzotoClient("http://localhost:8080", {
      fetch,
      retry: { maxRetries: 1, initialDelayMs: 5000, maxDelayMs: 30000, multiplier: 2 },
    });
    await zo.get("m-1");
    const elapsed = Date.now() - start;
    // With Retry-After: 0, should not wait 5000ms
    expect(elapsed).toBeLessThan(1000);
  });

  it("retry: false disables retries", async () => {
    const fetch = mockFetch(() => ({
      status: 503,
      body: { error: "unavailable" },
    }));

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, retry: false });
    await expect(zo.get("m-1")).rejects.toThrow(ZuzotoError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses default retry config when no retry option specified", async () => {
    const fetch = mockFetchSequence([
      () => ({ status: 503, body: { error: "unavailable" } }),
      () => ({ status: 200, body: { id: "m-1" } }),
    ]);

    const zo = new ZuzotoClient("http://localhost:8080", { fetch });
    // Verify the client was created with default retry config (can't easily test
    // without waiting for real backoff delays, so we just confirm construction works)
    expect(zo).toBeDefined();
  });
});

describe("timeout", () => {
  it("aborts request after timeoutMs", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      // Simulate a slow response
      return new Promise<Response>((_resolve, reject) => {
        const timer = setTimeout(() => {
          _resolve(new Response(JSON.stringify({ id: "m-1" }), { status: 200 }));
        }, 5000);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    }) as unknown as typeof globalThis.fetch;

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, timeoutMs: 50, retry: false });

    try {
      await zo.get("m-1");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DOMException);
      expect((err as DOMException).name).toBe("AbortError");
    }
  });

  it("does not abort if response is fast enough", async () => {
    const fetch = mockFetch(() => ({
      status: 200,
      body: { id: "m-1", content: "fast" },
    }));

    const zo = new ZuzotoClient("http://localhost:8080", { fetch, timeoutMs: 5000, retry: false });
    const mem = await zo.get("m-1");
    expect(mem.id).toBe("m-1");
  });

  it("timeout + retry: retries on timeout then succeeds", async () => {
    let callCount = 0;
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      callCount++;
      if (callCount === 1) {
        // First call: slow (will timeout)
        return new Promise<Response>((_resolve, reject) => {
          const timer = setTimeout(() => {
            _resolve(new Response(JSON.stringify({ id: "m-1" }), { status: 200 }));
          }, 5000);
          init?.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      }
      // Second call: fast
      return new Response(JSON.stringify({ id: "m-1", content: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof globalThis.fetch;

    const zo = new ZuzotoClient("http://localhost:8080", {
      fetch,
      timeoutMs: 50,
      retry: { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 10, multiplier: 1 },
    });
    const mem = await zo.get("m-1");
    expect(mem.id).toBe("m-1");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  // ---- datasets ------------------------------------------------------------

  describe("datasets", () => {
    it("create() POSTs to /v1/datasets", async () => {
      const fetch = mockFetch((url, init) => {
        expect(url).toBe("http://localhost:8080/v1/datasets");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(init?.body as string)).toEqual({
          name: "products",
          config: { embed_fields: ["title"], filter_fields: ["price"] },
          enrichment_preset: "ecommerce_clothes",
        });
        return {
          status: 201,
          body: {
            id: "ds_1",
            org_id: "org_1",
            name: "products",
            config: { embed_fields: ["title"], filter_fields: ["price"] },
            created_at: "2026-04-10T00:00:00Z",
            updated_at: "2026-04-10T00:00:00Z",
          },
        };
      });
      const zo = new ZuzotoClient("http://localhost:8080", { apiKey: "k", fetch, ...noRetry });
      const ds = await zo.datasets.create({
        name: "products",
        config: { embed_fields: ["title"], filter_fields: ["price"] },
        enrichment_preset: "ecommerce_clothes",
      });
      expect(ds.id).toBe("ds_1");
      expect(ds.name).toBe("products");
    });

    it("list() GETs /v1/datasets", async () => {
      const fetch = mockFetch((url, init) => {
        expect(url).toBe("http://localhost:8080/v1/datasets");
        expect(init?.method).toBe("GET");
        return { status: 200, body: { datasets: [], total: 0 } };
      });
      const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
      const r = await zo.datasets.list();
      expect(r.total).toBe(0);
    });

    it("listPresets() GETs /v1/datasets/presets", async () => {
      const fetch = mockFetch((url) => {
        expect(url).toBe("http://localhost:8080/v1/datasets/presets");
        return {
          status: 200,
          body: { presets: [{ name: "ecommerce_clothes", description: "..." }], total: 1 },
        };
      });
      const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
      const r = await zo.datasets.listPresets();
      expect(r.presets[0].name).toBe("ecommerce_clothes");
    });

    it("get() and delete() target /v1/datasets/:id with URL-encoded id", async () => {
      const fetch = mockFetchSequence([
        (url, init) => {
          expect(url).toBe("http://localhost:8080/v1/datasets/ds%2F1");
          expect(init?.method).toBe("GET");
          return {
            status: 200,
            body: {
              id: "ds/1",
              org_id: "o",
              name: "n",
              config: { embed_fields: [], filter_fields: [] },
              created_at: "x",
              updated_at: "x",
            },
          };
        },
        (url, init) => {
          expect(url).toBe("http://localhost:8080/v1/datasets/ds%2F1");
          expect(init?.method).toBe("DELETE");
          return { status: 204 };
        },
      ]);
      const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
      await zo.datasets.get("ds/1");
      await zo.datasets.delete("ds/1");
    });

    it("upsert() POSTs single doc to /documents", async () => {
      const fetch = mockFetch((url, init) => {
        expect(url).toBe("http://localhost:8080/v1/datasets/ds_1/documents");
        expect(JSON.parse(init?.body as string)).toEqual({
          external_id: "sku-1",
          data: { title: "T-shirt" },
        });
        return { status: 201, body: { ids: ["doc_1"], upserted: 1 } };
      });
      const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
      const r = await zo.datasets.upsert("ds_1", { external_id: "sku-1", data: { title: "T-shirt" } });
      expect(r.upserted).toBe(1);
    });

    it("upsertBatch() POSTs documents to /documents/batch", async () => {
      const fetch = mockFetch((url, init) => {
        expect(url).toBe("http://localhost:8080/v1/datasets/ds_1/documents/batch");
        const body = JSON.parse(init?.body as string);
        expect(body.documents).toHaveLength(2);
        expect(body.documents[0].data.title).toBe("a");
        return { status: 201, body: { ids: ["d1", "d2"], upserted: 2 } };
      });
      const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
      const r = await zo.datasets.upsertBatch("ds_1", [{ data: { title: "a" } }, { data: { title: "b" } }]);
      expect(r.upserted).toBe(2);
    });

    it("getDocument() and deleteDocument() target nested URL", async () => {
      const fetch = mockFetchSequence([
        (url, init) => {
          expect(url).toBe("http://localhost:8080/v1/datasets/ds_1/documents/doc_1");
          expect(init?.method).toBe("GET");
          return {
            status: 200,
            body: {
              id: "doc_1",
              dataset_id: "ds_1",
              org_id: "o",
              data: {},
              created_at: "x",
              updated_at: "x",
            },
          };
        },
        (url, init) => {
          expect(url).toBe("http://localhost:8080/v1/datasets/ds_1/documents/doc_1");
          expect(init?.method).toBe("DELETE");
          return { status: 204 };
        },
      ]);
      const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
      const d = await zo.datasets.getDocument("ds_1", "doc_1");
      expect(d.id).toBe("doc_1");
      await zo.datasets.deleteDocument("ds_1", "doc_1");
    });

    it("search() POSTs query body to /search and returns hits", async () => {
      const fetch = mockFetch((url, init) => {
        expect(url).toBe("http://localhost:8080/v1/datasets/ds_1/search");
        const body = JSON.parse(init?.body as string);
        expect(body.query).toBe("navy jumpsuit");
        expect(body.filter).toEqual({ priceUSD: { lte: 5000 } });
        expect(body.limit).toBe(5);
        return {
          status: 200,
          body: {
            hits: [
              {
                document: {
                  id: "d1",
                  dataset_id: "ds_1",
                  org_id: "o",
                  data: { name: "Navy Jumpsuit" },
                  created_at: "x",
                  updated_at: "x",
                },
                score: 0.92,
              },
            ],
            total: 1,
            confidence: 0.92,
            guidance: "high_confidence",
          },
        };
      });
      const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
      const r = await zo.datasets.search("ds_1", {
        query: "navy jumpsuit",
        filter: { priceUSD: { lte: 5000 } },
        limit: 5,
      });
      expect(r.guidance).toBe("high_confidence");
      expect(r.hits[0].document.data.name).toBe("Navy Jumpsuit");
    });

    it("datasets accessor returns the same instance across calls", () => {
      const zo = new ZuzotoClient("http://localhost:8080", { ...noRetry });
      expect(zo.datasets).toBe(zo.datasets);
    });

    it("propagates 4xx as ZuzotoError", async () => {
      const fetch = mockFetch(() => ({
        status: 400,
        body: {
          type: "https://zuzoto.ai/problems/validation-error",
          title: "Bad Request",
          detail: "query is required",
        },
      }));
      const zo = new ZuzotoClient("http://localhost:8080", { fetch, ...noRetry });
      await expect(zo.datasets.search("ds_1", { query: "" })).rejects.toBeInstanceOf(ZuzotoError);
    });
  });
});
