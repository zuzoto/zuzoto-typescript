import type {
  AddInput,
  AddResult,
  BatchAddResult,
  ContextQuery,
  ContextWindow,
  CreateEntityInput,
  CreateFactInput,
  CreateSessionInput,
  Entity,
  EntityState,
  EntityTimeline,
  Episode,
  Fact,
  ForgetInput,
  InvalidateFactInput,
  ListEntitiesOpts,
  ListEpisodesOpts,
  ListFactsOpts,
  ListSessionsOpts,
  Memory,
  Page,
  SearchQuery,
  SearchResult,
  Session,
  UpdateEntityInput,
  UpdateMemoryInput,
  ZuzotoClientOptions,
} from "./types.js";

/**
 * Zuzoto API client.
 *
 * @example
 * ```ts
 * const client = new ZuzotoClient("https://api.zuzoto.ai", { apiKey: "your-key" });
 * const result = await client.add({ content: "User prefers dark mode", user_id: "user-123" });
 * ```
 */
export class ZuzotoClient {
  private baseURL: string;
  private apiKey?: string;
  private fetchFn: typeof globalThis.fetch;

  constructor(baseURL: string, options: ZuzotoClientOptions = {}) {
    this.baseURL = baseURL.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetch ?? globalThis.fetch;
  }

  // ---- memories ------------------------------------------------------------

  /** Add a memory (triggers extraction + embedding when engine is active). */
  async add(input: AddInput): Promise<AddResult> {
    return this.post<AddResult>("/v1/memories", input);
  }

  /** Batch add up to 100 memories in one call. */
  async batchAdd(items: AddInput[]): Promise<BatchAddResult> {
    return this.post<BatchAddResult>("/v1/memories/batch", { items });
  }

  /** Get a memory by ID. */
  async get(id: string): Promise<Memory> {
    return this.fetch<Memory>(`/v1/memories/${encodeURIComponent(id)}`);
  }

  /** Update a memory. */
  async update(id: string, input: UpdateMemoryInput): Promise<Memory> {
    return this.patch<Memory>(`/v1/memories/${encodeURIComponent(id)}`, input);
  }

  /** Hybrid search across memories. */
  async search(query: SearchQuery): Promise<SearchResult> {
    // Map convenience user_id to scope.
    const body: Record<string, unknown> = { ...query };
    if (query.user_id) {
      body.scope = { ...query.scope, user_id: query.user_id };
      delete body.user_id;
    }
    return this.post<SearchResult>("/v1/memories/search", body);
  }

  /** Assemble a token-budgeted context window for an LLM. */
  async getContext(query: ContextQuery): Promise<ContextWindow> {
    const params = new URLSearchParams();
    params.set("query", query.query);
    if (query.user_id) params.set("user_id", query.user_id);
    if (query.session_id) params.set("session_id", query.session_id);
    if (query.agent_id) params.set("agent_id", query.agent_id);
    if (query.max_tokens) params.set("max_tokens", String(query.max_tokens));
    return this.fetch<ContextWindow>(`/v1/memories/context?${params}`);
  }

  /** Forget memories by ID or user. */
  async forget(input: ForgetInput): Promise<void> {
    await this.postRaw("/v1/memories/forget", input);
  }

  /** Query memories at a point in time. */
  async pointInTime(query: string, asOf: string | Date, limit?: number): Promise<SearchResult> {
    const params = new URLSearchParams();
    params.set("query", query);
    params.set("as_of", asOf instanceof Date ? asOf.toISOString() : asOf);
    if (limit) params.set("limit", String(limit));
    return this.fetch<SearchResult>(`/v1/memories/point-in-time?${params}`);
  }

  // ---- entities ------------------------------------------------------------

  /** List entities. */
  async listEntities(opts?: ListEntitiesOpts): Promise<Page<Entity>> {
    const params = this.toParams(opts);
    return this.fetch<Page<Entity>>(`/v1/entities${params ? `?${params}` : ""}`);
  }

  /** Create an entity. */
  async createEntity(input: CreateEntityInput): Promise<Entity> {
    return this.post<Entity>("/v1/entities", input);
  }

  /** Get an entity by ID. */
  async getEntity(id: string): Promise<Entity> {
    return this.fetch<Entity>(`/v1/entities/${encodeURIComponent(id)}`);
  }

  /** Update an entity. */
  async updateEntity(id: string, input: UpdateEntityInput): Promise<Entity> {
    return this.patch<Entity>(`/v1/entities/${encodeURIComponent(id)}`, input);
  }

  /** Delete an entity. */
  async deleteEntity(id: string, mode?: "soft" | "hard" | "gdpr"): Promise<void> {
    const params = mode ? `?mode=${mode}` : "";
    await this.del(`/v1/entities/${encodeURIComponent(id)}${params}`);
  }

  /** Get entity state at a point in time. */
  async getEntityState(id: string, asOf?: string | Date): Promise<EntityState> {
    const params = new URLSearchParams();
    if (asOf) params.set("as_of", asOf instanceof Date ? asOf.toISOString() : asOf);
    const qs = params.toString();
    return this.fetch<EntityState>(`/v1/entities/${encodeURIComponent(id)}/state${qs ? `?${qs}` : ""}`);
  }

