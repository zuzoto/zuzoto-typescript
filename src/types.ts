// ---- Core types ------------------------------------------------------------

export interface Memory {
  id: string;
  type: "episodic" | "semantic" | "procedural";
  content: string;
  embedding?: number[];
  scope: Scope;
  temporal: TemporalMetadata;
  provenance: Provenance;
  strength: number;
  access_count: number;
  last_access: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ScoredMemory {
  memory: Memory;
  score: number;
}

export interface Scope {
  org_id?: string;
  project_id?: string;
  user_id?: string;
  session_id?: string;
  agent_id?: string;
}

export interface TemporalMetadata {
  t_valid: string;
  t_invalid?: string | null;
  t_created: string;
  t_modified: string;
  confidence: number;
  source: string;
}

export interface Provenance {
  source_memory_ids?: string[];
  created_by?: string;
  consolidation_id?: string;
  version: number;
}

export interface Entity {
  id: string;
  name: string;
  aliases?: string[];
  entity_type: string;
  properties?: Record<string, unknown>;
  embedding?: number[];
  scope: Scope;
  first_seen: string;
  last_seen: string;
  mention_count: number;
}

export interface Fact {
  id: string;
  type: string;
  content: string;
  subject: string;
  predicate: string;
  object: string;
  negation?: boolean;
  superseded_by?: string | null;
  scope: Scope;
  temporal: TemporalMetadata;
  provenance: Provenance;
  strength: number;
  metadata?: Record<string, unknown>;
}

export interface Episode {
  id: string;
  type: string;
  content: string;
  participants?: string[];
  location?: string;
  event_type?: string;
  sequence: number;
  scope: Scope;
  temporal: TemporalMetadata;
}

export interface Session {
  id: string;
  user_id: string;
  agent_id?: string;
  status: "active" | "closed";
  metadata?: Record<string, unknown>;
  created_at: string;
  closed_at?: string | null;
  expires_at?: string | null;
}

export interface StateChange {
  old_fact: Fact | null;
  new_fact: Fact | null;
  at: string;
}

// ---- Request types ---------------------------------------------------------

export interface AddInput {
  content?: string;
  messages?: Message[];
  user_id?: string;
  session_id?: string;
  agent_id?: string;
  metadata?: Record<string, unknown>;
}

export interface Message {
  role: string;
  content: string;
}

export interface SearchQuery {
  text: string;
  user_id?: string;
  scope?: Scope;
  temporal?: { from?: string; to?: string };
  strategies?: Array<"vector" | "bm25" | "graph" | "temporal" | "all">;
  limit?: number;
  min_score?: number;
}

export interface ContextQuery {
  query: string;
  user_id?: string;
  session_id?: string;
  agent_id?: string;
  max_tokens?: number;
}

export interface ForgetInput {
  memory_id?: string;
  user_id?: string;
  mode?: "soft" | "hard" | "gdpr";
}

export interface UpdateMemoryInput {
  content?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface CreateEntityInput {
  name: string;
  entity_type: string;
  aliases?: string[];
  properties?: Record<string, unknown>;
  user_id?: string;
}

export interface UpdateEntityInput {
  name?: string;
  entity_type?: string;
  aliases?: string[];
  properties?: Record<string, unknown>;
}

export interface CreateFactInput {
  subject: string;
  predicate: string;
  object: string;
  negation?: boolean;
  user_id?: string;
}

export interface InvalidateFactInput {
  superseded_by?: string;
}

export interface CreateSessionInput {
  user_id: string;
  agent_id?: string;
  metadata?: Record<string, unknown>;
  expires_in?: string;
}

// ---- Response types --------------------------------------------------------

export interface AddResult {
  memories: Memory[];
  entities_created: number;
  facts_created: number;
  facts_invalidated: number;
  processing_ms: number;
}

export interface SearchResult {
  memories: ScoredMemory[];
  total: number;
}

export interface ContextWindow {
  memories: ScoredMemory[];
  facts: Fact[];
  summary: string;
  tokens: number;
}

export interface BatchAddResult {
  results: AddResult[];
  total: number;
  errors: number;
  details?: BatchItemError[];
}

export interface BatchItemError {
  index: number;
  message: string;
}

export interface EntityState {
  entity: Entity;
  facts: Fact[];
  as_of: string;
}

export interface EntityTimeline {
  changes: StateChange[];
}

export interface Page<T> {
  items: T[];
  cursor?: string;
  has_more: boolean;
}

// ---- List options ----------------------------------------------------------

export interface ListEntitiesOpts {
  user_id?: string;
  type?: string;
  name_prefix?: string;
  cursor?: string;
  limit?: number;
}

export interface ListFactsOpts {
  user_id?: string;
  subject_id?: string;
  object_id?: string;
  predicate?: string;
  valid_at?: string;
  include_invalid?: boolean;
  cursor?: string;
  limit?: number;
}

export interface ListSessionsOpts {
  user_id?: string;
  status?: "active" | "closed";
  cursor?: string;
  limit?: number;
}

export interface ListEpisodesOpts {
  cursor?: string;
  limit?: number;
}

// ---- Client options --------------------------------------------------------

export interface RetryOptions {
  /** Maximum number of retry attempts. Default: 3. */
  maxRetries?: number;
  /** Initial backoff in ms. Default: 500. */
  initialDelayMs?: number;
  /** Maximum backoff in ms. Default: 30000. */
  maxDelayMs?: number;
  /** Backoff multiplier. Default: 2. */
  multiplier?: number;
  /** Status codes to retry on. Default: [429, 500, 502, 503, 504]. */
  retryableStatuses?: number[];
}

export interface ZuzotoClientOptions {
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
  /** Request timeout in ms. No timeout by default. */
  timeoutMs?: number;
  /** Retry configuration. Pass false to disable retries. */
  retry?: RetryOptions | false;
}

// ---- Async / job types -----------------------------------------------------

export interface AsyncAddResult {
  job_id: string;
  status: string;
  item_count?: number;
}

export interface Job {
  job_id: string;
  job_type: string;
  status: string;
  result?: Record<string, unknown>;
  error?: string;
  item_count: number;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

// ---- Temporal query types --------------------------------------------------

export interface TemporalQueryInput {
  query: string;
  user_id?: string;
}

export interface TemporalAnswer {
  type: string;
  text: string;
  confidence: number;
  [key: string]: unknown;
}

// ---- Version / health types ------------------------------------------------

export interface VersionInfo {
  version: string;
}

export interface HealthStatus {
  status: string;
  service: string;
}

// ---- Datasets --------------------------------------------------------------

/**
 * Per-dataset ingestion + search configuration. Declares which JSON fields
 * of ingested documents are concatenated into the embedding text and which
 * are projected into the filterable metadata column.
 */
export interface DatasetConfig {
  /**
   * Ordered list of JSON field names concatenated (with ". ") to form the
   * text that gets embedded. Ordering matters for quality — put the
   * strongest signal (e.g. "title") first. List a field twice to upweight it.
   */
  embed_fields: string[];
  /**
   * JSON field names projected into the filterable metadata column. Only
   * fields declared here can be referenced in search filters.
   */
  filter_fields: string[];
}

/** A tenant-scoped namespace of structured documents. */
export interface Dataset {
  id: string;
  org_id: string;
  project_id?: string;
  name: string;
  description?: string;
  config: DatasetConfig;
  /**
   * Natural-language instruction shown to the enrichment LLM for every
   * document ingested into this dataset. Populated server-side when the
   * dataset was created with a preset.
   */
  enrichment_prompt?: string;
  /**
   * JSON Schema describing the fields the enrichment LLM should produce.
   * Populated server-side from the chosen preset.
   */
  enrichment_schema?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateDatasetInput {
  /** Unique (per project) dataset name. */
  name: string;
  description?: string;
  project_id?: string;
  config: DatasetConfig;
  /**
   * Optional preset name selecting a curated (prompt, schema) pair for
   * LLM enrichment. Call `client.datasets.listPresets()` for available
   * values. The public API does not accept raw JSON schemas — presets only.
   */
  enrichment_preset?: string;
}

export interface DatasetPreset {
  name: string;
  description: string;
}

export interface ListDatasetPresetsResult {
  presets: DatasetPreset[];
  total: number;
}

export interface ListDatasetsResult {
  datasets: Dataset[];
  total: number;
}

/**
 * A caller-supplied document prior to composition + embedding. When
 * `external_id` is provided upserts are idempotent on `(dataset_id,
 * external_id)`.
 */
export interface DatasetInputDocument {
  external_id?: string;
  data: Record<string, unknown>;
}

/** A single JSON record stored in a dataset. */
export interface DatasetDocument {
  id: string;
  dataset_id: string;
  org_id: string;
  external_id?: string;
  /** Raw caller-supplied JSON, round-tripped unchanged. */
  data: Record<string, unknown>;
  /** Composed text fed to the embedder (includes enriched fields). */
  embed_text?: string;
  /**
   * Filterable projection of `filter_fields` plus any LLM-enriched
   * fields. This is the column metadata filters evaluate against.
   */
  metadata?: Record<string, unknown>;
  /**
   * LLM-derived fields produced by the dataset's enrichment contract.
   * Empty when enrichment is disabled or the enrichment call failed
   * (failures are logged and non-fatal server-side).
   */
  enriched?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UpsertDatasetResult {
  ids: string[];
  upserted: number;
}

/** Operator object form of a dataset filter value. Set exactly one field. */
export interface DatasetFilterOp {
  eq?: unknown;
  neq?: unknown;
  gt?: unknown;
  gte?: unknown;
  lt?: unknown;
  lte?: unknown;
  in?: unknown[];
}

/**
 * One filter value. A scalar performs an equality match; a `DatasetFilterOp`
 * performs a range or set comparison.
 */
export type DatasetFilterValue = string | number | boolean | DatasetFilterOp;

/**
 * Metadata filter grammar for `client.datasets.search()`. Keys MUST be
 * declared in the dataset's `filter_fields` (or produced by its enrichment
 * contract). Unknown keys are rejected as 400.
 */
export type DatasetFilter = Record<string, DatasetFilterValue>;

export interface DatasetSearchQuery {
  /**
   * Natural-language query. Embedded for vector search and passed through
   * `websearch_to_tsquery` for BM25.
   */
  query: string;
  filter?: DatasetFilter;
  /** Number of final results to return. Default 10. */
  limit?: number;
  /** Per-strategy top-K before Reciprocal Rank Fusion. Default 50. */
  candidate_limit?: number;
}

export interface DatasetSearchHit {
  document: DatasetDocument;
  score: number;
}

export interface DatasetSearchResult {
  hits: DatasetSearchHit[];
  total: number;
  /** Confidence in the top result, [0, 1]. */
  confidence: number;
  /** Cheap confidence signal for downstream LLMs. */
  guidance: "high_confidence" | "low_confidence" | "no_match";
  /**
   * True when at least one retrieval strategy (vector or BM25) failed or
   * returned no candidates while the other still produced results. Treat
   * the response as partial.
   */
  degraded?: boolean;
  /** Human-readable notes about partial failures or dropped filter clauses. */
  warnings?: string[];
}
