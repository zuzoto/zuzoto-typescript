import { VERSION } from "./version.js";
import type {
  AddInput,
  AddResult,
  AsyncAddResult,
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
  HealthStatus,
  InvalidateFactInput,
  Job,
  ListEntitiesOpts,
  ListEpisodesOpts,
  ListFactsOpts,
  ListSessionsOpts,
  Memory,
  Page,
  SearchQuery,
  SearchResult,
  Session,
  TemporalAnswer,
  TemporalQueryInput,
  UpdateEntityInput,
  UpdateMemoryInput,
  VersionInfo,
  ZuzotoClientOptions,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.zuzoto.ai";

/**
 * Zuzoto API client.
 *
 * @example
 * ```ts
 * const client = new ZuzotoClient({ apiKey: "your-key" });
 * const result = await client.add({ content: "User prefers dark mode", user_id: "user-123" });
 * ```
 */
export class ZuzotoClient {
  private baseURL: string;
  private apiKey?: string;
  private fetchFn: typeof globalThis.fetch;

  constructor(options?: ZuzotoClientOptions);
  constructor(baseURL: string, options?: ZuzotoClientOptions);
  constructor(baseURLOrOptions?: string | ZuzotoClientOptions, maybeOptions?: ZuzotoClientOptions) {
    let baseURL: string;
    let options: ZuzotoClientOptions;

    if (typeof baseURLOrOptions === "string") {
      baseURL = baseURLOrOptions;
      options = maybeOptions ?? {};
    } else {
      baseURL = DEFAULT_BASE_URL;
      options = baseURLOrOptions ?? {};
    }

    this.baseURL = baseURL.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetch ?? globalThis.fetch;
  }

  // ---- memories ------------------------------------------------------------

  /** Add a memory (triggers extraction + embedding when engine is active). */
  async add(input: AddInput): Promise<AddResult> {
    return this.post<AddResult>("/v1/memories", input);
  }

  /** Add a memory asynchronously. Returns a job ID for polling. */
  async addAsync(input: AddInput, idempotencyKey?: string): Promise<AsyncAddResult> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return this.post<AsyncAddResult>("/v1/memories/async", input, headers);
  }

  /** Batch add up to 100 memories in one call. */
  async batchAdd(items: AddInput[]): Promise<BatchAddResult> {
    return this.post<BatchAddResult>("/v1/memories/batch", { items });
  }

  /** Batch add up to 100 memories asynchronously. Returns a job ID for polling. */
  async batchAddAsync(items: AddInput[], idempotencyKey?: string): Promise<AsyncAddResult> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return this.post<AsyncAddResult>("/v1/memories/batch/async", { items }, headers);
  }

  /** Get a memory by ID. */
  async get(id: string): Promise<Memory> {
    return this.request<Memory>("GET", `/v1/memories/${encodeURIComponent(id)}`);
  }

  /** Update a memory. */
  async update(id: string, input: UpdateMemoryInput): Promise<Memory> {
    return this.request<Memory>("PATCH", `/v1/memories/${encodeURIComponent(id)}`, input);
  }

  /** Delete a memory by ID. */
  async delete(id: string, mode?: "soft" | "hard" | "gdpr"): Promise<void> {
    const params = mode ? `?mode=${mode}` : "";
    await this.request<void>("DELETE", `/v1/memories/${encodeURIComponent(id)}${params}`);
  }

  /** Hybrid search across memories. */
  async search(query: SearchQuery): Promise<SearchResult> {
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
    return this.request<ContextWindow>("GET", `/v1/memories/context?${params}`);
  }

  /** Forget memories by ID or user. */
  async forget(input: ForgetInput): Promise<void> {
    await this.post("/v1/memories/forget", input);
  }

  /** Query memories at a point in time. */
  async pointInTime(query: string, asOf: string | Date, limit?: number): Promise<SearchResult> {
    const params = new URLSearchParams();
    params.set("query", query);
    params.set("as_of", asOf instanceof Date ? asOf.toISOString() : asOf);
    if (limit) params.set("limit", String(limit));
    return this.request<SearchResult>("GET", `/v1/memories/point-in-time?${params}`);
  }

  /** Ask a temporal question (e.g. "When did X change?"). */
  async queryTemporal(input: TemporalQueryInput): Promise<TemporalAnswer> {
    return this.post<TemporalAnswer>("/v1/memories/temporal", input);
  }

  // ---- jobs ----------------------------------------------------------------

  /** Get the status of an async job. */
  async getJob(id: string): Promise<Job> {
    return this.request<Job>("GET", `/v1/jobs/${encodeURIComponent(id)}`);
  }

  // ---- entities ------------------------------------------------------------

  /** List entities. */
  async listEntities(opts?: ListEntitiesOpts): Promise<Page<Entity>> {
    const params = this.toParams(opts);
    return this.request<Page<Entity>>("GET", `/v1/entities${params ? `?${params}` : ""}`);
  }

  /** Create an entity. */
  async createEntity(input: CreateEntityInput): Promise<Entity> {
    return this.post<Entity>("/v1/entities", input);
  }

  /** Get an entity by ID. */
  async getEntity(id: string): Promise<Entity> {
    return this.request<Entity>("GET", `/v1/entities/${encodeURIComponent(id)}`);
  }

  /** Update an entity. */
  async updateEntity(id: string, input: UpdateEntityInput): Promise<Entity> {
    return this.request<Entity>("PATCH", `/v1/entities/${encodeURIComponent(id)}`, input);
  }

  /** Delete an entity. */
  async deleteEntity(id: string, mode?: "soft" | "hard" | "gdpr"): Promise<void> {
    const params = mode ? `?mode=${mode}` : "";
    await this.request<void>("DELETE", `/v1/entities/${encodeURIComponent(id)}${params}`);
  }

  /** Get entity state at a point in time. */
  async getEntityState(id: string, asOf?: string | Date): Promise<EntityState> {
    const params = new URLSearchParams();
    if (asOf) params.set("as_of", asOf instanceof Date ? asOf.toISOString() : asOf);
    const qs = params.toString();
    return this.request<EntityState>("GET", `/v1/entities/${encodeURIComponent(id)}/state${qs ? `?${qs}` : ""}`);
  }

  /** Get entity change timeline. */
  async getEntityTimeline(id: string, from?: string | Date, to?: string | Date): Promise<EntityTimeline> {
    const params = new URLSearchParams();
    if (from) params.set("from", from instanceof Date ? from.toISOString() : from);
    if (to) params.set("to", to instanceof Date ? to.toISOString() : to);
    const qs = params.toString();
    return this.request<EntityTimeline>("GET", `/v1/entities/${encodeURIComponent(id)}/timeline${qs ? `?${qs}` : ""}`);
  }

  // ---- facts ---------------------------------------------------------------

  /** List facts. */
  async listFacts(opts?: ListFactsOpts): Promise<Page<Fact>> {
    const params = this.toParams(opts);
    return this.request<Page<Fact>>("GET", `/v1/facts${params ? `?${params}` : ""}`);
  }

  /** Create a fact. */
  async createFact(input: CreateFactInput): Promise<Fact> {
    return this.post<Fact>("/v1/facts", input);
  }

  /** Get a fact by ID. */
  async getFact(id: string): Promise<Fact> {
    return this.request<Fact>("GET", `/v1/facts/${encodeURIComponent(id)}`);
  }

  /** Invalidate a fact (mark as no longer true). */
  async invalidateFact(id: string, input?: InvalidateFactInput): Promise<void> {
    await this.post(`/v1/facts/${encodeURIComponent(id)}/invalidate`, input ?? {});
  }

  /** Delete a fact. */
  async deleteFact(id: string, mode?: "soft" | "hard" | "gdpr"): Promise<void> {
    const params = mode ? `?mode=${mode}` : "";
    await this.request<void>("DELETE", `/v1/facts/${encodeURIComponent(id)}${params}`);
  }

  // ---- sessions ------------------------------------------------------------

  /** Create a session. */
  async createSession(input: CreateSessionInput): Promise<Session> {
    return this.post<Session>("/v1/sessions", input);
  }

  /** List sessions. */
  async listSessions(opts?: ListSessionsOpts): Promise<Page<Session>> {
    const params = this.toParams(opts);
    return this.request<Page<Session>>("GET", `/v1/sessions${params ? `?${params}` : ""}`);
  }

  /** Get a session by ID. */
  async getSession(id: string): Promise<Session> {
    return this.request<Session>("GET", `/v1/sessions/${encodeURIComponent(id)}`);
  }

  /** Close a session. */
  async closeSession(id: string): Promise<void> {
    await this.post(`/v1/sessions/${encodeURIComponent(id)}/close`, null);
  }

  /** List episodes in a session. */
  async listSessionEpisodes(sessionId: string, opts?: ListEpisodesOpts): Promise<Page<Episode>> {
    const params = this.toParams(opts);
    return this.request<Page<Episode>>("GET", `/v1/sessions/${encodeURIComponent(sessionId)}/episodes${params ? `?${params}` : ""}`);
  }

  // ---- health / version ----------------------------------------------------

  /** Check if the API is healthy. */
  async health(): Promise<HealthStatus> {
    return this.request<HealthStatus>("GET", "/healthz");
  }

  /** Check if the API is ready to serve requests. */
  async ready(): Promise<HealthStatus> {
    return this.request<HealthStatus>("GET", "/readyz");
  }

  /** Get the API version. */
  async version(): Promise<VersionInfo> {
    return this.request<VersionInfo>("GET", "/v1/version");
  }

  // ---- HTTP transport ------------------------------------------------------

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": `zuzoto-typescript/${VERSION}`,
      ...extra,
    };
    if (this.apiKey) {
      h["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  private async request<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    const resp = await this.fetchFn(`${this.baseURL}${path}`, {
      method,
      headers: this.headers(extraHeaders),
      body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) throw await ZuzotoError.fromResponse(resp);
    if (resp.status === 204 || resp.headers.get("content-length") === "0") {
      return undefined as T;
    }
    return resp.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    return this.request<T>("POST", path, body, extraHeaders);
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

/** Error from the Zuzoto API (RFC 7807 Problem Detail). */
export class ZuzotoError extends Error {
  status: number;
  /** RFC 7807 problem type URI. */
  type?: string;
  /** RFC 7807 short summary. */
  title?: string;
  /** Request ID for debugging. */
  instance?: string;

  constructor(status: number, message: string, opts?: { type?: string; title?: string; instance?: string }) {
    super(message);
    this.name = "ZuzotoError";
    this.status = status;
    this.type = opts?.type;
    this.title = opts?.title;
    this.instance = opts?.instance;
  }

  static async fromResponse(resp: Response): Promise<ZuzotoError> {
    let msg: string;
    let type: string | undefined;
    let title: string | undefined;
    let instance: string | undefined;
    try {
      const body = await resp.json() as Record<string, unknown>;
      if (body.type && typeof body.type === "string") {
        type = body.type as string;
        title = body.title as string | undefined;
        instance = body.instance as string | undefined;
        msg = (body.detail as string) ?? title ?? resp.statusText;
      } else {
        msg = (body.error as string) ?? resp.statusText;
      }
    } catch {
      msg = resp.statusText;
    }
    return new ZuzotoError(resp.status, msg, { type, title, instance });
  }
}