  /** Get entity change timeline. */
  async getEntityTimeline(id: string, from?: string | Date, to?: string | Date): Promise<EntityTimeline> {
    const params = new URLSearchParams();
    if (from) params.set("from", from instanceof Date ? from.toISOString() : from);
    if (to) params.set("to", to instanceof Date ? to.toISOString() : to);
    const qs = params.toString();
    return this.fetch<EntityTimeline>(`/v1/entities/${encodeURIComponent(id)}/timeline${qs ? `?${qs}` : ""}`);
  }

  // ---- facts ---------------------------------------------------------------

  /** List facts. */
  async listFacts(opts?: ListFactsOpts): Promise<Page<Fact>> {
    const params = this.toParams(opts);
    return this.fetch<Page<Fact>>(`/v1/facts${params ? `?${params}` : ""}`);
  }

  /** Create a fact. */
  async createFact(input: CreateFactInput): Promise<Fact> {
    return this.post<Fact>("/v1/facts", input);
  }

  /** Get a fact by ID. */
  async getFact(id: string): Promise<Fact> {
    return this.fetch<Fact>(`/v1/facts/${encodeURIComponent(id)}`);
  }

  /** Invalidate a fact (mark as no longer true). */
  async invalidateFact(id: string, input?: InvalidateFactInput): Promise<void> {
    await this.postRaw(`/v1/facts/${encodeURIComponent(id)}/invalidate`, input ?? {});
  }

  /** Delete a fact. */
  async deleteFact(id: string, mode?: "soft" | "hard" | "gdpr"): Promise<void> {
    const params = mode ? `?mode=${mode}` : "";
    await this.del(`/v1/facts/${encodeURIComponent(id)}${params}`);
  }

  // ---- sessions ------------------------------------------------------------

  /** Create a session. */
  async createSession(input: CreateSessionInput): Promise<Session> {
    return this.post<Session>("/v1/sessions", input);
  }

  /** List sessions. */
  async listSessions(opts?: ListSessionsOpts): Promise<Page<Session>> {
    const params = this.toParams(opts);
    return this.fetch<Page<Session>>(`/v1/sessions${params ? `?${params}` : ""}`);
  }

  /** Get a session by ID. */
  async getSession(id: string): Promise<Session> {
    return this.fetch<Session>(`/v1/sessions/${encodeURIComponent(id)}`);
  }

  /** Close a session. */
  async closeSession(id: string): Promise<void> {
    await this.postRaw(`/v1/sessions/${encodeURIComponent(id)}/close`, null);
  }

  /** List episodes in a session. */
  async listSessionEpisodes(sessionId: string, opts?: ListEpisodesOpts): Promise<Page<Episode>> {
    const params = this.toParams(opts);
    return this.fetch<Page<Episode>>(`/v1/sessions/${encodeURIComponent(sessionId)}/episodes${params ? `?${params}` : ""}`);
  }

  // ---- HTTP transport ------------------------------------------------------

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "@zuzoto/sdk/0.1.0",
    };
    if (this.apiKey) {
      h["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  private async fetch<T>(path: string): Promise<T> {
    const resp = await this.fetchFn(`${this.baseURL}${path}`, {
      method: "GET",
      headers: this.headers(),
    });
    if (!resp.ok) throw await ZuzotoError.fromResponse(resp);
    return resp.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const resp = await this.fetchFn(`${this.baseURL}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw await ZuzotoError.fromResponse(resp);
    return resp.json() as Promise<T>;
  }

  private async postRaw(path: string, body: unknown): Promise<Response> {
    const resp = await this.fetchFn(`${this.baseURL}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: body !== null ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) throw await ZuzotoError.fromResponse(resp);
    return resp;
  }

  private async patch<T>(path: string, body: unknown): Promise<T> {
    const resp = await this.fetchFn(`${this.baseURL}${path}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw await ZuzotoError.fromResponse(resp);
    return resp.json() as Promise<T>;
  }

  private async del(path: string): Promise<void> {
    const resp = await this.fetchFn(`${this.baseURL}${path}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!resp.ok) throw await ZuzotoError.fromResponse(resp);
  }

  private toParams(opts?: Record<string, unknown> | object): string {
    if (!opts) return "";
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(opts as Record<string, unknown>)) {
      if (v !== undefined && v !== null && v !== "") {
        params.set(k, String(v));
      }
    }
    return params.toString();
  }
}

/** Error from the Zuzoto API. */
export class ZuzotoError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ZuzotoError";
    this.status = status;
  }

  static async fromResponse(resp: Response): Promise<ZuzotoError> {
    let msg: string;
    try {
      const body = await resp.json() as { error?: string };
      msg = body.error ?? resp.statusText;
    } catch {
      msg = resp.statusText;
    }
    return new ZuzotoError(resp.status, msg);
  }
}
