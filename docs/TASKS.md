# Build Tasks: Prompt Vault (MVP)

The ordered sequence of tasks to build Prompt Vault from the design docs. Each task lists what it delivers and how it's
verified. Vocabulary follows [`CONTEXT.md`](CONTEXT.md); constraints come from the [PRD](prd/prompt-vault-mvp.md) and
the [ADRs](adr/README.md).

Ordering rule: each phase depends on the ones before it. Tests are written at the seam the [PRD's Testing Decisions](prd/prompt-vault-mvp.md#testing-decisions) name (HTTP front door for the backend, the injected Claude-client for the model boundary, the rendered UI + MSW for the frontend), not against internal structure.

---

## Phase 0 — Repository & tooling

**Decisions locked (grilling session):**
- **Repo:** own repository — `github.com/paulwoods/promptvault` (created; `develop` pushed).
- **Layout:** monorepo, two self-contained siblings — `backend/` (own `pom.xml`) and `frontend/` (own `package.json`); no parent aggregator POM. `docs/` and `CONTEXT.md` stay at root.
- **Backend:** Maven (`./mvnw`), Java 25 (LTS), Spring Boot 4.1 (latest 4.x — confirm GA at scaffold time, else latest 4.x).
- **Frontend:** Node 22 LTS + npm + Vite + React + TypeScript; Vitest as test runner (hosts React Testing Library + MSW per the PRD).
- **Dev database:** root `docker-compose.yml` with one pinned **Postgres 18** service (dev creds, named volume). Testcontainers pinned to the same major in Phase 1.
- **Dev SPA↔API wiring:** Vite dev-server proxy — SPA calls same-origin `/api/*`, proxied to `localhost:8080`. No backend CORS for now.
- **Lint/format:** frontend ESLint (typescript-eslint) + Prettier; backend Spotless bound to the Maven `verify` phase; root `.editorconfig`. No git/pre-commit hooks.
- **Config/secrets:** committed `.env.example` documenting every required var; real `.env` git-ignored. Backend reads config from the environment. `PROMPTVAULT_ENC_KEY` (ADR-0002) never committed; a dev-only key is documented for local runs.

- [x] **0.1 Repo home.** Prompt Vault is its own repository — `github.com/paulwoods/promptvault`, current branch `develop`. → *done.*
- [x] **0.2 Scaffold the monorepo layout.** Create `backend/` and `frontend/` as independently buildable siblings. → *verify: `cd backend && ./mvnw verify` and `cd frontend && npm run build` each succeed in isolation.*
- [x] **0.3 Scaffold the backend deployable.** Maven Spring Boot 4.x app on Java 25, boots to a health/hello endpoint. → *verify: `./mvnw spring-boot:run` starts and the endpoint responds.*
- [x] **0.4 Scaffold the frontend deployable.** Vite + React + TS SPA with Vitest configured. → *verify: `npm run dev` serves the SPA; a trivial Vitest test passes.*
- [x] **0.5 Add local Postgres.** Root `docker-compose.yml` with a pinned Postgres 18 service. → *verify: `docker compose up -d` starts Postgres and the backend can connect.*
- [x] **0.6 Wire the Vite proxy.** SPA `/api/*` → `localhost:8080`. → *verify: the SPA reaches the backend hello endpoint same-origin, no CORS error.*
- [x] **0.7 Wire lint/format.** ESLint + Prettier + `.editorconfig` (frontend); Spotless in `verify` (backend). → *verify: `npm run lint` and `./mvnw verify` fail on unformatted/lint-broken code, pass when clean.*
- [x] **0.8 Config & secrets scaffolding.** Committed `.env.example` (incl. `PROMPTVAULT_ENC_KEY`, DB url/user/password, JWT secret); `.env` git-ignored; backend reads from env. → *verify: a fresh clone runs after copying `.env.example` → `.env`; no secret is tracked by git.*
- [x] **0.9 Root README quickstart.** Prerequisites (JDK 25, Node 22, Docker) and the clone → `.env` → `docker compose up` → backend → frontend sequence with dev URLs. → *verify: following the README from a clean clone yields a running app.*

## Phase 1 — Persistence foundation

**Decisions locked (grilling session):**
- **Primary keys:** `uuid` columns, UUIDv7 generated app-side, across all tables and foreign keys.
- **Table naming:** snake_case; `users` is plural (avoids the reserved word `user`), all other tables singular (`prompt`, `version`, `run`, `variable` — none are reserved in Postgres).
- **Schema ownership:** Flyway is the single source of truth; `spring.jpa.hibernate.ddl-auto=validate` (Hibernate checks entities against the migrated schema, never alters it).
- **Timestamps:** `timestamptz` (UTC), set by the DB via `DEFAULT now()`. `created_at` on every table; `updated_at` only on mutable rows (`users`, the encrypted-key row).
- **Migrations:** plain-SQL, versioned only, integer-sequenced `V<n>__snake_case.sql` in `backend/src/main/resources/db/migration`. No `R__`/Java migrations. `flyway.clean` disabled except under the test profile.
- **Test harness:** one shared Postgres 18 container for the whole suite (singleton + `@ServiceConnection`), Flyway-migrated (not Hibernate create-drop); isolation by transactional rollback per test, truncate where rollback can't apply (e.g. streaming tests).
- **`users` table:** case-insensitive email uniqueness via a unique index on `lower(email)` (email stored as entered, matched lowercased); `password_hash` as `text` (BCrypt).
- **Config profiles:** `dev` (compose Postgres at `localhost:5432`, creds from `.env`) and `test` (Testcontainers supplies the datasource, `flyway.clean` permitted, fixed throwaway secrets). Same migrations and `ddl-auto=validate` in both.

- [x] **1.1 Add PostgreSQL + Spring Data JPA + Flyway.** Wire the `dev` profile to the compose Postgres; `ddl-auto=validate`. → *verify: app starts against the compose DB and Flyway runs.*
- [x] **1.2 Stand up the Testcontainers harness** — shared Postgres 18 (`@SpringBootTest` + MockMvc/WebTestClient against the real container), Flyway-migrated, rollback-per-test isolation, `test` profile. → *verify: a trivial repository test passes against the container.*
- [x] **1.3 First Flyway migration: `users` table** — UUIDv7 PK, email stored as entered with a unique index on `lower(email)`, `password_hash` (text), `created_at`/`updated_at` (`timestamptz DEFAULT now()`). → *verify: migration applies on a fresh DB; `lower(email)` uniqueness rejects case-variant duplicates.*

## Phase 2 — Accounts & authentication *(User stories 1–6)*

**Decisions locked (grilling session):**
- **JWT signing:** HS256 with an env-supplied secret (`PROMPTVAULT_JWT_SECRET`, ≥256-bit); test profile uses a fixed throwaway. Library: **JJWT** (`io.jsonwebtoken`).
- **Token:** single ~24h access token, no refresh; claims `sub` (user UUID), `iat`, `exp`, `email`. Authorization resolves the User from `sub` every request.
- **Logout:** client-side only (SPA discards token); no server-side denylist. 24h `exp` bounds residual risk. Documented as such.
- **Registration policy** *(resolves the PRD open question)*: **open self-serve signup** — public register endpoint; tightenable later via a single env flag.
- **Credential rules:** email syntactically valid + non-blank (uniqueness on `lower(email)`, Phase 1); password min length 8, max 72 bytes (BCrypt limit — reject longer), no composition rules; BCrypt cost 12.
- **Error contract** *(defined here, reused API-wide)*: one structured `problem+json`-style body `{ error, message, details }`. Login failure → generic `401` "Invalid email or password" (no user enumeration); duplicate registration → `409`; missing/invalid token → `401`; authenticated-but-not-owner → `404` (not `403`).
- **Ownership enforcement:** query-level owner filtering (every owned-resource query carries the current user id; non-owned rows are simply not found → `404`). No fetch-then-compare; no Postgres RLS. JWT `sub` → request principal once per request.
- **Endpoint policy:** deny-by-default. Public allowlist = `POST /api/auth/register`, `POST /api/auth/login`, health. Everything else (incl. the Phase-6 SSE endpoint) requires a `Bearer` token. Spring Security `STATELESS`, CSRF disabled.
- **UUIDv7 generation:** `com.github.f4b6a3:uuid-creator` at entity-creation time (Java's built-in `UUID` is v4 only).

- [x] **2.1 Register endpoint** — public; email + password (rules above), BCrypt cost 12 at rest, UUIDv7 PK. → *verify (HTTP): registering creates a User; case-variant duplicate email → `409`; too-short / >72-byte password rejected with structured error.*
- [x] **2.2 Login endpoint** — verifies password, issues an HS256 JWT (`sub`/`iat`/`exp`/`email`, 24h). → *verify (HTTP): valid creds return a token; bad creds → generic `401`.*
- [x] **2.3 JWT auth filter + deny-by-default security config** — resolve `sub` → principal; `Bearer` required outside the public allowlist; stateless, CSRF off. → *verify (HTTP): no/invalid token → `401`; valid token authorizes; a non-allowlisted endpoint rejects anonymous access.*
- [x] **2.4 Logout** — client-side token discard; documented no-server-revocation behavior. → *verify (RTL, Phase 7): discarding the token returns the user to login.*
- [x] **2.5 Owner-only scoping primitive** — query-level owner filtering keyed on the request principal; cross-User access → `404`. → *verify (HTTP): User B cannot reach User A's resources (re-asserted per resource in later phases).*

## Phase 3 — Per-user encrypted API keys *(stories 7–11, ADR-0002)*

**Decisions locked (grilling session):**
- **Storage:** a separate `api_key` table, 1:1 with `users` (`user_id` unique FK), keeping crypto material out of the `users` row. Carries `created_at`/`updated_at` (the Phase-1 mutable row).
- **Master key:** `PROMPTVAULT_ENC_KEY` = base64-encoded 32 bytes. Validated at startup, **fail-fast** (won't boot if absent/malformed). Generator documented (`openssl rand -base64 32`) in `.env.example`/README.
- **GCM parameters & layout:** fresh random 96-bit (12-byte) IV per encryption (never reused), 128-bit auth tag, stored as three `bytea` columns (`iv`, `ciphertext`, `auth_tag`). **AAD = the user's UUID** (binds each ciphertext to its owner; a copied row fails to decrypt).
- **Save validation:** store after a minimal non-blank/trimmed check only — **no live Anthropic call**, **no format/prefix assumption**. Invalid keys surface as a failed Run (Phase 6).
- **Status response:** `{ "hasKey": boolean, "updatedAt"? }` — no key fragment, no last-4.
  *(Amended by PRD story 54 / Phase 15.1: `GET /api/me/api-key` also returns `lastSix` — the last
  six characters of the stored key — so a user can tell which key is saved. The full key is never
  returned. See migration V6 and `ApiKeyStatus.lastSix`.)*
- **Endpoints:** `PUT /api/me/api-key` (idempotent upsert — first set *and* replace, body `{ "apiKey": "..." }`) and `GET /api/me/api-key` (status). **No `DELETE`** (no story asks to clear a key).
- **Rotation readiness:** an `enc_key_version` marker column on `api_key` (default `1`), read on decrypt — satisfies ADR-0002's "plan a path" without building rotation tooling (which stays out of scope per the PRD).

- [x] **3.1 AES-256-GCM encryption service** keyed from `PROMPTVAULT_ENC_KEY` (base64 32-byte, fail-fast startup validation). Encrypt → fresh 12-byte IV, 128-bit tag, AAD = user UUID. → *verify: round-trip encrypt/decrypt; missing/malformed env key prevents boot with a clear error; decrypt under a different UUID (AAD mismatch) fails.*
- [x] **3.2 Migration: `api_key` table** — UUIDv7 PK, unique `user_id` FK, `iv`/`ciphertext`/`auth_tag` (`bytea`), `enc_key_version` (default 1), `created_at`/`updated_at`. → *verify: migration applies; one row per user enforced.*
- [x] **3.3 `PUT` (upsert) + `GET` (status) `/api/me/api-key`.** → *verify (HTTP): `PUT` stores the first key and replaces an existing one; `GET` returns `{ hasKey, updatedAt, lastSix }`; blank/whitespace key rejected with structured error.*
- [x] **3.4 Phase-3 acceptance tests (HTTP front door).** → *verify:* (1) a submitted key round-trips **decrypted** to the fake Claude client on a Run *(cross-phase, with Phase 5)*; (2) plaintext is **never** returned by any response (`PUT` echo or `GET`); (3) reading the `api_key` row directly shows stored bytes **differ from plaintext** and IV/tag are present; (4) AAD binding holds — a row decrypted under another user's UUID fails.

## Phase 4 — Domain model: Prompts & immutable Versions *(stories 12–25, ADR-0001)*

**Decisions locked (grilling session):**
- **Variables storage:** a `jsonb variables` column on `version` (array of `{name, description, required, default}`), frozen atomically — no child table (Variables are never queried/joined individually).
- **Run Settings storage:** discrete columns on `version` — `model` (text), `system_prompt` (text, nullable), `max_tokens` (int), `effort` (text), `thinking` (text) — with DB `CHECK` constraints (fixed scalar fields, unlike the open-ended Variable set). *`thinking` added per Phase-5 grilling — a scope addition beyond the PRD's four Run Settings; also update CONTEXT.md's Run Settings definition.*
- **Version numbering:** per-Prompt sequence from 1; `(prompt_id, number)` unique; next number computed `max+1` inside the txn while holding `SELECT … FOR UPDATE` on the `prompt` row (the serialization point). Constraint violation → retryable conflict.
- **"Edit from any Version" (story 25):** strictly **linear append**, no branching — editing from V3 yields V(max+1) seeded client-side from V3; server just appends. No parent/branch pointer.
- **API shape:** `POST /api/prompts` creates Prompt + Version 1; `POST /api/prompts/{id}/versions` appends the next Version. Both take the **complete** frozen snapshot (one Version DTO); **no `PATCH`/partial** anywhere.
- **Placeholder syntax:** `{{name}}` with optional surrounding whitespace trimmed; name charset `[A-Za-z_][A-Za-z0-9_]*`; duplicates in text tolerated (counted once); no escaping/nesting; a `{{…}}` whose inner text isn't a valid name is a **validation error**. The placeholder set = distinct valid names.
- **Variable rules:** declared names unique within a Version and matching the same charset; `description`/`default` optional; `required` defaults to `true`; `required`+`default` may coexist (default pre-fills the run form, required enforces non-empty at run).
- **Run Settings validation:** `model` ∈ {`claude-opus-4-8` (default), `claude-sonnet-4-6`, `claude-haiku-4-5`, `claude-fable-5`} — backend-maintained **model→capabilities map** (per Phase-5 grilling: which models support `effort`, which support adaptive `thinking`) exposed via the list endpoint so the SPA adapts per model; `effort` ∈ {low,medium,high}; `thinking` ∈ {off (default), adaptive}; `max_tokens` integer 1..ceiling (configured, e.g. 64000); `system_prompt` null or non-empty (empty/whitespace → null); **no temperature/top_p/top_k fields exist** (story 20). Save-time validation rejects a `thinking=adaptive` Version whose `model` lacks adaptive support (e.g. Haiku) — a Version never claims a capability its model lacks. `effort` is stored on every Version but only forwarded to the API for models the map marks as supporting it.
- **Version fields:** `name` required/non-blank/trimmed (≤200), `prompt_text` required/non-blank (≤100k), `description` optional (≤2000), `variables` may be empty (with matching empty placeholder set). Caps are sanity bounds.
- **Read side:** `GET /api/prompts` (each summarized by its current = max-number Version's name + number + timestamp); `GET /api/prompts/{id}` (history descending by number, current first, each flagged); `GET /api/prompts/{id}/versions/{number}` (full frozen content). **No `DELETE`** on Prompts/Versions. All owner-scoped → cross-User `404`.

- [x] **4.1 Migrations: `prompt` (pure identity, no content columns) + append-only `version`** — UUIDv7 PKs, `prompt_id` FK, `number` int, `(prompt_id, number)` unique; columns `name`, `description`, `prompt_text`, `model`, `system_prompt`, `max_tokens`, `effort`, `thinking` (+ CHECKs), `jsonb variables`, `created_at`. → *verify: migrations apply; `prompt` has no mutable content columns.*
- [x] **4.2 `POST /api/prompts` → Version 1.** Full-snapshot body; serialized via `FOR UPDATE` on the new prompt row. → *verify (HTTP): creating a Prompt yields Version numbered 1, owned by the caller.*
- [x] **4.3 `POST /api/prompts/{id}/versions` → next Version** (covers edit *and* rename — both are full-snapshot appends). → *verify (HTTP): each save adds number+1; a rename creates a new Version; historical Versions remain readable and unchanged; concurrent appends don't duplicate/skip numbers.*
- [x] **4.4 Run Settings validation + model-list/capabilities endpoint.** Enforce model set, `effort` enum, `thinking` enum, `max_tokens` range; reject `thinking=adaptive` on a model lacking adaptive support. → *verify (HTTP): valid settings persist; unknown model / out-of-range max_tokens / bad effort or thinking rejected; `thinking=adaptive` + Haiku rejected; no temperature field accepted; `GET` returns the supported models with their effort/thinking capabilities.*
- [x] **4.5 Variable declarations (jsonb).** → *verify (HTTP): declared Variables persist on the Version; duplicate declared names rejected.*
- [x] **4.6 Strict placeholder/Variable set-equality validation.** → *verify (HTTP): placeholder-without-declaration rejected; declared-but-unused Variable rejected; malformed `{{…}}` rejected; `{{ name }}` whitespace tolerated; matching (incl. both-empty) accepted.*
- [x] **4.7 Read/list endpoints** (three GETs above), owner-scoped. → *verify (HTTP): list shows current-Version names; history is descending with current flagged; old Versions readable; cross-User → 404.*

## Phase 5 — Claude client seam *(ADR-0003, stories 26–34)*

**Decisions locked (grilling session, grounded in the Anthropic Java SDK docs):**
- **Seam shape:** `ClaudeClient.stream(ClaudeRequest, String apiKey, TokenSink)` — a sink/callback, blocking push model (fits Spring MVC + `SseEmitter` + Java 25 virtual threads). `TokenSink` = `onToken(String)` / `onComplete(Usage)` / `onError(ClaudeException)`. **No Anthropic SDK type crosses the seam** — `ClaudeRequest`, `Usage`, `ClaudeException` are ours. Not a reactive `Flux`.
- **Real impl:** official Anthropic Java SDK (`com.anthropic:anthropic-java`); construct the client **per-Run** with the decrypted key (`AnthropicOkHttpClient.builder().apiKey(key)`), never a shared/singleton key. Maps Run Settings → `MessageCreateParams` (model, `system`, `maxTokens`, conditional `output_config.effort`/`thinking`); loops `createStreaming(...)`, pushing text deltas to the sink and `finalMessage().usage()` → `onComplete`. Decrypted plaintext lives only on the call stack.
- **`effort` is per-model:** forwarded as `output_config.effort` only for models the capability map (Phase 4) marks as supporting it; **omitted for Haiku** (which 400s on effort). Stored on every Version regardless.
- **`thinking` (Run Setting, off|adaptive):** reconciled against the capability map — adaptive sent only where supported; Fable 5 is always-on (send the model's required form); `thinking=adaptive` on an unsupported model is already rejected at save (Phase 4.6).
- **Streaming surface:** stream **answer text only** — thinking deltas are not forwarded; `display` left at the omitted default. Document the pause-before-text when `thinking=adaptive`. "The response" = answer text (persisted on the Run, story 35).
- **Run prep / Variable substitution:** validate the supplied value map against declared Variables **before** any API call — required Variable missing or blank/whitespace → structured error, no Run row, no key use; optional absent → declared `default` else empty string; unknown supplied key → rejected. Substitute every `{{name}}` (whitespace-trimmed inner, Phase 4.6) textually; the rendered prompt is sent as the **user message** with the Version's `system_prompt` sent **separately**, and is persisted on the Run.
- **No-key guard:** checked **first** (before Variable validation, before any Run row/decryption) — distinct structured error `no_api_key` routing the SPA to the key screen. Presence-only; key *correctness* is not validated here (a bad key surfaces as a failed Run, Phase 6).
- **Error translation:** the real impl catches SDK exceptions → our `ClaudeException` with a category (`AUTH`/`RATE_LIMIT`/`OVERLOADED`/`NETWORK`/`OTHER`) + safe message; Phase 6 maps `onError` → Run `status=failed`. **Refusal** (`stop_reason: "refusal"`, possibly empty content) = **completed** Run, not failed — check `stop_reason` before reading content.

- [x] **5.1 Define the `ClaudeClient` seam** — `stream(ClaudeRequest, apiKey, TokenSink)` with `onToken`/`onComplete(Usage)`/`onError(ClaudeException)`; SDK-agnostic request/usage/exception types. → *verify: interface compiles; a real impl and a fake both satisfy it; no Anthropic type appears in the signature.*
- [x] **5.2 Fake Claude client for tests** — emits canned text deltas then `onComplete` with a chosen `Usage`; can `onError` with a chosen category; **captures the key and rendered prompt it received**. → *verify: fake drives the run tests without network/key.*
- [x] **5.3 Real Claude client** — official Java SDK, per-Run client from the decrypted key; maps Run Settings (conditional effort/thinking via the capability map), streams text deltas, reports usage; translates SDK exceptions → categorized `ClaudeException`; refusal → completed. → *verify: against the live API (smoke) or a contract test; effort omitted for Haiku; thinking reconciled per model.*
- [x] **5.4 Run preparation** — validate supplied values vs declared Variables (required-empty/blank rejected, optional→default/empty, unknown rejected); substitute `{{name}}`; rendered prompt as user message, `system_prompt` separate. → *verify (seam): missing required value rejected pre-call; fake receives substituted prompt + separate system prompt.*
- [x] **5.5 "No saved key" guard** — presence-only, checked first, distinct `no_api_key` error, no decryption/Run row on this path. → *verify (HTTP): running without a saved key returns the clear `no_api_key` error before any validation.*

## Phase 6 — Runs over SSE & run history *(stories 31–39, ADR-0003)*

**Decisions locked (grilling session):**
- **Run lifecycle:** the `run` row is written **twice** — created `in_progress` *after* Phase-5 validation passes (no-key guard → Variable validation) and *before* the first token, then updated to `completed`/`failed` at stream end. Honors ADR-0003's "observable before complete" (story 38) and "failed, not silently lost" (story 33). A validation failure still writes **no** row (per 5.4/5.5).
- **Streaming endpoint:** a **single streaming `POST /api/prompts/{id}/versions/{number}/runs`** (supplied Variable values in the body) that creates the Run *and* returns `text/event-stream`. One POST = one generation = one connection; no create-then-reattach (we build no background continuation). The `runId` is delivered to the client in a **leading `meta` event** (emitted right after the in-progress row exists, before any token) so the SPA can navigate to the persisted Run even if the stream later fails.
- **SSE wire protocol — four named events:** `meta` `{runId, versionNumber}` (once, first); `token` `{text}` (per `onToken` delta, JSON-wrapped so newlines/whitespace survive framing); `done` `{status:"completed", usage:{inputTokens, outputTokens}}` (terminal, from `onComplete`); `error` `{status:"failed", category, message}` (terminal, from `onError`). `done`/`error` are **mutually exclusive** terminal frames. **Refusal rides the `done`/completed path** (Phase 5) — refusal text arrives as `token` frames, stream ends `done`; no special refusal event.
- **Dropped-connection semantics** *(resolves the ADR-0003 open question)*: a client disconnect (emitter `IOException`/`onError`/`onTimeout`) **aborts** generation, **closes the per-Run Anthropic client** (cancelling the upstream request and stopping token billing as the SDK call unwinds), and finalizes the row **`failed`** with category `CLIENT_DISCONNECT`. **No** background completion / no `completed`-after-disconnect (the seam is a blocking push on the request thread; there is no reattach endpoint). Story 33 names a dropped connection as a failure. A **hard crash** can leave an orphaned `in_progress` row — accepted and documented for MVP; **no reaper/sweeper** is built (the history view renders it as in-progress).
- **`run` table columns:** `id` (UUIDv7 PK); `user_id` (FK→`users`, **denormalized owner** for the uniform query-level owner filter — no join through version→prompt→user); `version_id` (FK→`version`); `variable_values` (`jsonb`, `{name:value}`, `{}` when none); `rendered_prompt` (`text` — the only run-time-computed value stored); `response` (`text`, nullable — full on completed, possibly partial/empty on failed); `model` (`text`, "model used" denormalized per story 35); `input_tokens`/`output_tokens` (`int`, nullable); `status` (`text` + CHECK ∈ `in_progress`/`completed`/`failed`); `error_category`/`error_message` (`text`, nullable — only on `failed`); `created_at` (`timestamptz DEFAULT now()`, the story-35 timestamp). **Excluded** (with reason): `system_prompt` (immutable on the Version, reachable via `version_id`); `completed_at` (story 35 says one timestamp); a partial flag (status + `error_*` suffice); `stop_reason` (refusal folds into completed); cache-token columns (out of scope).
- **Read/history API — three reads, owner-scoped (cross-User → 404), descending by `created_at`, all statuses shown:** `GET /api/prompts/{id}/runs` (runs across **all** Versions, each tagged `versionNumber` + status + timestamp + short response **preview** — this is what serves story 37's cross-Version compare; the comparison itself is a frontend concern, no diff endpoint); `GET /api/prompts/{id}/versions/{number}/runs` (one Version's runs, same item shape); `GET /api/runs/{id}` (**full** detail — variable values, rendered prompt, full response, model, usage, status, error fields, timestamp; flat path since the run id is globally unique and the client holds it from `meta`). Full response text only on the single-run GET; lists carry previews.

- [x] **6.1 Migration: `run` table** — columns per the locked schema above (UUIDv7 PK; denormalized `user_id` FK; `version_id` FK; `variable_values` jsonb; `rendered_prompt`; nullable `response`; `model`; nullable `input_tokens`/`output_tokens`; `status` text+CHECK; nullable `error_category`/`error_message`; `created_at`). → *verify: migration applies; status CHECK rejects an unknown status.*
- [x] **6.2 Streaming run endpoint** — `POST /api/prompts/{id}/versions/{number}/runs`; runs Phase-5 prep (no-key guard → Variable validation), creates the `in_progress` row, returns `text/event-stream`, emits `meta` then `token` frames token-by-token from the seam; one-shot, owner-scoped. → *verify (seam): fake emits tokens; client receives `meta` (with runId) then incremental `token` frames; an in_progress row exists during the stream.*
- [x] **6.3 Finalize the completed Run** at stream end (`onComplete`) — update the row to `status=completed` with `response` text, `model`, `input_tokens`/`output_tokens`; emit the terminal `done` frame. Refusal finalizes as **completed** (Phase 5). → *verify (seam): a successful stream finalizes the same row to completed with recorded fields + usage; a refusal run is persisted completed.*
- [x] **6.4 Failed-Run path & dropped-connection lifecycle** — seam `onError` → finalize `failed` with `error_category`/`error_message`, emit terminal `error` frame; client disconnect (emitter `IOException`/`onError`/`onTimeout`) → abort, close the per-Run client, finalize `failed`/`CLIENT_DISCONNECT` (no terminal frame reaches the gone client). → *verify (seam): fake `onError` → same row finalized failed with category/message + `error` frame emitted; a simulated disconnect finalizes the row failed/`CLIENT_DISCONNECT` and no further tokens are consumed.*
- [x] **6.5 Run read/history API** (separate from streaming) — the three owner-scoped reads above (prompt-level list across all Versions with `versionNumber` tags + previews; per-Version list; single-run full detail), descending by `created_at`, all statuses shown. → *verify (HTTP): runs listed per Prompt and per Version with version tags; a completed Run re-opens via `GET /api/runs/{id}` with full response + inputs; cross-User → 404; an in_progress run appears in lists.*

## Phase 7 — Frontend SPA *(tested through the rendered UI, MSW = Mock Service Worker at the network boundary)*

**Decisions locked (grilling session):**
- **Server state:** **TanStack Query (React Query)** for all server state (prompts/versions/runs/key-status/capabilities map) — list/detail reads + mutations that invalidate lists on save. **Plain React state** for forms and local UI. The streamed run output is **not** a query (it's the imperative SSE flow, Q3).
- **Token storage:** the JWT lives in **`localStorage`** — consistent with Phase-2's stateless `Bearer`-header + CSRF-off architecture (an httpOnly cookie would reverse that and re-introduce CSRF; in-memory-only logs the user out every refresh). XSS persistence is the accepted trade, mitigated by React's default escaping and not using `dangerouslySetInnerHTML`; documented as such.
- **API client:** a thin **`fetch` wrapper** (not axios) — reads the token, attaches `Authorization: Bearer`, sets JSON headers, parses the Phase-2 error envelope `{error, message, details}` into a typed `ApiError`. Used by every Query/mutation.
- **Status handling:** centralized **401 → clear token + redirect to `/login`** (covers 24h expiry, no refresh); **404** is normal in-app not-found (owner-scoped, Phase 2), **not** a logout; the run-time **`no_api_key`** structured error (Phase 5) routes to the **API-key screen**, not logout (different status, not swallowed by the 401 interceptor).
- **SSE consumption:** the streaming `POST` (Bearer + JSON body) is **incompatible with native `EventSource`** (GET-only, no headers) — so consume it with **`fetch` + a `ReadableStream` body reader and our own SSE frame parser** (~30–40 lines for the four-event protocol), wrapped in one imperative `streamRun(versionRef, values, handlers)` module (`onMeta`/`onToken`/`onDone`/`onError`). **No `EventSource`, no streaming library, no client-side reconnect** (a Run is one-shot; a dropped connection is a terminal failure per Phase-6 Q4 — auto-retry would contradict the lifecycle). The terminal frame **invalidates the run-history queries**; the `meta` `runId` lets the view link to the persisted Run immediately.
- **Routing:** **React Router** with a single `<RequireAuth>` guard (no token → `/login`; complements the 401 interceptor which handles mid-session expiry). Routes: `/login`, `/register` (public); `/` (prompt list), `/prompts/new`, `/prompts/:id` (detail + history + cross-Version run compare), `/prompts/:id/versions/:number` (view historical Version), `/prompts/:id/versions/:number/edit` (edit-from-a-Version → POSTs a new Version, linear append), `/prompts/:id/versions/:number/run` (run form transitions in place into the streamed view), `/runs/:id` (re-open a persisted Run, story 39), `/settings/api-key` (guarded). Compare-across-Versions (story 37) renders **inside** the prompt-detail route — no dedicated compare route.
- **Forms:** **plain controlled React state, no form library** (small bespoke forms; dynamic Variable rows as a `useState` array). **Server is the source of truth for validation** — the client does only cheap pre-submit guards and surfaces the structured error envelope inline (story 18's placeholder↔Variable mismatch is shown from the server's error, not reimplemented). Exception: the **run form blocks submit on any empty required Variable client-side** (story 28) before calling `streamRun` (cheap; avoids wasted tokens). **No temperature control exists** (story 20).
- **Capabilities-driven Run Settings:** the editor fetches the Phase-4 **model→capabilities map** and drives the `effort`/`thinking` controls off it — selecting Haiku hides/disables `effort` and forces `thinking=off`; selecting an adaptive-capable model enables the `thinking` toggle — so the UI never offers an invalid combination (save-time rejection, Phase 4.6, is a backstop).
- **Styling:** **plain CSS Modules** (locally scoped, zero runtime, trivial Vite support) — **no UI library, no Tailwind**. **Semantic, accessible markup** (real `<form>`/`<label>`/`<button>`, proper roles/accessible names) is a **testability requirement** so RTL queries bind to user-facing semantics (`getByRole`/`getByLabelText`); test-ids only as a last resort.
- **Test seam (MSW):** standard MSW JSON handlers for REST (shared set + per-test overrides for error cases — envelope errors, `no_api_key`). The **streaming endpoint is mocked as a `text/event-stream` `ReadableStream`** that enqueues SSE frames (`meta` → `token`s → terminal `done`/`error`), driving the **real** `streamRun` parser end-to-end to assert incremental tokens + all three states; in-progress asserted by checking the transcript before the terminal frame is enqueued. *Note: MSW streaming + incremental-`ReadableStream` timing is the fiddliest part of the suite — documented fallback is a focused direct-parser test fed a `ReadableStream`, REST flows still through MSW.*

- [x] **7.1 App shell, routing, query client, and the `fetch` API client.** React Router + `<RequireAuth>` guard; `QueryClientProvider`; token in `localStorage`, attached as `Bearer`; error-envelope→`ApiError` parsing; centralized 401→clear+`/login`. → *verify (RTL): authed requests carry the token; a 401 clears it and routes to login.*
- [x] **7.2 Auth screens** — register, login, logout (client-side token discard). → *verify (RTL + MSW): login lands the user in the app; logout returns to login.*
- [x] **7.3 API-key screen** — set/replace key; show whether a key is set (never the key). → *verify (RTL + MSW): status reflects a set key; plaintext never displayed.*
- [x] **7.4 Prompt list & detail** — list by current-Version name; open a Prompt → ordered Version history; view a historical Version; current Version clearly marked. → *verify (RTL + MSW): list and history render as specified.*
- [x] **7.5 Create / edit Prompt** — controlled form, dynamic Variable rows + capabilities-driven Run Settings; saving appends a new Version; surface the server's validation errors (placeholder/Variable mismatch) inline; start editing from any Version. → *verify (RTL + MSW): a save produces a new Version; a mismatch error from the server is shown; Haiku hides effort / forces thinking off.*
- [x] **7.6 Run form** — Variable inputs pre-filled from defaults, required enforced client-side before run. → *verify (RTL + MSW): required-empty blocks the run; defaults pre-fill.*
- [x] **7.7 Streamed run view** — `streamRun` (`fetch`+`ReadableStream` parser) renders SSE output incrementally; in-progress / completed / failed states; `no_api_key` routes to the key screen. → *verify (RTL + MSW): streaming `ReadableStream` mock drives incremental tokens and completed; an `error` frame drives failed; in-progress shows before the terminal frame.*
- [x] **7.8 Run history view** — browse Runs (all statuses), re-open a completed Run (`/runs/:id`) with full response + inputs, compare across Versions inside prompt-detail. → *verify (RTL + MSW): a past Run re-opens with full detail; runs from multiple Versions render together for compare.*

## Phase 8 — Cross-cutting hardening *(stories 40–41)*

**Decisions locked (grilling session):**
- **One global error handler:** a single `@RestControllerAdvice` renders the Phase-2 envelope `{error, message, details}` for **every** failure mode — consolidation, not a second error format. Status/code taxonomy: Bean-Validation / typed-but-invalid body → `400 validation_error` (per-field info in `details`); unparseable JSON → `400 malformed_request`; missing/invalid token → `401 unauthorized`; duplicate registration **and** version-number race (Phase 4 retryable) → `409 conflict`; owner-scoped / cross-user → `404 not_found`; no saved key on run → the Phase-5 `no_api_key`; anything unhandled → `500 internal_error`. **Framework exceptions are explicitly mapped** (`MethodArgumentNotValidException`, `HttpMessageNotReadableException`) so Spring's default error JSON never escapes the envelope.
- **No-leak 500 + secret hygiene:** the catch-all `500` returns a **generic** body (`internal_error` / "An unexpected error occurred" / `details: null`) while the real exception is logged **server-side only** — no class name, stack, SQL, or constraint name in any response body. Cross-cutting hardening: the raw Anthropic key, the **decrypted key plaintext**, `PROMPTVAULT_ENC_KEY`, `PROMPTVAULT_JWT_SECRET`, raw passwords, and the JWT itself **never** appear in logs or error bodies — reinforcing ADR-0002's encryption with a verification, not a convention.
- **Validation mechanism:** **Bean Validation** (`@Valid` + constraint annotations on request DTOs) for mechanical field rules (required/non-blank, the Phase-4 length caps, `max_tokens` range, email format, password length) → feeds the global advice with per-field `details`. **Domain invariants stay service-layer** (placeholder↔Variable set-equality 4.6, model→capabilities reconciliation, Variable-name uniqueness, run-time Variable validation 5.4) — thrown as domain exceptions mapped by the same advice. No cleverness forcing set-equality into a custom annotation.
- **Durability = verification, no new machinery:** durability is already a property of Phase 1 (real Postgres, Flyway, committed JPA txns); 8.2 is a **test**, not a new persistence layer. Explicitly **not** added: backup/restore tooling, replication, graceful-shutdown draining of in-flight runs (an in-flight run at shutdown is just the Phase-6 Q4 orphaned-in-progress case, already accepted).
- **Scope fence — explicitly OUT of the MVP** (not wrong, just out): rate limiting/throttling (per-user cost already bounded by the user's own key); security headers/TLS/production CORS (deployment; Phase 0 chose the Vite proxy to avoid CORS); request-id/correlation tracing, metrics, APM (the secret-safe server log is the whole logging requirement); account lockout / password reset / email verification (features, not hardening — would need their own design); streaming backpressure tuning (the blocking-push seam on virtual threads suffices at MVP scale).

- [x] **8.1 Global error handling + validation** — single `@RestControllerAdvice` rendering the envelope across the taxonomy above (framework exceptions mapped); Bean Validation on request DTOs for field rules; domain invariants throw mapped exceptions; generic non-leaking `500`. → *verify (HTTP): each category (bad token, malformed JSON, field-validation, duplicate, conflict, not-found, no-key, unexpected) returns the correct status + envelope; a forced unexpected error returns a generic 500 with no internals.*
- [x] **8.2 Secret-hygiene leak test** — drive a failed Run (e.g. bad key → `AUTH`) and an unexpected `500`; assert no API key / decrypted plaintext / `PROMPTVAULT_ENC_KEY` / JWT secret / password / JWT appears in the response body or captured logs. → *verify: leak assertions pass on both paths.*
- [x] **8.3 Durability check** — write data, restart the app against the **same** Postgres; assert all data is readable/unchanged and startup is clean under `ddl-auto=validate` + Flyway on the **populated** DB (schema-drift guard); note run-finalization atomicity. → *verify: data persists across restart; no re-migration / no validation failure on the populated DB.*
- [x] **8.4 Confirm ADR-0003 disconnect semantics + doc-consistency pass.** Confirm the Phase-6 disconnect behavior is wired (abort + close per-Run client + `failed`/`CLIENT_DISCONNECT`, no background completion, no reaper) and the model list is enforced (`claude-opus-4-8` default, `claude-sonnet-4-6`, `claude-haiku-4-5`, `claude-fable-5`); reconcile stale "undecided" notes (registration policy — resolved to open self-serve signup in Phase 2; ADR-0003 — already marked resolved; CONTEXT.md `thinking` — already added). → *verify: behavior matches Phase 6; model list enforced; no doc still calls a resolved question "undecided".*

## Phase 9 — Candidate v2 features

Gaps surfaced during a post-MVP project review (2026-07-01): real product gaps, but outside the PRD's user stories and not already named in the "Out of scope" list below. All six items below were grilled (2026-07-01) in this order: deletion first (most foundational — it changes the query shape for the rest), then the remainder in their original listed order (9.1 → 9.2 → 9.3 → 9.4 → 9.6). Every item now has decisions locked; none are built yet.

### 9.1 Prompt/run search & filtering *(grilled)*

**Decisions locked (grilling session, 2026-07-01):**
- Split into two independent pieces — Prompt search and Run filtering — different data shapes, no reason to ship together.
- **Prompt search:** matches the current (latest) Version's `name` and `description` only — not historical Version names, not `prompt_text`. Case-insensitive substring match (`ILIKE`), not full-text/fuzzy. Server-side via a `q` query param on `GET /api/prompts` (not client-side filtering), chosen specifically because 9.2 (pagination, next) needs server-side filtering anyway. Applies to the active Prompt list only — Trash (ADR-0004) stays unsearched, consistent with keeping it minimal.
- **Run filtering:** scoped to the existing per-Prompt run views (`GET /api/prompts/{id}/runs` and `.../versions/{number}/runs`) — no new global "all my Runs" view/endpoint. Filters by `status` only (`completed`/`failed`/`in_progress`); no date range, no full-text search over `rendered_prompt`/`response` (deferred, not requested).

- [x] **9.1.1 `GET /api/prompts?q=term`** — case-insensitive substring match against the current Version's `name`/`description`; omitted/blank `q` returns the full list unchanged. → *verify (HTTP): a substring match in name or description returns the Prompt; a non-matching term excludes it; no `q` behaves as today.*
- [x] **9.1.2 `status` filter on the two run-history reads** — optional `status` query param, one of `completed`/`failed`/`in_progress`; omitted returns all statuses (today's behavior). → *verify (HTTP): filtering returns only matching Runs; omitted param unchanged; owner-scoping and the ADR-0004 deletion cascade still apply.*
- [x] **9.1.3 Frontend: search box on the Prompt list** — debounced input driving `q`; empty state distinguishes "no Prompts yet" from "no matches for this search." → *verify (RTL + MSW): typing filters the list; clearing restores the full list.*
- [x] **9.1.4 Frontend: status filter on Run history views** — a control driving the `status` param on the per-Prompt and per-Version run views. → *verify (RTL + MSW): selecting a status filters visible Runs; "all" restores the full list.*

### 9.2 Pagination *(grilled)*

**Decisions locked (grilling session, 2026-07-01):**
- Paginates the Prompt list and both Run-history views only (per-Prompt, per-Version) — Trash stays unpaginated, consistent with keeping it minimal (9.5).
- Offset-based (`LIMIT`/`OFFSET`), not keyset/cursor — simplest correct fit for one user browsing their own data at this scale.
- Fixed default page size, no client-configurable `size` param.
- "Load more" button (append-style), not numbered pages — no `COUNT(*)` query, no page-number UI needed; matches chronological/casual browsing.

- [x] **9.2.1 `GET /api/prompts?page=N` (+ existing `q` from 9.1)** — fixed page size, returns `{items, hasMore}` (no total count); page 1 default. → *verify (HTTP): page 1 returns the first page-size Prompts + `hasMore`; requesting past the end returns an empty page + `hasMore=false`; composes with `q`.*
- [x] **9.2.2 `page` param on both run-history reads (+ existing `status` from 9.1)** — same `{items, hasMore}` shape, fixed page size, ordered by `created_at` descending (existing order, Phase 6.5). → *verify (HTTP): pagination and `status` filtering compose correctly; last page reports `hasMore=false`.*
- [x] **9.2.3 Frontend: "Load more" on the Prompt list and both Run-history views** — appends the next page to the rendered list; button hides when `hasMore=false`. → *verify (RTL + MSW): clicking Load more appends further items; button disappears at the end.*

### 9.3 Duplicate/fork a Prompt *(grilled)*

**Decisions locked (grilling session, 2026-07-01):**
- Reuses the existing "edit from any Version" machinery (`EditFromVersionPage`'s `toFormValues` + `VersionForm`) almost entirely — the only difference is POSTing to `POST /api/prompts` (create) instead of `POST /api/prompts/{id}/versions` (append). **No backend changes required** — this is a frontend-only feature.
- Can fork from any historical Version, not just the current one — mirrors "edit from any Version" (story 25) exactly.
- The pre-filled name is left identical to the source, no auto-"Copy of" prefix — the review-step form already lets the user rename before saving, and prefixing invites a runaway-prefix problem on repeated duplication.
- Entry point: a sixth tab in `PromptTabs` (`Duplicate`), alongside View/Edit/Run — same version-scoped routing pattern (`/prompts/:id/versions/:number/duplicate`).
- The new Prompt starts with zero Run history, as any newly created Prompt does — not carried over from the source (this is a fork, not a branch within the same history).

- [x] **9.3.1 Frontend: `DuplicateFromVersionPage`** — fetches the source Version, pre-fills `VersionForm` via `toFormValues` (reused from `EditFromVersionPage`), and on submit POSTs to `POST /api/prompts` (not `.../versions`) to create a brand-new Prompt; navigates to the new Prompt on success. → *verify (RTL + MSW): duplicating pre-fills the form with the source Version's content; saving creates a new, independent Prompt (its own Version 1) and does not alter the source Prompt's history.*
- [x] **9.3.2 Frontend: `Duplicate` tab in `PromptTabs`.** → *verify (RTL): the tab appears alongside View/Edit/Run and links to the duplicate route for the current version-in-context.*

### 9.4 Usage/cost dashboard *(grilled, ADR-0005)*

**Decisions locked (grilling session, 2026-07-01):**
- **Token counts only, no dollar conversion** — respects the PRD's existing "no billing/cost-tracking beyond per-User attribution" boundary rather than quietly reopening it; no per-model price table exists or is being added.
- **Account-wide only, no per-Prompt breakdown** — a single aggregate across all the User's Runs, `GROUP BY model`; per-Prompt usage is a separate, smaller future feature.
- Queries `run` directly, filtered by the denormalized `user_id`, **no join** through `version`/`prompt` — so it **includes** token usage from Runs whose Prompt is now in Trash (ADR-0004); the tokens were genuinely spent regardless of current visibility.
- **All-time totals only, no time-series/date breakdown** — no charting library or date-range picker exists in this app yet; nothing named a trends need.
- **Placement:** a third `fieldset` section on `ProfilePage` ("Usage"), alongside the existing Profile and API Key sections — not a dedicated route.

- [x] **9.4.1 `GET /api/me/usage`** — returns all-time input/output token totals grouped by model for the caller, sourced from `run` by `user_id` (no join, includes deleted-Prompt Runs). → *verify (HTTP): totals match the sum of the caller's Run token counts across all statuses/models; cross-User isolation (only the caller's own Runs count).*
- [x] **9.4.2 Frontend: "Usage" section on `ProfilePage`** — renders the per-model token totals (read-only, no actions). → *verify (RTL + MSW): totals render per model; a User with no Runs yet shows a sensible empty/zero state.*

### 9.5 Prompt deletion *(grilled, ADR-0004)*

**Decisions locked (grilling session, 2026-07-01):**
- **Soft delete, not hard delete:** a nullable `deleted_at timestamptz` on `prompt`. A hard delete would cascade-destroy Run history, undermining ADR-0001's "a Run always points at its precise inputs" guarantee.
- **Real Trash view**, not an invisible safety-net flag: a separate route (e.g. `/trash`), restore is a first-class user action.
- **Restore-only, forever:** no "permanently delete" action anywhere; retention is indefinite; no purge job.
- **No confirmation dialog:** delete fires immediately on click, matching the app's existing convention of zero confirm dialogs anywhere (e.g. logout) — safe because Trash + restore already makes it low-stakes.
- **Trash list is minimal:** name + deleted-at timestamp + Restore button only. No drill-in to content or Version history from Trash.
- **Full cascade:** while deleted, the Prompt's detail page, historical Versions, and Runs (including direct `/runs/:id` links and the run-history reads) all read as not-found — same convention as owner-scoped 404, just another reason a resource isn't currently reachable. Only the Trash list can see it (name/date only) and restore it.
- **Cascade implementation:** a `run → version → prompt` join for the `deleted_at` check on Run reads, rather than denormalizing a deleted/visible flag onto `run` — deliberately diverging from ADR-0003's `user_id` denormalization, since that exists to keep the *owner* filter join-free everywhere, whereas this is a one-off, low-frequency check not worth the write-amplification of updating every `run` row on each delete/restore.
- **In-progress Runs:** deleting a Prompt with an `in_progress` Run is unconditional, no blocking/409 — the stream finishes as normal; the Run row is just hidden by the cascade until restored (consistent with the app's existing tolerance for orphaned in-progress Runs on crash).
- **Not a reopening of "no `DELETE`":** Phase 4's "no `DELETE` on Prompts/Versions" is about individual Versions/Runs, which remain permanently undeletable; whole-Prompt deletion is a distinct, coarser operation.

- [x] **9.5.1 Migration: `deleted_at timestamptz` nullable on `prompt`.** → *verify: migration applies; existing rows default to `NULL` (active).*
- [x] **9.5.2 `DELETE /api/prompts/{id}`** — sets `deleted_at = now()`; owner-scoped, idempotent-if-already-deleted; unconditional even with an `in_progress` Run against it. → *verify (HTTP): delete sets the timestamp; cross-User → 404; deleting twice doesn't error.*
- [x] **9.5.3 `POST /api/prompts/{id}/restore`** — clears `deleted_at`; only reachable for a Prompt currently in Trash. → *verify (HTTP): restores an active Prompt back to normal lists/detail; restoring a never-deleted or already-active Prompt → 404/no-op (pick one, document it).*
- [x] **9.5.4 `GET /api/prompts/trash`** — lists the caller's soft-deleted Prompts (name, deleted-at, promptId only), owner-scoped. → *verify (HTTP): shows only the caller's deleted Prompts; excludes active ones.*
- [x] **9.5.5 Cascade filtering on existing reads** — `GET /api/prompts`, `/api/prompts/{id}`, `/api/prompts/{id}/versions/{number}`, `/api/prompts/{id}/runs`, `/api/prompts/{id}/versions/{number}/runs`, and `/api/runs/{id}` all exclude a soft-deleted Prompt's data (the last three via the new `run → version → prompt` join). → *verify (HTTP): every one of these 404s for a deleted Prompt's resources; all resume working after restore.*
- [x] **9.5.6 Frontend: Delete action + Trash route** — a Delete button on the Prompt detail page (fires immediately, no confirmation); a `/trash` route (nav-linked) listing deleted Prompts with a Restore button; a restored Prompt returns to the normal list. → *verify (RTL + MSW): delete removes the Prompt from the list and it appears in Trash; restore reverses both.*

### 9.6 Version diff view *(grilled)*

**Decisions locked (grilling session, 2026-07-01):**
- Compares **any two arbitrary Versions**, not just adjacent ones — mirrors the existing "compare across Versions" precedent already established for Runs (story 37); the common real case ("what changed since the one I liked") is often not adjacent.
- Diffs **all frozen fields**, not just `prompt_text` — CONTEXT.md defines a Version as freezing *everything* (name, description, prompt_text, Run Settings, Variables), so a diff that only covered text would silently hide a model swap or a Variable added/removed. `prompt_text` gets a real diff; every other field is shown only if it differs, as a simple "old → new."
- `prompt_text` diff granularity is **word-level** (e.g. `diffWords` from the `diff`/jsdiff library), not line-level — prompt text is prose, and a line-level diff on a paragraph just flags "this whole line changed," which isn't useful.
- **Frontend-only, no backend changes** — both Versions' full content is already fetchable via the existing `GET /api/prompts/{id}/versions/{number}` endpoint; the diff is computed client-side with a diff library. This is the app's first new frontend dependency.
- **Entry point:** the existing Version History page (`PromptDetailPage`, the Versions tab) gets two `<select>` dropdowns (`from`/`to`, populated from the version list already rendered there) plus a "Compare" control navigating to a linkable `/prompts/:id/compare?from=N&to=M` route that renders the diff.

- [x] **9.6.1 Add a diff library dependency** (e.g. `diff`) to the frontend. → *verify: `npm run build` succeeds; bundle size impact is reasonable for a small, focused library.*
- [x] **9.6.2 Frontend: version pickers on `PromptDetailPage`** — two selects (`from`/`to`) plus a "Compare" link to `/prompts/:id/compare?from=N&to=M`. → *verify (RTL): selecting two versions and clicking Compare navigates to the right URL.*
- [x] **9.6.3 Frontend: `CompareVersionsPage`** — fetches both Versions (existing endpoint), renders a word-level diff of `prompt_text` and an "old → new" list of every other field that differs (name, description, model, system_prompt, max_tokens, effort, thinking, variables); fields with no change are omitted. → *verify (RTL + MSW): a text change renders as a word-level diff; a Run Settings change (e.g. model) renders as old → new; unchanged fields don't appear; comparing a Version to itself shows no differences.*

> *Removed in Phase 12.7 (ADR-0007): Versions, the version-diff view, `CompareVersionsPage`, and the `diff` dependency were deleted when Prompts became mutable and Version history was dropped. Kept above as the historical record of what was built.*


## Phase 10 — Frontend check-hook hardening *(code review findings, 2026-07-04)*

Findings from a high-effort review of commit `5e4730e` (the PostToolUse typecheck/lint hook in
`../.claude.000/settings.json`). Confirmed bugs: the hook derives the project dir by string-cutting the edited file's
path at the *first* `/frontend/` occurrence (wrong directory → silent fail-open via `cd … || exit 0`); it silently
no-ops for every edit if `jq` is missing; it hard-blocks every frontend edit in a fresh clone/worktree (no
`node_modules` → opaque `npx --no-install` failure, exit 2); and it validates nothing but prettier formatting for `.js`/
`.jsx` files (eslint config covers only `**/*.{ts,tsx}`, tsconfig has no `allowJs`). Adjacent gap: `.gitignore` doesn't
cover `../.claude.000/settings.local.json` while the commit skill runs `git add -A`. Lower-severity: full-project
tsc+lint on every single edit (no file scoping, blocks intentionally-intermediate refactor states), the hand-rolled
`tsc -b` duplicating half of the `build` script, timeout fail-open, and a `.tsbuildinfo` race under concurrent hook
runs.

**Decisions locked (grilling session, 2026-07-04):**
- **Split gate architecture** *(resolves 10.6's and/or)*: the per-edit PostToolUse hook runs **only file-scoped checks** on the edited file (`eslint "$f" --max-warnings 0` + `prettier --check "$f"`); the **full-project gate** (`npm run typecheck` + `npm run lint`) moves to a **Stop hook** that runs once per turn, blocking turn-end (exit 2) until green. Rationale: `tsc -b` is inherently whole-project — kept per-edit it could never satisfy "a two-file refactor doesn't fail between the two edits"; only relocating it off the per-edit path meets the criterion.
- **Stop-gate trigger = dirty-marker file:** the edit hook touches a marker in `/tmp` keyed by the hook input's `session_id`; the Stop hook exits 0 immediately unless the marker exists, then deletes it and runs the full gate. Backend-only and conversational turns pay zero cost. Rejected alternatives: unconditional run (re-imposes the tax every turn) and transcript-parsing (fragile coupling to an internal format).
- **Marker scope = any file edit under `frontend/`**, not just `.ts`/`.tsx`: a CSS-/config-only turn still gets the full `prettier --check .`/lint/tsc pass at turn end (honoring the CLAUDE.md "check lint after CSS/HTML changes" rule); the per-edit file-scoped checks still run only for `.ts`/`.tsx`.
- **One script, mode argument:** a single `../.claude.000/hooks/frontend-check.sh` invoked as `… edit` (PostToolUse) and
  `… stop` (Stop), so the shared guards (jq, `node_modules`, `cd`, marker path, 10.7 risk notes) live in one place and
  can't drift. The stop branch respects `stop_hook_active` from the hook input (exit 0, marker left intact) so an
  unfixable gate can't wedge the session in an infinite stop loop.
- **Frontend-file detection by prefix match** against `"$CLAUDE_PROJECT_DIR/frontend/"` — not `*/frontend/*` glob-cutting — immune to checkouts whose path contains another `/frontend/` segment.
- **TS-only per-edit gate** *(resolves 10.4's either/or)*: stop matching `.js`/`.jsx` — the frontend has **no JS app source** (the only real `.js` file is `eslint.config.js` itself, still covered by the Stop gate's `prettier --check .`); no JS block is added to the eslint config. If JS source ever appears, extending is a one-line follow-up.
- **Fail-loud = blocking exit 2 for both guard failures:** missing `jq` and missing `frontend/node_modules` each produce a clear, actionable stderr message + exit 2 (the agent can then run `npm install` itself) — never a silent exit 0.

- [x] **10.1 Ignore local Claude settings.** Add `../.claude.000/settings.local.json` to the repo `.gitignore` — the
  existing `*.local` pattern doesn't match a name ending in `.json`; today only the author's personal global gitignore
  prevents the commit skill's `git add -A` from committing another contributor's personal settings. → *verify:
  `git check-ignore -v .claude/settings.local.json` matches a repo rule, not the global ignore.*
- [x] **10.2 Extract the hook to a script with `edit`/`stop` modes.** Move the inline JSON-escaped one-liner to
  `../.claude.000/hooks/frontend-check.sh`; `settings.json` registers
  `"$CLAUDE_PROJECT_DIR"/.claude/hooks/frontend-check.sh edit` on PostToolUse (matcher `Edit|Write` — drop the dead
  `MultiEdit` branch; the tool no longer exists) and `… stop` on Stop; inside, `cd "$CLAUDE_PROJECT_DIR/frontend"` +
  prefix-match detection replace the `${f%%/frontend/*}` path-cutting (fixing the wrong-directory / fail-open bug). →
  *verify: `shellcheck` passes on the script; editing a frontend file still triggers the edit-mode check; the check runs
  correctly regardless of where the repo is checked out (including a path containing another `/frontend/` segment).*
- [x] **10.3 Fail loud, not open.** In the script (both modes): a missing `jq` produces a clear error (exit 2) instead of silently disabling the gate forever; a missing `frontend/node_modules` (fresh clone/worktree) produces an actionable "run npm install in frontend/" message (exit 2) instead of the opaque npx resolution error. → *verify: simulating each condition (PATH without jq; renamed node_modules) surfaces the clear message; normal edits are unaffected.*
- [x] **10.4 TS-only per-edit gate.** Narrow the edit-mode file match to `.ts`/`.tsx` under `frontend/` — `.js`/`.jsx` files provably never enter the file-scoped checks (decision above; no eslint-config change). → *verify: a `.js` probe file with an unused var never enters the gate; a `.ts` probe still does.*
- [x] **10.5 Shared typecheck script.** Add `"typecheck": "tsc -b"` to `frontend/package.json` and call it from both `build` (`npm run typecheck && vite build`) and the Stop-mode gate, so the two invocations can't silently drift. → *verify: `npm run typecheck` succeeds; `build` and the stop gate both delegate to the shared script.*
- [x] **10.6 Split gate + dirty marker.** Implement the locked architecture: edit mode touches the session-keyed marker for **any** frontend edit and runs `eslint "$f"` + `prettier --check "$f"` for `.ts`/`.tsx` only; stop mode exits 0 without the marker (or when `stop_hook_active` is set), else consumes it and runs `npm run typecheck && npm run lint`, exit 2 on failure. → *verify: a two-file refactor doesn't fail the gate between the two edits but a broken end state blocks the Stop; a CSS-only turn triggers the stop gate; a backend-only turn runs no frontend check; per-edit hook runtime drops measurably (~6s → sub-second).*
- [x] **10.7 Document accepted risks in the script header.** Behaviors left as-is: a hook exceeding its timeout is
  cancelled non-blocking (fails open with only a generic hook-error notice, no tsc/eslint output); the `.tsbuildinfo`
  race is now confined to concurrent *sessions* (tsc runs once per turn on Stop, not per edit) and tsc self-heals via
  full rebuild — a perf blip, not wrong diagnostics; a `stop_hook_active` turn skips re-verification (the marker
  persists, so the next turn's Stop re-checks). → *verify: the notes exist in `../.claude.000/hooks/frontend-check.sh`;
  no behavior change.*

## Phase 11 — User-facing activity feed *(grilled 2026-07-05, ADR-0006)*

Usage tracking as a user-facing activity history: each User sees their own account activity (logins, saves, runs, deletes…) on the Profile page. Explicitly **not** operator analytics and **not** a security-audit log (both rejected during grilling).

**Decisions locked (grilling session, 2026-07-05):**
- **Audience:** the User themselves, owner-scoped like everything else — no admin surface, no cross-User aggregation.
- **Event taxonomy (9 types):** `registered`, `logged_in`, `api_key_set` (set *and* replace), `name_changed`, `prompt_created`, `version_saved`, `prompt_deleted`, `prompt_restored`, `run_started`. Excluded with reasons: **logout** (client-side token discard — the server can't observe it truthfully), **failed logins** (security-audit territory; unauthenticated traffic doesn't belong in a user's own feed), **reads/page views** (noise).
- **Storage:** one append-only `activity_event` table — `id` (UUIDv7 PK), `user_id` (FK), `type` (text + CHECK), `occurred_at` (`timestamptz DEFAULT now()`), optional context refs (`prompt_id`, `version_number`, `run_id`), and a **denormalized display `label`** (e.g. the Prompt's name at event time — so the feed never joins through `prompt` and survives Trash). Index `(user_id, occurred_at DESC, id DESC)`. Rejected: deriving the feed by `UNION` over existing tables (pagination pain; still needs a new table for logins/deletes anyway).
- **Writes:** synchronous `ActivityRecorder.record(...)` called inside each service method, **same transaction** as the mutation; an event-insert failure fails the mutation (including login — login gains its first DB write). Rejected: `@TransactionalEventListener`/async (silent-drop failure modes for zero benefit at this scale).
- **Run events:** a single `run_started` event written in the transaction that creates the `in_progress` Run row; the feed shows the Run's **live status via PK join to `run`** at read time. Never misses orphaned-in-progress Runs; `occurred_at` = when the user acted. Rejected: terminal-status events (a crashed Run would never appear) and started+terminal pairs (feed noise).
- **Trash interaction:** events referencing a Trashed Prompt stay **visible always** (precedent: ADR-0005 counts deleted Prompts' tokens; hiding would also hide the `prompt_deleted` event that explains the deletion). Feed entries are **plain text, no links** in v1 — avoids a per-row reachability check against the ADR-0004 cascade; ADR-0004's "no drill-in from Trash" holds (labels only, no content).
- **Read surface:** `GET /api/me/activity` (beside `/api/me/usage`), returning the standard `{items, hasMore}` page shape, fixed page size, reverse-chronological; item = `{type, occurredAt, label, versionNumber?, runStatus?}`. No filters, no per-Prompt view in v1.
- **UI:** a "Recent activity" section on `ProfilePage` under the Usage section, using the existing `LoadMoreButton` pattern — no new route/nav (graduates to its own page only if it earns filters later).
- **Retention:** forever — no purge job, no cap, matching ADR-0004's no-purge stance. Pruning old login events is a named future option, not built.
- **Backfill:** the creating migration synthesizes **true** historical events via `INSERT … SELECT`: `registered` from `users.created_at`, `version_saved` from every `version` row (frozen name as label; number 1 as `prompt_created`), `run_started` from every `run` row, `prompt_deleted` for currently-Trashed Prompts, latest `api_key_set` from `api_key.updated_at`. Not reconstructible (accepted gap): past logins, restores, name changes, deletes since restored, key-set history.
- **Privacy:** events carry type + time + label only — **no IP, user-agent, or device data** (that's the rejected audit-log feature; avoids indefinitely-retained PII).

- [x] **11.1 Docs first: ADR-0006 + PRD stories + CONTEXT.md.** Write `docs/adr/0006-…` capturing the load-bearing calls (same-transaction writes, run-started-not-terminal, Trash-visibility, no-links, indefinite retention, backfill, no PII); append the new user stories (56+) to the PRD per the established numbering convention; add an **Activity** entry to CONTEXT.md's glossary. → *verify: ADR listed in `docs/adr/README.md`; PRD story numbering stays append-only; CONTEXT.md defines the vocabulary used by the code.*
- [x] **11.2 Migration: `activity_event` table + backfill.** Columns/index per the locked schema; CHECK on `type`; backfill `INSERT … SELECT`s in the same migration. → *verify: applies on a fresh **and** a populated DB; backfilled row counts match source tables (one per user/version/run + current-trash deletes + one per stored key); every backfilled event carries a real timestamp and label.*
- [x] **11.3 `ActivityRecorder` + call-site instrumentation.** One `record(userId, type, context)` bean, invoked same-transaction from `AuthService` (register, login), `UserService` (name change), `ApiKeyService` (set/replace), `PromptService` (create, version append, delete, restore), and the Run-creation path (`run_started` with the in-progress row). → *verify (HTTP): each of the nine mutations produces exactly one event with the right type/label; a forced event-insert failure rolls back the mutation (nothing half-recorded); no event on failed validation.*
- [x] **11.4 `GET /api/me/activity`.** Owner-scoped, `{items, hasMore}`, fixed page size, `occurred_at DESC, id DESC`; `run_started` items enriched with live Run status via PK join. → *verify (HTTP): pagination composes; cross-User isolation; events for a Trashed Prompt's saves/runs/delete remain listed (labels intact) while the Prompt itself 404s elsewhere; a completed Run's event reports `completed`.*
- [x] **11.5 Frontend: "Recent activity" on `ProfilePage`.** Feed section under Usage — plain-text entries (type-appropriate wording + label + relative/absolute time), `LoadMoreButton`, sensible empty state. No links on entries in v1. → *verify (RTL + MSW): entries render with labels and run status; Load more appends; empty state for a fresh account shows at minimum the backfilled `registered` event wording or the empty message.*

---

## Phase 12 — Remove Versions, Run history, and Activity *(grilled 2026-08-08, ADR-0007)*

Reverses ADR-0001 and ADR-0006 and amends ADR-0003/0004/0005. A [Prompt](CONTEXT.md#prompt) becomes one mutable row;
running still streams but is not persisted; the Activity feed is deleted. Phases 4, 5, and 11 remain above as the record
of what was built and later removed.

**Decisions locked (grilling session):**
- **Runs:** stop *persisting*, keep *executing*. SSE streaming stays; nothing about a run is stored.
- **Usage:** survives on a purpose-built `token_usage` table keyed `(user_id, model)`, incremented on completion. Not a run log.
- **Activity:** deleted outright — table, package, feed, ADR-0006. The `logged_in` / `api_key_set` trail goes with it.
- **Prompt:** absorbs every Version field, plus `updated_at`. `created_at` already existed on `prompt` (V3) but was never mapped. Lists sort `updated_at DESC`, preserving today's edit-floats-to-top ordering.
- **Trash:** unchanged. Its ADR-0004 rationale (protect Run history) is void; kept as accidental-delete undo.
- **"Run" is not a noun.** `POST /api/prompts/{id}/run` is an action — no Run entity, id, or read DTOs. **"Run Settings" survives** as the verb form, redefined onto Prompt; `RunSettingsValidator` keeps its name.
- **SSE protocol:** `meta` frame deleted (it carried only `runId` + `versionNumber`); becomes `token*` → `done` | `error`. `done`'s shape is unchanged.
- **Concurrency:** last-write-wins. The `FOR UPDATE` lock (which existed for Version numbering) is removed, not replaced with optimistic locking. A stale tab clobbers newer edits silently — accepted.
- **UI:** View and Edit stay separate pages; tabs collapse to View / Edit / Run / Duplicate. No redesign bundled in.
- **Packages:** new `usage`; `run` keeps no entity, repository, or transaction of its own; `activity` deleted.
- **Docs:** ADRs are superseded/amended by banner, never edited or deleted. PRD gets a historical banner. This phase is appended, not a rewrite.
- **Migration:** V10 is irreversible — `pg_dump` the database immediately before deploying it.

- [x] **12.1 Docs first: ADR-0007, banners, CONTEXT.md, PRD, this phase.** Write `docs/adr/0007-…` superseding 0001/0006 and amending 0003/0004/0005; add a banner to each of those five; rewrite CONTEXT.md's glossary (delete Version, Run, Activity; rewrite Prompt, Run Settings, Trash, User); banner the PRD. → *verify: ADR listed in `docs/adr/README.md` with its supersede/amend status; no ADR body rewritten; CONTEXT.md defines only vocabulary the code still uses.*
- [x] **12.2 Migration V10 + backfill.** Add Version's columns to `prompt` (nullable → backfill from the max-number Version → `NOT NULL`); backfill `updated_at` from that Version's `created_at`; re-add the `max_tokens` CHECK only (V7 deliberately dropped the effort/thinking ones); seed `token_usage` from `sum(input_tokens), sum(output_tokens)` over `status = 'completed'` runs; drop `activity_event`, then `run`, then `version`. → *verify: applies on a fresh **and** a populated DB; follows `ActivityEventMigrationTest`'s seed-to-V9-then-migrate pattern; backfilled content matches each prompt's current Version; token totals match the pre-migration sums; list ordering is byte-for-byte unchanged.*
- [x] **12.3 Prompt absorbs Version.** One mutable entity; `PromptService` gains update-in-place; `PromptRequest`/`PromptResponse`/`PromptSummary` replace the Version DTOs; `PUT /api/prompts/{id}` replaces `POST /{id}/versions`; the current-version subqueries collapse to plain `prompt` queries. Delete `Version`, `VersionRepository`, `PromptDetail`, `VersionSummary`, and the `FOR UPDATE` lock. → *verify (HTTP): create/read/update/delete/restore/search/paginate all pass owner-scoped; placeholder set-equality and Run Settings validation are unchanged; no `/versions` route resolves.*
- [x] **12.4 New `usage` package.** `TokenUsage`, repository, `TokenUsageRecorder`, `UsageController`, `ModelUsage` move here; `RunStreamer` reports to the recorder on completion. → *verify (HTTP): `GET /api/me/usage` returns per-model totals; two runs on one model accumulate into one row; a failed run contributes nothing; cross-User isolation holds.*
- [x] **12.5 Strip the `run` package.** Delete `Run`, `RunRepository`, `RunStore`, `RunQueryService`, `RunReadController`, `RunDetail`, `RunSummary`; drop the `meta` frame; `RunService` resolves a Prompt instead of a Version. → *verify: the package holds no entity, repository, or `@Transactional`; streaming tests pass through the existing `RunStream` test double with no database.*
- [x] **12.6 Delete the `activity` package.** Package, `ActivityRecorder` call sites in `AuthService` / `UserService` / `ApiKeyService` / `PromptService`, and the three activity tests. → *verify: no reference to `activity` remains; the mutations it instrumented still succeed and roll back correctly.*
- [x] **12.7 Frontend: delete, rename, collapse.** Delete `CompareVersionsPage`, `PromptDetailPage`, `RunListPage`, `RunDetailPage`, `ActivityFeed` and their tests; rename `VersionViewPage`/`EditFromVersionPage`/`DuplicateFromVersionPage`; `VersionForm` → `PromptForm`; `PromptTabs` becomes a static four-link nav with no data fetching; routes 17 → 9; drop the now-orphaned `diff` dependency. → *verify (RTL + MSW): view/create/edit/run/duplicate/trash/profile all pass; `npm run lint`, `typecheck`, `test`, and `build` are clean.*
- [x] **12.8 Sweep orphans.** `PromptSummary.currentVersionNumber` (already unrendered), Version/Run types in `types.ts`, stale MSW handlers, dead assertions. → *verify: full backend and frontend suites green; no unused export or handler remains.*

---

## Phase 13 — Prompt Console *(grilled 2026-08-08, ADR-0008)*

Collapses editing and running a [Prompt](CONTEXT.md#prompt) into one surface at `/prompts/:id/console`: fields edited in
place, saved incrementally, with the response streaming into the same page. Amends ADR-0007's concurrency consequence.
Phase 12's "View and Edit stay separate pages; tabs collapse to View / Edit / Run / Duplicate" is reversed here — tabs
end at View / Console / Duplicate.

**Decisions locked (grilling session, 2026-08-08):**
- **Destination:** the Console **replaces** Edit and Run — not an additional power-user surface. Tabs go five → three.
- **Save model:** `PUT` for the Console's first iteration; `PATCH /api/prompts/{id}` gains its consumer when the fields convert to inline-editable. `PATCH` is committed with tests before that consumer exists. *(The 13.5 grilling revised this: the fields use a Console-local `useInlineField`, **not** the shared `useEditableField` — see the 13.5 decision block for why the shared hook could not be reused.)*
- **Why `PATCH` at all:** ADR-0007 accepts last-write-wins. `PATCH` narrows each clobber from *every field* to *only the fields that tab touched* — the honest justification for the endpoint, and the mitigation that keeps incremental saving from escalating to optimistic locking.
- **Blocking constraint, recorded now and solved when autosave lands:** `patchPrompt` validates the *merged* result, including `placeholderValidator.validateSetEquality`. Prompt text and Variables are an **atomic pair** — adding `{{topic}}` fails until `topic` is declared, and declaring `topic` fails until it is used; **no ordering makes each step individually valid.** Field-at-a-time autosave of either is not implementable. They commit together, or the save is held until consistent. `variableMismatch()` already computes exactly that predicate client-side. *(Amended by ADR-0009: Variables and `variableMismatch()` were removed; prompt text is run verbatim and there is no set-equality gate.)*
- **First change is a pure refactor:** inline only. Identical behavior, identical DOM, no run panel, no layout work. The run panel and inline-editing land as separate commits.
- **Structure:** two components in one file — `PromptConsolePage` (prompt query, load gates, tabs, Delete) and a private `ConsoleForm` (models query, `values` state, markup). **Not** one flat function: hoisting `useState(toFormValues(prompt.data))` above the load gate throws on first render, and hoisting the models query silently inverts the fetch waterfall from sequential to parallel. `promptFormValues.ts` stays shared and untouched — `variableMismatch` is a pure function and Create/Duplicate still need `emptyPromptValues`/`toFormValues`.
- **Tests precede the inline.** The Console has zero coverage today, so the suite would stay green even if the inlined copy dropped the mismatch gate entirely. Pin behavior first against the `PromptForm`-based page, then inline with the tests unchanged — that is what makes "pure refactor" verifiable in review rather than asserted.
- **Test depth:** one test per *mechanism*, not per *case*. The five mismatch cases in `CreateEditPrompt.test.tsx` exercise `variableMismatch()`, a shared pure function that is not being inlined and keeps its coverage regardless; one case through the Console proves the gate is wired.
- **Duplication window:** two copies of the form markup for roughly two commits. Accepted and bounded — the price of refactoring before redesigning.
- **Endgame:** `EditPromptPage` and `RunPage` are deleted — with their tabs and the Edit half of `CreateEditPrompt.test.tsx` — only once the Console is a proven superset (inline-editing **and** run panel landed and tested). `PromptForm` survives serving Create + Duplicate; `submitClassName` stays on it (Duplicate uses it).
- **No glossary entry:** the Console is a UI surface, not domain vocabulary. `CONTEXT.md` is unchanged.

- [x] **13.1 Docs first: ADR-0008, banner, this phase.** Write `docs/adr/0008-…` amending ADR-0007's last-write-wins consequence; add the amendment banner to 0007; list it in `docs/adr/README.md`. → *verify: ADR listed in the index with its amend status; no ADR body rewritten; `CONTEXT.md` untouched.*
- [x] **13.2 `PATCH /api/prompts/{id}`.** `PromptPatchRequest` (all fields optional, omitted = untouched), `PromptService.patchPrompt` merging onto the stored Prompt and validating the merged result with exactly the rules a full save gets — Bean Validation included, since `@Valid` on the controller argument cannot run against a partial body. Owner-scoped; Trashed → 404. → *verify (HTTP): a one-field patch leaves every other field byte-identical; a patch that breaks set-equality is rejected; a patch cannot produce a Prompt a full `PUT` could not; cross-user and Trashed both 404.*
- [x] **13.3 Console route, tab, and tests.** `/prompts/:id/console` + a Console link in `PromptTabs` + `PromptConsolePage` — knowingly a duplicate of Edit at this point. `PromptConsolePage.test.tsx` pins seven mechanisms: form seeded from the loaded Prompt; the client mismatch gate blocking submit with no PUT fired; Haiku hiding Effort and forcing Thinking off; Save issuing a PUT and navigating; Delete issuing a DELETE and navigating home; a client mismatch shadowing a stale server error; tabs and Delete rendering while the models query is still pending. → *verify (RTL + MSW): all seven pass against the `PromptForm`-based page before any inlining.*
- [x] **13.4 Inline `PromptForm` into `PromptConsolePage`.** Move the body in as the private `ConsoleForm`; `submitLabel`/`submitClassName` collapse to a literal Save button. → *verify: `PromptConsolePage.test.tsx` is **unchanged** and still green; `npm run lint`, `typecheck`, `test`, and `build` clean; `PromptForm` still serves Create/Duplicate with its own tests untouched.*

**Decisions locked (second grilling session, 2026-08-08 — converting fields to inline-edit):**
- **One writer per field.** A converted field leaves `values` and the `PUT` body entirely: read mode renders the value from the `['prompt', id]` query, edit mode renders a local draft, and `PATCH` becomes its only writer. The `PUT` sources converted fields from the query (`name: prompt.name`). This is what makes the migration incremental — `values` shrinks field by field and the Save button disappears when the last one leaves. The alternative (keep the field in `values` and re-seed it in the PATCH's `onSuccess`) keeps two writers permanently in hand-maintained sync, nine times over.
- **Why not `useEditableField`.** The shared hook fits Profile, not the Console: it `PUT`s a dedicated single-field endpoint, invalidates exactly one query key, and gets Enter-to-commit natively because each Profile field owns its own `<form>`. Console fields `PATCH` a shared endpoint, must invalidate both `['prompt', id]` and `['prompts', q]` (different prefixes — one key cannot cover both), and cannot nest a `<form>` inside `ConsoleForm`'s. Bending one hook across both would land every future Console-specific need in a hook Profile also depends on. A Console-local `useInlineField` is the `PromptForm` judgment applied again.
- **Commit gesture.** Focus enters edit mode. An icon button (`type="button"` + `onClick`, since a nested `<form>` is illegal) commits; `onKeyDown` makes Enter commit and `preventDefault()` the outer submit, and Escape revert. **Enter falling through to the outer form is the expensive silent failure** — it would fire a full `PUT` overwriting eight other fields from whatever `values` holds — so it gets its own test.
- **Button lifecycle.** Rendered only while `editing`; `disabled` while the draft is blank or unchanged. Not conditioned on the disabled rule as well, which would make it flicker in and out as you type and backspace.
- **Blur does nothing.** Edit mode persists until commit or Escape (`NameForm`'s behavior). Also load-bearing, not just precedent: a mousedown on a button that only exists while focused would unmount it before the click landed. And with no version history (ADR-0007), a discarded draft is gone.
- **Commit guard.** `disabled` when `draft.trim() === ''` (matching `@NotBlank` exactly) or `draft === prompt.name`, making the server's blank-field rejection unreachable through the UI. The draft is sent **untrimmed** — the `PUT` path does not trim, and trimming here would make the two writers disagree about the same field. No-op writes are worth refusing: ADR-0008's stated worry is writes becoming frequent and incidental, and a no-op `PATCH` still costs a list invalidation.
- **Cache.** `PATCH` returns the full `PromptResponse`, so `setQueryData(['prompt', id], response)` sets the detail exactly, and `invalidateQueries(['prompts'])` handles the list (a filtered, ordered collection that cannot be derived from one Prompt). This is not a micro-optimization: under invalidate-only, a successful `PATCH` merely *schedules* a refetch, and during that round-trip `prompt.name` is still stale — clicking the big Save in that window silently reverts the rename just committed.
- **Errors are field-scoped.** A failed `PATCH` renders its own `ErrorAlert` beside the field, with the draft and edit mode intact. The bottom of a long form is the wrong place to report a too-long name, and folding it into the existing `mismatch ?? saveError` chain would make that chain nine-deep and arbitrary. Accepted cost: `ErrorAlert`'s "keep `getByRole('alert')` unambiguous" note no longer holds page-wide, so field-level tests scope with `within(...)`.
- **`required` on a converted field is removed, not left.** After conversion the input no longer feeds the `PUT`, so native validation would block a submit over a field the `PUT` does not read.

- [x] **13.5 Name as an inline-edited field — the first `PATCH` consumer.** Add `apiClient.patch`; add a Console-local `useInlineField`; convert Name per the decisions above. → *verify (RTL + MSW): six mechanisms — commit sends `{name}` alone and updates the field from the response with no refetch; the button is absent in read mode and disabled until the draft differs; Enter commits and fires **no** `PUT`; Escape reverts to the stored name; a failed `PATCH` shows an error beside the field with the draft intact; and the rewritten `PUT` test proves the Save button now carries the **stored** name, not the field's draft.*

---

## Phase 14 — Console absorbs View and Duplicate *(ADR-0010)*

Phase 13's "tabs end at View / Console / Duplicate" is reversed here — the Console absorbs View and Duplicate too,
leaving the Console as the sole prompt surface. Amends ADR-0008, whose three-tab end-state never shipped: the last Edit
page, the shared `PromptForm`, and the `PromptTabs` nav are deleted in the same consolidation.

**Decisions locked:**
- **The Console is the view.** A separate read-only View page was redundant once the Console showed the live prompt inline; it is deleted, not kept as a duplicate surface.
- **Duplicate is a button, not a page.** Duplicating a Prompt is a single action with no form of its own — it fits as a button in the Console's Details section (POST a copy, navigate to the new prompt's Console), not a navigable tab.
- **Create skips the form.** "New Prompt" POSTs a default prompt and opens its Console; the first editing happens inline in the Console, the same surface every other edit uses. `PromptForm` is deleted — it existed to serve a Create/Duplicate page that no longer exists.
- **Routes collapse.** `/prompts/:id` (View), `/prompts/:id/edit`, and `/prompts/:id/duplicate` redirect to `/prompts/:id/console`; the Console is the only prompt route that renders.
- **No glossary entry.** Like the Console itself (ADR-0008), this is a UI-surface change, not domain vocabulary; `CONTEXT.md` is unchanged.

- [x] **14.1 Docs first: ADR-0010, banner, this phase.** Write `docs/adr/0010-…` amending ADR-0008's three-tab end-state and voiding its "PromptForm survives serving Create and Duplicate" consequence; add the amendment banner to 0008; list it in `docs/adr/README.md`. → *verify: ADR listed in the index with its amend status; no earlier ADR body rewritten.*
- [x] **14.2 Collapse routes and delete the page components.** `RedirectToConsole` covers `/prompts/:id`, `/prompts/:id/edit`, and `/prompts/:id/duplicate`; delete `PromptViewPage`, `EditPromptPage`, `DuplicatePromptPage`, `PromptForm`, `PromptTabs`, and their tests; Duplicate becomes a button in the Console's Details section. → *verify (RTL + MSW): the three old paths redirect to `/prompts/:id/console`; Create and Duplicate still work as one-click actions into the Console; `npm run lint`, `typecheck`, `test`, and `build` clean.*

---

## Phase 15 — API-key status detail & theme toggle *(stories 54–55)*

Two small post-MVP profile/UI features added to the PRD after the original scope (stories 54 and 55).
Both are built; recorded here so every PRD story has a TASKS home.

- [x] **15.1 API-key status shows a last-six fragment (story 54).** `GET /api/me/api-key` returns `lastSix`
  (the last six characters of the stored key) alongside `hasKey`/`updatedAt`, so a user can tell *which*
  key is saved without the full key ever being returned. Migration V6 adds the `last_six` column;
  `ApiKeyStatus.lastSix` carries it; the frontend `ApiKeyStatus` type mirrors it. This amends Phase 3's
  original "no key fragment" locked decision. → *verify (HTTP): `GET` returns `lastSix` for a stored key;
  the full key is never present in any response.*
- [x] **15.2 Light/dark theme toggle with remembered preference (story 55).** `useTheme` persists the choice
  and `ThemeToggle` switches it; the app restores the saved theme on every visit. → *verify (RTL): toggling
  changes the theme and the choice survives a reload.*

---

## Phase 16 — Google sign-in as a second Login Method *(ADR-0011)*

Scoped in after the MVP, reversing this list's original "OAuth/SSO/social login" fence. A Google account
becomes a second **Login Method** on the *same* User, never a second account; the design and its rejected
alternatives are in [ADR-0011](adr/0011-google-sign-in-verified-email-linking.md).

- [x] **16.1 Docs first: ADR-0011 and the glossary.** Add `Login Method` to `docs/CONTEXT.md` and amend
  `User` to hold one or more of them; write `docs/adr/0011-…` and list it in `docs/adr/README.md`.
  → *verify: the ADR is indexed and CONTEXT.md stays implementation-free.*
- [x] **16.2 Schema: a User may have no password.** V12 adds `google_sub` (unique), drops
  `password_hash NOT NULL`, and adds `ck_users_has_credential` so "every User holds at least one Login
  Method" is a database invariant. → *verify (SQL): a Google-only row inserts; a row with neither
  credential is rejected; a duplicate `google_sub` is rejected.*
- [x] **16.3 Verification seam.** `GoogleTokenVerifier` returns a `GoogleIdentity`; `RealGoogleTokenVerifier`
  checks signature, issuer, audience and expiry via `NimbusJwtDecoder` against Google's JWK Set, and
  `FakeGoogleTokenVerifier` stands in everywhere else. Unlike `RealClaudeClient` the real adapter is tested —
  failing open here is an auth bypass. → *verify (JUnit): tokens signed by an unpublished key, for another
  audience, from another issuer, or expired are all rejected; both spellings of Google's issuer are accepted.*
- [x] **16.4 Login: subject, then verified email, then create.** `POST /api/auth/google` issues the ordinary
  access token; `GET /api/auth/config` publishes the client ID at runtime; an unset `GOOGLE_CLIENT_ID` turns
  the feature off (`503 google_not_configured`) rather than stopping the app. → *verify (HTTP): a verified
  email links onto an existing password account; a returning user is found by subject after their Google
  email changes, with the stored email untouched; an unverified email and a Google-only user's password
  attempt both get the generic 401.*
- [x] **16.5 Google's button on Login and Register.** The GIS script is injected only when a client ID is
  configured; `googleSignIn.ts` is the only place that touches `window.google`. → *verify (RTL + MSW): no
  button and no `initialize` when the backend reports no client ID; a credential is exchanged for a token and
  lands in the app; a rejected token shows the error and stays put.*

---

## Phase 17 — Markdown prompt bodies that save themselves *(ADR-0012)*

The Console's two prompt bodies — a Prompt's **prompt text** and its **system prompt**, labelled *User Prompt* and
*System Prompt* in the UI — become markdown editors that autosave, and their per-field commit and revert buttons are
deleted. The Details fields keep the click-to-edit, explicit-commit behaviour Phase 13 shipped. Phase 13.5 recorded
autosave as the intended endpoint and named the blocker — prompt text and Variables validated as an atomic pair, so
*"field-at-a-time autosave of either is not implementable"* — which ADR-0009 removed by deleting Variables. This phase
spends that freedom on the two fields the edit → run → read loop actually turns.

**Decisions locked (grilling session, 2026-08-12):**
- **Trigger:** a debounced `PATCH` per body — one second after typing stops, or every ten seconds under unbroken typing
  (a pure debounce never fires for a fast continuous typist). Two independent savers, extending the existing per-field
  `PATCH` model rather than introducing a combined write. Rejected: **save on blur** (exactly the "stale tab clobbers on
  a stray blur" hazard ADR-0008 flagged, and CodeMirror blurs in surprising places); **one Console-level Save button**
  (reverses ADR-0008 for every field and does not fix the stale-run trap, only relocates it); **save only on Run**
  (editing without running is ordinary and would be lost on navigation).
- **Run writes before it runs.** A run reads the *stored* Prompt — `streamRun` sends only a `promptId` — so Run cancels
  the pending debounce, `PATCH`es, awaits the write, then streams. A failed write blocks the run. Duplicate does the
  same: it copies from the query cache and would otherwise silently duplicate the previous text. Delete **cancels**
  pending saves rather than flushing them. In-app navigation fires a best-effort flush without awaiting (React Query
  mutations outlive unmount).
- **Blank is two different things.** `promptText` is `@NotBlank`, so an empty body holds the save rather than sending a
  request that must `400` — and blocks Run, because a flush that writes nothing would let Run fall through to the
  previous stored text. `systemPrompt` has no constraint; blank is a legitimate save that clears the column.
  ***Superseded by Phase 19 / ADR-0013:*** blank is one thing now — both bodies treat it as a legitimate save that
  clears the column, and only a both-blank Prompt blocks the run.
- **Five status states** — *Saved*, *Saving…*, *Unsaved changes*, *Can't be empty*, *Couldn't save* — shown in the
  active field, with a dirty/error marker on each tab so the body you are not looking at is not silent. Rejected: a
  single Console-level aggregate (cannot say *which* field is stuck) and status in the active field only (a System
  Prompt failing to save for ten minutes reads as "Saved" from the User Prompt tab).
- **The `Ctrl+Enter` commit chord goes with the button.** It exists because Enter had to reach the editor as a newline,
  leaving the commit homeless; once the field saves itself there is nothing for it to do, and Run already flushes for
  anyone who wants the write to happen *now*. A "save now" chord was considered and rejected as a third way to do what
  the debounce and Run already do.
- **Failure is visible and inert.** No retry machinery: the next keystroke restarts the debounce and Run flushes.
  Rejected: **backoff retry** (a `400` can never succeed, and a give-up rule is another decision) and a **clickable
  Retry / conditional ✓** (a save button by another name, and UI that appears and vanishes is harder to learn than
  either extreme).
- **Undo is `Ctrl+Z` only, so the editors stay mounted.** Tab switching hides them rather than unmounting them, keeping
  CodeMirror's history alive for the life of the Console. EasyMDE's `autoRefresh` option does **not** cover reveal — the
  addon arms once, only if the wrapper is already zero-height, and calls `stopListening` the first time it fires — so
  activation needs an explicit `codemirror.refresh()`. The same effect must carry `focus()`, because `autofocus` lives
  in the memoised `options` object and changing that object's identity tears the editor down and rebuilds it.
- **`beforeunload` covers every uncommitted Console draft**, the bodies *and* an open Details editor — one rule rather
  than two notions of unsaved work. It does not fire on in-app navigation, so abandoning a Details edit by navigating
  away still works exactly as it does today.
- **Writes are cheap, and that is load-bearing.** `['prompts', q]` is queried only by the prompt list, which is
  unmounted while the Console is open, so each save's invalidation marks stale without refetching. Overlapping saves
  need an ordering guard: each success writes `setQueryData(['prompt', id])`, and a slow earlier response would
  otherwise overwrite a newer one.
- **Test-seam limits, recorded because they shape the suite.** CodeMirror's textarea is a keystroke buffer, so
  `toHaveValue` and `user.clear` do not touch the document — content is asserted through the `PATCH` body, and typing
  appends at the autofocused cursor. CodeMirror measures its viewport off element heights, which jsdom reports as zero,
  so rendered line text is not reliable. `user-event` no longer sends the legacy `keyCode` CodeMirror resolves chords
  through, so chord tests use `fireEvent`. Reveal-refresh and `beforeunload` are not reachable in jsdom at all and are
  verified in a browser.
- **No glossary entry.** Like the Console itself (ADR-0008), this is a UI surface; *prompt text* and *system prompt*
  already exist in `CONTEXT.md`, and when a Prompt is written is not something the domain reasons about.

- [x] **17.1 Docs first: ADR-0012, banners, this phase.** Write `docs/adr/0012-…` amending ADR-0008's "a Prompt is saved
  without the User asking" consequence (reached, not reversed) and ADR-0007's "saving is destructive and has no undo"
  (sharper — the revert button that replaced abandon-by-navigating-away is gone); add amendment banners to 0007 and
  0008; list it in `docs/adr/README.md`. → *verify: ADR indexed with its amend status; no earlier ADR body rewritten;
  `CONTEXT.md` untouched.*
- [x] **17.2 EasyMDE markdown editor for the two prompt bodies.** Replace the plain textareas with
  `react-simplemde-editor` (matching `paulwoods/equipment-frontend`); bundle Font Awesome and disable EasyMDE's runtime
  CDN fetch; map its palette onto the app's tokens so it follows the theme toggle; reset the app's `<ul>`/`<li>` globals
  inside the preview. Landed on branch `markdown-prompt-editor` ahead of this ADR — the editor's toolbar, preview and
  `Ctrl+Z` are what the decisions above assume. → *verify (RTL + MSW): the tab renders an editor with a formatting
  toolbar and no read mode; the toolbar writes markdown syntax into the source; `npm run lint`, `typecheck`, `test`,
  `build` clean. Browser: icons render, both themes readable, preview and side-by-side correct.*
- [x] **17.3 Keep both editors mounted across tab switches.** Render the two bodies always and hide the inactive one;
  add an activation effect calling `codemirror.refresh()` and `focus()`, and drop `autofocus` from the memoised
  `options`. Pure refactor — no save behaviour changes yet. → *verify (RTL): switching to Details and back leaves the
  draft intact and the editor focused; the hidden body is not reachable by role query. Browser: a revealed editor
  measures correctly rather than collapsing.*
- [x] **17.4 Debounced autosave, and the ✓/✕ come off the two bodies.** Extend `useInlineField` with a 1s/10s debounce
  for `live` fields; hold the save while `promptText` is blank; add the overlapping-response ordering guard; drop the
  `Ctrl+Enter`/`Cmd-Enter` commit chord and the `onCommit` prop with the buttons. → *verify
  (RTL + MSW): a pause after typing fires one `PATCH` carrying that field alone; unbroken typing still saves within the
  ceiling; a blank User Prompt sends nothing; a stale response cannot overwrite a newer one; no commit or revert button
  renders for either body.*
- [x] **17.5 Save status: five states in the field, a marker on the tab.** → *verify (RTL + MSW): the status reads
  *Saved* on arrival, *Saving…* in flight, *Unsaved changes* while the debounce is pending, *Can't be empty* on a blank
  User Prompt, and *Couldn't save* after a rejected `PATCH`; a dirty System Prompt shows a tab marker while the User
  Prompt tab is active.*
- [x] **17.6 Lift save state; Run and Duplicate flush, Delete cancels.** Move the coordinating state into
  `PromptConsolePage` so `RunPane` can see it. → *verify (RTL + MSW): clicking Run straight after typing `PATCH`es
  before it streams, and the run carries the typed text; a failed flush blocks the run and surfaces the error; Run is
  blocked on a blank User Prompt; Duplicate copies the typed text, not the stored text; Delete fires no `PATCH`.*
- [x] **17.7 `beforeunload` guard over every uncommitted Console draft.** Bodies dirty or failed, plus any Details field
  open with a draft differing from stored. → *verify (RTL): the handler is registered only while something is
  uncommitted and removed once clean. Browser: closing the tab mid-edit prompts; in-app navigation does not.*
- [x] **17.8 Browser verification of what jsdom cannot reach.** Reveal-refresh across tab switches, the `beforeunload`
  dialog, and the status wording in both themes. → *verify: driven in Chrome against the running app, as the Phase 17.2
  styling was.*
  → *Done (2026-08-29): a dependency-free CDP driver (`.scratch/17.8-browser-verification/verify.mjs`, Node's native
  WebSocket — no repo dependency) drove google-chrome-stable 152 headless against the live backend + Vite. 21/21 checks
  and 8 screenshots: the hidden editors mount on Details; a tab switch reveals a visibly re-measured CodeMirror (height
  495, lines rendered, stored text shown, draft intact after a Details round trip); all five statuses reached for real —
  `Unsaved changes` on type, `Saving…` pinned by holding the PATCH in CDP, `Couldn't save` via a fulfilled-500 (worded so
  again in the light theme), `Saved` on recovery, `Can't be empty` on blank — plus status wording and backgrounds
  screenshotted in both themes. The `beforeunload` dialog is the one genuinely automation-hostile surface, and verifying
  it took two findings: a synthetic `location.reload()` from `Runtime.evaluate` never earns the dialog because Chrome only
  prompts for a navigation carrying user activation — the check grants it with a real `Input.dispatchMouseEvent` click
  (the reload is then fired un-awaited, since the dialog suspends the evaluate's own response); and `setValue` with the
  already-stored text fires no change event, so the reload's draft must differ from what an earlier check saved. With both
  in place the dialog fires on reload while uncommitted, stays silent on clean and dirty in-app navigation (ADR-0012's
  design), and accepting it completes the reload. Screenshots 1–8 live beside the driver.*

---

## Phase 18 — Codebase review findings *(full-stack review, 2026-08-28)*

Findings from a full-stack codebase review. All suites were green under review (frontend: 74/74 tests, typecheck, lint;
backend: 149 tests), and the items below are the defects and debts the review surfaced around that. Ordered by
impact *(all nine built 2026-08-28/29 — notes under each; grilling is a later phase's business)*.

- [x] **18.1 Run Settings can claim a capability the run rejects: Fable 5 + `thinking: off`.** `RunSettingsValidator`
  gates only `thinking=adaptive` against the model→capabilities map (`RunSettingsValidator.java:37`), while
  `ClaudeRequestMapper` sends `ThinkingConfigDisabled` for every non-adaptive Prompt (`ClaudeRequestMapper.java:49`) —
  so a Prompt saved as `model=claude-fable-5, thinking=off` passes save-time validation and fails at run time,
  contradicting the validator's own javadoc that saved settings are "trusted as legal everywhere downstream". Probe the
  live API first; then either omit `thinking` for always-thinking models in the mapper or reject the combination in the
  validator/catalog. Related, lower impact: `effort` is limited to `low|medium|high` while `claude-fable-5` and
  `claude-opus-4-8` also accept `xhigh`/`max`. → *verify: anything the save accepts, a run accepts — pinned by a
  live-API probe or a per-model contract test over the mapper.*
  → *Done (2026-08-28), resolved mapper-side per Phase 5's locked "Fable 5 is always-on (send the model's required form)":
  `ModelCapability` gained `effortLevels` + `alwaysThinking` (opus-4-8 and fable-5 widen to `xhigh`/`max`; haiku keeps
  `low|medium|high` as its stored set though it forwards none — the old global enum could only ever store those three, so
  no legacy row is stranded); the validator checks effort against the model's levels; the mapper sends the required
  adaptive form for an always-thinking model and never `ThinkingConfigDisabled` there. The Console takes its effort
  options from the model, hides thinking on an always-thinking model, and carries the effort correction in the
  model-change PATCH (same merged-result trap as thinking). No live-API probe was possible — no real Anthropic key in
  the environment — so the contract is pinned the verify line's other way, by the per-model mapper test
  (`ClaudeRequestMapperTest.everySavedSettingReachesTheWireAsItsModelRequires`).*
- [x] **18.2 Test `RealClaudeClient` — the only untested Anthropic-SDK class.** The adapter owning the stream event
  loop, exception translation (AUTH/RATE_LIMIT/OVERLOADED/NETWORK/OTHER), and per-call client construction and closing
  has no test; only `ClaudeRequestMapper` is covered. → *verify: tests pin deltas forwarded verbatim, exactly one
  terminal callback, each SDK exception mapped to its category, and the client closed on every exit path.*
  → *Done (2026-08-28): `RealClaudeClientTest` walks the SDK's real types with fakes — a stubbed `RawMessageStreamEvent`
  stream plus a Mockito `AnthropicOkHttpClient`/`Response` — so the test stands on the same wire the adapter walks. It
  pins text deltas reaching the `TokenSink` verbatim while thinking deltas stay behind the seam, an empty stream still
  completing, every SDK failure status mapped to its category (AUTH/RATE_LIMIT/OVERLOADED parameterised, IO → NETWORK,
  anything else → OTHER), exactly one terminal callback per run (`onComplete`/`onError` never both), and — for each exit
  path, failures included — the per-call client built from that call's key and closed exactly once.*
- [x] **18.3 Hermetic test profile.** Sourcing `.env` per the README quickstart before `./mvnw verify` leaks the real
  `GOOGLE_CLIENT_ID` into the test JVM: a review run failed 2/149 in `GoogleSignInDisabledTest` (config echoed the dev
  client id; the disabled sign-in path returned 401 rather than 503) and passed 3/3 with the variable unset — green,
  but only against an unpopulated `.env`. → *verify: `set -a; . ./.env; set +a && ./mvnw verify` passes; the test
  profile pins the integration-relevant env-derived properties (`GOOGLE_CLIENT_ID` at minimum).*
  → *Done (2026-08-29): an `application-test.properties` profile now resolves the env-derived placeholders itself —
  `promptvault.google.client-id=` empty (the comment there records why the shell must never be consulted; Google's own
  test still pins its id via `@TestPropertySource`, which outranks files) — plus fixed throwaway JWT-secret and
  encryption-key values for a fully stand-alone suite. The verify command was run against the real 1.8 KB `.env` with an
  exported `GOOGLE_CLIENT_ID`: full `./mvnw verify` green, `GoogleSignInDisabledTest` included.*
- [x] **18.4 Enable TypeScript `strict`.** `"strict": true` is absent from all three tsconfigs, so implicit `any`,
  nullable dereferences, and uninitialised properties all pass `tsc`. Given the codebase's rigour this reads as a lost
  Vite-template default rather than a choice; it is the highest-leverage tooling fix available. → *verify: `strict` on
  in `tsconfig.json`/`tsconfig.app.json`/`tsconfig.node.json` and `npm run typecheck` green after fixing what it
  surfaces; suites still green.*
  → *Done (2026-08-29): `strict: true` enabled in the solution file and both project configs (under a `/* Strictness */`
  comment, as the Vite template carries it). What enabling it surfaced needed no code change — a forced full rebuild
  (`tsc -b --clean && tsc -b`) was green on the first pass, confirming the review's "lost default" reading. Lint and the
  suites stay green (87/87 at the registry commit).*
- [x] **18.5 Runs can be stopped and can survive a malformed frame — neither is true.** `streamRun.ts` has no
  `AbortController` and the RunPane has no Stop control, so a running stream cannot be stopped and leaving the Console
  leaves the fetch and its state updates going. `JSON.parse(data)` at `streamRun.ts:79` has no try/catch, so one
  malformed frame throws out of the reader loop and discards everything already streamed. Harden in one pass: a stop
  path (Stop button + abort on unmount), per-frame parse tolerance, and the ignored protocol details
  (`id:`/`retry:`/comment lines, CRLF). Include the unmount flush's silent `.catch(() => {})`
  (`PromptConsolePage.tsx:144-149`) — a failed save on leaving is lost with no recourse — and cover the in-stream 401
  path, which duplicates `apiClient`'s clear-and-dispatch logic and is untested. → *verify (RTL + MSW): Stop aborts the
  fetch; a malformed frame is skipped without losing prior tokens; leaving mid-run does not keep streaming into an
  unmounted hook; a mid-stream 401 clears the token and routes to login.*
  → *Done (2026-08-29): one pass, as specified. `streamRun()` takes an `AbortSignal` and skips a malformed frame in
  place (a throw there would discard everything already streamed, and a one-shot body cannot be re-read); comments and
  `id:`/`retry:`/unknown fields are ignored; CRLF is tolerated with a carriage-hold so a chunk-split `\r\n` cannot
  masquerade as a frame boundary, and a missing-terminator tail frame still parses at end of stream. A mid-stream 401
  routes through the same extracted `clearAndAnnounceUnauthorized()` as the JSON client (token cleared, AuthListener
  routed) instead of surfacing as a run error. `useRunStream` gains a Stop that aborts and marks `stopped`
  synchronously; unmount and prompt-change share one cleanup (abort + idle reset, and the flush-on-leave failure is
  `console.error`ed rather than silently swallowed). RTL+MSW tests cover each clause, including stop, the malformed
  frame, unmount mid-run, and the 401.*
- [x] **18.6 Drop `spring-boot-devtools` from the production jar.** Declared as a direct `runtime` dependency in the
  production `pom.xml` (`backend/pom.xml:118-122`, oddly space-indented) and ships in the built artifact. → *verify:
  the dependency is gone and `./mvnw verify` stays green.*
  → *Done (2026-08-29): the dependency block and its comment are gone from `backend/pom.xml`; the verify run in this
  registry's 18.3 note also proves the jar builds without it (166/166).*
- [x] **18.7 "New Prompt" stops hard-coding the default model.** `NEW_PROMPT_BODY.model = 'claude-sonnet-4-6'`
  (`HomePage.tsx:27`) duplicates the backend catalogue by hand, when `GET /api/models` already returns `defaultModel`
  and the Console already fetches it — a backend model rename silently breaks Prompt creation. → *verify (RTL + MSW):
  creating a Prompt uses the catalog's `defaultModel` rather than a frontend literal.*
  → *Done (2026-08-29): the mutation resolves the model at call time via `queryClient.fetchQuery` over the warm
  `['models']` cache — the button never waits on a cold fetch, and no frontend literal exists. The test serves a
  `defaultModel` named nowhere else in the app (`catalogue-only-model`) and asserts that exact string in the POSTed
  body.*
- [x] **18.8 Dead-code sweep.** Backend: `Page.from` (`common/Page.java:12`, no callers — `PromptService` builds
  `Page` by hand), `AuthPrincipal.email()` (parsed and carried per request, never read), `ApiKey.getEncKeyVersion()`
  (keep the `enc_key_version` column — ADR-0002 rotation scaffolding — but drop the unread getter or wire rotation).
  Frontend: the 0-byte tracked `src/App.tsx`, the unreferenced `public/icons.svg` sprite, the stray `src/node_modules/`
  vitest cache directory, and the dead CSS — `.variable-add`/`.variable-remove` (`index.css:697-715`,
  ADR-0009 leftovers), `.button-link-outline` (`:660-664`), `.status-current`, `.prompt-columns`/`.settings-columns`
  (`:1388-1394`), and the stale "version/run metadata" comment (`:1179`). → *verify: a reference-grep proves each
  removal; backend and frontend suites, typecheck, and lint stay green.*
  → *Done (2026-08-29): every listed item removed, each proven unreferenced by a grep of the tree before the cut. With
  `AuthPrincipal.email` gone the record reduces to `userId` (tokens still carry email at issue; nothing downstream read
  the claim), and the `enc_key_version` column plus its constructor plumbing stay per ADR-0002 — only the unread getter
  was dropped. The sweep also took two adjacent provably-dead rules the grep flagged for the same reason: the `.status`
  pill base (only `.status-current` used it) and the `.EasyMDE` overflow override (this build never emits the class).
  Backend suite, frontend suite, typecheck, and lint all green.*
- [x] **18.9 Give the dev Postgres its volume back.** The `promptvault-pgdata` named-volume mount is commented out of
  `docker-compose.yml`, so dev data dies with `docker compose down`. Restore it — or decide reset-on-down is deliberate
  and say so in the README. → *verify: Prompts survive a `down`/`up` cycle.*
  → *Done (2026-08-29): the mount is restored at `/var/lib/postgresql` (the wide mount, since postgres:18 keeps PGDATA
  under it) with the compose comment explaining that only `down -v` starts over, and the top-level `promptvault-pgdata:`
  declaration reinstated. Verified against the live stack the API-level way: a Prompt POSTed before `down` still reads
  back with its original timestamps after `up` — persistence, not a re-seed, since the init script runs only on an empty
  volume.*


## Phase 19 — Either prompt body may be empty *(grilled 2026-08-29, ADR-0013)*

A Prompt's **prompt text** and **system prompt** may each be empty, independently; a Prompt with both empty is
saveable but not runnable. The `@NotBlank` on prompt text predated ADR-0012 and no ADR ever argued it — the only
genuinely unsafe end of an empty body was a *run*, so that is now the only thing forbidden, and everything Phase 17
built to work around the rule (the held blank save, the *Can't be empty* status, the always-blocked run) goes with it.

**Decisions locked (grilling session, 2026-08-29):** either body may be empty, per-field — the combination of both
blank is the invalid state, and it is invalid at *run*, not at save; a system-prompt-only run sends a **single space**
as the user message (the API rejects an empty text block and requires at least one message); the Console keeps the
disabled Run button with the reason on it, no dialog; blank autosaves symmetrically for both bodies; empty is stored
as `null`, matching `system_prompt`; New Prompt starts with both bodies blank.

- [x] **19.1 `promptText` drops `@NotBlank`; `prompt_text` drops `NOT NULL`.** V13 relaxes the column, and
  `PromptService` normalizes blank → null for both bodies, so empty has one representation. → *verify: a PATCH with
  blank `promptText` stores null (PromptPatchTest).*
- [x] **19.2 Both-blank is not runnable.** `RunService.run` throws `DomainValidationException` (`promptText`) when
  neither body has text, before anything streams. → *verify: RunServiceTest 400s a both-blank Prompt and runs a
  single-filled-body one.*
- [x] **19.3 The mapper speaks for an absent prompt text.** `ClaudeRequestMapper` sends `' '` when the user message
  would otherwise be blank. → *verify: ClaudeRequestMapperTest pins null and whitespace both going out as one space.*
- [x] **19.4 The Console treats blank as a value.** The User Prompt editor flips to optional (blank autosaves, as the
  System Prompt's always has); the *Can't be empty* status is deleted (unreachable — both live fields are optional, so
  save status is four states again); Run is disabled while both drafts are blank, with
  *"add a System Prompt or User Prompt first"* on the button. → *verify: PromptConsolePage.test pins a blank body
  autosaving, a single filled body re-enabling Run either way around, and the both-blank block.*
- [x] **19.5 New Prompt starts empty.** Both bodies are blank on creation — the canonical draft state. → *verify:
  HomePage.test's default body carries two empty strings.*
- [x] **19.6 The record.** ADR-0013 written; ADR-0012 and Phase 17's blank-asymmetry note annotated as superseded;
  CONTEXT.md's Prompt definition updated. Backend suite 168/168, frontend suite 89/89, typecheck clean.

## Phase 20 — Retire PUT: one write seam for the Prompt *(architecture review 2026-08-28, candidate 3)*

The Prompt has three write doors, and one of them has no caller. `PUT /api/prompts/{id}`
(`PromptController.java:44-48`) is reached by nothing in the app; it survives as a test-fixture
convenience in `PromptDeletionTest:191,205`, `PromptReadTest:48,110`, `PromptSearchTest:133` and
`RunServiceTest:127`, and `PromptConsolePage.test.tsx:319` registers a PUT handler purely to assert the
Console never calls one.

The review also reported "two validation mechanisms that produce two different error envelopes". Read
against the code, that is half right and worth stating correctly: `MethodArgumentNotValidException` and
`DomainValidationException` produce the *same* envelope —
`{error: "validation_error", message: "Validation failed", details: {field: message}}`
(`GlobalExceptionHandler.java:26-33` and `:56-60`) — and the frontend already joins however many
entries it finds (`errorMessage.ts:20-30`). They differ only in **cardinality**: `@Valid` reports every
violated field, `PromptService.requireMechanicallyValid` reports exactly one. One envelope, two
cardinality rules.

**Decisions locked (grilling session, 2026-08-29):**
- **PUT goes, and so does `PromptService.updatePrompt`.** A service method kept alive only for the test
  suite is the same smell as the endpoint. Fixtures move to PATCH first, then both are deleted.
- **Validation unifies upward, not downward.** The surviving merged-content pass collects *every* Bean
  Validation violation rather than reporting one. This moves the user-facing behaviour forward — break
  two fields in one PATCH today and you are told about one of them — and needs no frontend change.
- **The domain chain stays fail-fast.** `RunSettingsValidator` is sequential by necessity: effort cannot
  be judged until the model is known to be real, and adaptive thinking not until that model's
  capabilities are in hand. Reporting "unsupported model `x`" *and* "invalid effort for model `x`" is
  one fact stated twice. Collecting applies to the mechanical layer only, which keeps the change inside
  `PromptService` and leaves every existing `DomainValidationException` caller untouched.
- **The lowest-property-path tiebreaker disappears as a consequence, not as a goal.** It existed to make
  a one-error report deterministic; with all violations reported there is nothing left to tiebreak.
- **The log helpers stay two.** The review counted 30 duplicated lines; the duplication is the eight
  field *names*, and the logic differs in the one way that matters — only a patch can distinguish an
  absent field from an empty one (`PromptController.java:102-103`). The dead `operation` parameter goes,
  since it existed only to name which of two callers was calling.
- **The write seam earns an ADR.** "Why is there no PUT?" is exactly the question an ADR answers, and
  nothing currently records that PATCH is the Prompt's only mutating door.

- [x] **20.1 Migrate the fixtures off PUT.** Rewrite the five MockMvc usages as PATCH with the same body;
  `RunServiceTest:127` becomes a `patchPrompt` call. → *verify: no test references `put("/api/prompts` or
  `updatePrompt`; backend suite green at its current count.*
- [x] **20.2 Delete the endpoint and the method.** Remove `PUT /api/prompts/{id}` and
  `PromptService.updatePrompt`, and the frontend MSW handler that existed only to watch for a PUT.
  → *verify: the route 405s; backend and frontend suites, typecheck and lint green.*
- [x] **20.3 One validation pass, every violation.** With PUT gone, `POST` is the last `@Valid` site;
  route it through the same merged-content pass `PATCH` uses, and have that pass collect all mechanical
  violations into one `details` map. The `min(propertyPath)` tiebreaker goes with it. → *verify: a create
  and a patch carrying the same bad value produce byte-identical bodies; a request breaking two fields
  reports both; `PromptCreateTest`'s expectations move to the single envelope; a bad model still reports
  once, from the domain layer.*
- [x] **20.4 One log helper per shape, minus the dead parameter.** Drop `operation` from `logRequest`
  (one caller left), keep `logPatch` distinct. → *verify: `ControllerLogLeakTest` and `LeakHygieneTest`
  stay green; no body or system prompt text reaches a log line.*
- [x] **20.5 The record.** New ADR — `docs/adr/0014-prompt-write-seam.md`: POST creates, PATCH changes,
  validation runs once against merged content, and the full-save shape survives only as the merge
  target. Add it to `docs/adr/README.md`'s index. Amend
  ADR-0008's consequence *"`PUT` remains the full-save path and keeps serving Create, Duplicate, and the
  Console's first iteration"* (`docs/adr/0008-prompt-console.md:33`) — the decision it records stands,
  only that consequence expires. ADR-0012's concurrency reasoning is PATCH-only and untouched.

**Constraint.** The full-save *shape* survives: `PromptRequest` remains the merge target and the create
body. This retires a door, not the idea of a complete Prompt.


## Phase 21 — One flush seam for the whole Prompt *(architecture review 2026-08-28, candidate 2)*

"What runs is what is on screen" is enforced for the two self-saving bodies and for nothing else. The
`BodySaves` seam (`PromptConsolePage.tsx:78-86`, built at `:118-135`) covers `promptText` and
`systemPrompt`; a run reads eight stored fields (`RunService.java:37-52`). Name, Description, Model, Max
tokens, Effort and Thinking are inline fields whose only writer is a commit click or Enter — so an open
editor holding an uncommitted Model or Max tokens streams the *previous* value with no indication, and
Duplicate (`:921-943`) copies from the query cache and so copies the same stale value.

The fix is not more special cases. Every field already exposes `flush()`, `cancelPending()` and
`committable` from `useInlineField` (`:301-486`). What is missing is one owner holding all eight and one
seam every action crosses.

**Decisions locked (grilling session, 2026-08-29):**
- **The seam, not autosave everywhere.** Making the six settings live would supersede ADR-0012 and still
  would not remove the flush — an autosave is debounced, so a pending window exists either way. It would
  change how many fields are pending, not whether pending is possible. (The separate UX question of
  whether picking from a `<select>` should need a save click is worth raising on its own merits, not
  inside this phase.)
- **One owner: `usePromptFields(promptId, prompt)`.** It creates all eight `useInlineField`s and returns
  them plus the seam. `ConsoleForm` receives the six it renders, `RunPane` receives the seam, and neither
  knows how many fields exist. Not a context-registration scheme — the field set is statically eight, and
  registration would make "which fields does Run flush?" answerable only at runtime.
- **Two flush verbs, because the scopes differ permanently.** `flush()` — all eight — for Run,
  Duplicate and Delete; `flushOnLeave()` — the bodies only — for unmount. Named for intent rather than
  scope on purpose: the default verb stays unqualified because flushing everything *is* the normal case,
  and the exception is named for the moment it exists to serve, so the unmount effect reads as
  deliberate at exactly the site where calling the wrong one causes the bug the next decision describes.
  (`flushLive` was rejected — "live" is `useInlineField`'s private flag, not domain vocabulary;
  `flushBodies` names which fields rather than why, asserting as a definition what is only true today.)
- **Unmount deliberately does not write the six.** ADR-0012 leaves in-app navigation unguarded, and
  abandoning a Details edit by clicking away is a gesture users rely on — a body has no discard gesture
  *because* it is always live, so unmount must write it; a Details field's discard gesture *is* leaving.
  Flushing all eight on unmount would turn backing out into a silent save with no undo.
- **`discard()` covers all eight** — a no-op for the six, which own no timers. It costs nothing and lets
  the verb mean one thing: stop everything not yet written. In-flight PATCHes are not aborted; they are
  already race-guarded by the send/landed sequence (`:314-316`), and a PATCH landing on a Prompt being
  deleted is harmless.
- **A held field blocks the Run, with the reason on the button.** Name is required and `committable`
  refuses to send it blank (`:434-437`), so clearing the Name leaves a field that is uncommitted *and*
  unsendable. Blocking is the rule the Console already teaches; running against the stored name would let
  the screen and the stored Prompt disagree silently.
- **`blockedReason: string | null`, precedence owned by the seam.** The seam holds all eight fields and
  is the only thing positioned to say which problem to fix first. This does put user-facing copy inside
  the seam — accepted, because the copy *is* the rule stated in words.
- **A failed flush names the field.** With eight fields, six of them behind a possibly-closed tab, a bare
  "couldn't save" tells the user nothing to act on.

- [x] **21.1 `usePromptFields` owns the field set and the seam.** All eight `useInlineField`s move into
  one hook that returns them plus *`flush` · `flushOnLeave` · `discard` · `blockedReason`*. `BodySaves`
  goes. → *verify: the eight fields are declared in one place; `RunPane` receives only the seam;
  `PromptConsolePage.tsx` shrinks by the moved declarations; suite and typecheck green.*
- [x] **21.2 Run crosses `flush`.** `handleRun` flushes every field before it streams. → *verify (RTL
  + MSW): editing Max tokens and clicking Run without committing PATCHes the new value before the run
  POST, and the run streams against it.*
- [x] **21.3 Duplicate crosses `flush`.** The copy is taken only after every field has landed.
  → *verify (RTL + MSW): an uncommitted Model is written before the POST and the copy carries it, not the
  stored one.*
- [x] **21.4 Delete discards eight; unmount flushes two.** `discard()` cancels pending saves across all
  eight; the unmount effect calls `flushOnLeave()` and keeps its best-effort `console.error` on
  rejection, with the discard-gesture reasoning in a comment above it.
  → *verify: deleting with a pending edit sends no PATCH after the DELETE; leaving the Console with an
  uncommitted Description does **not** write it, while a pending body edit still does.*
- [x] **21.5 One blocked rule, one reason.** The both-blank rule becomes one held reason among several;
  `RunPane` renders `blockedReason` rather than computing it (`:193-198`). → *verify: both-blank and
  blank-Name each disable Run with their own reason on the button; precedence between them is pinned by
  a test; a single filled body re-enables Run either way around.*
- [x] **21.6 A failed flush says which field failed.** The seam's rejection carries the field name and
  `RunPane`'s alert uses it. → *verify (RTL + MSW): a PATCH that 500s on Max tokens blocks the run and
  names Max tokens in the alert.*
- [ ] **21.7 The record.** ADR-0012 gains the unmount asymmetry in its consequences — bodies are flushed
  on leaving, Details drafts are discarded by leaving, and why the two differ. Note that the
  content-vs-settings split itself is unchanged: this phase sharpens *when* a settings field is written,
  not whether it autosaves. PATCH still narrows each clobber to the fields a tab touched (ADR-0008).

**Constraint.** No field starts autosaving as a side effect of this phase.


## Phase 22 — Give the Run one module *(architecture review 2026-08-28, candidate 1)*

The review drew this candidate against a pre-18.5 codebase, and 18.5 has since absorbed most of what
made three fragments read as one leaky module: `streamRun` takes an `AbortSignal`, skips a malformed
frame in place, tolerates CRLF across a chunk boundary, and shares one
`clearAndAnnounceUnauthorized()` with the JSON client, while `useRunStream` owns Stop and the
unmount abort. Three defects survive.

- **A stream that closes without a terminal frame leaves the run `running` forever.** The reader loop
  breaks on `done` and resolves (`streamRun.ts:60-83`); `useRunStream`'s `.catch` never fires, so nothing
  moves the status. The Stop button stays up, Run stays disabled, and only a navigation clears it.
- **A lib hook owns a route.** `useRunStream` calls `navigate('/settings/api-key')` on `no_api_key`
  (`useRunStream.ts:79-82`), so `lib/` knows the app's URL map.
- **The failure category is parsed and discarded.** The `error` frame carries `{category, message}` and
  `streamRun` hands both to `onError`, but only `info.message` is kept (`useRunStream.ts:65-70`) —
  nothing downstream can tell `RATE_LIMIT` from `AUTH` from `NETWORK`.

**Decisions locked (grilling session, 2026-08-29):**
- **No scheduled collapse.** The three defects are each fixable without moving a file. Introduce the test
  seam (22.4) and let *that* decide whether a `lib/run/` folder appears — a move made for a reason you
  can point at, rather than because a diagram drawn before 18.5 showed three boxes.
- **Close-without-terminal resolves to `failed`.** A stream that ends mid-run *is* a failure: the key was
  spent and the answer is cut off. `failed` already keeps the partial output on screen beside an alert
  (`PromptConsolePage.tsx:245-246`), which is the right rendering. A fifth `truncated` state would differ
  from `failed` only in wording a message can carry; `completed` would present a truncated answer as
  whole.
- **Pre-stream and mid-stream failures normalise to one `{category, message}`.** Today a pre-stream
  failure throws an `ApiError` (`streamRun.ts:41-51`) and a mid-stream one fires `onError`. The Console's
  question — what went wrong, what should the user do — has the same answer either way, and two shapes
  means two `if` ladders that agree until one is edited. No escape hatch to the raw envelope: nothing
  needs `details` or `status`, and an unused one is how the second shape grows back.
- **The Console owns the routing.** With one failure shape, the route decision is a lookup from category
  to destination, performed in `PromptConsolePage` — `lib/` stops importing `useNavigate`.
- **The category drives wording *and* affordance.** The categories exist because the backend already
  decided these failures differ in what the user should do: `RATE_LIMIT` and `OVERLOADED` are transient
  and get a Retry; `AUTH` gets the same API-key destination as the pre-stream `no_api_key`. Carrying the
  category without branching on it would stop one step short of the reason for carrying it.
- **Retry calls the same `handleRun`.** One path to "start a run". Skipping the flush on the assumption
  that nothing changed is false in the obvious case — a rate-limited user waits, edits, then retries.
- **No cooldown on Retry.** The failure mode that would justify one needs automation, and there is none:
  every run is a deliberate click and the control is disabled while streaming. A cooldown would be a
  timer and a countdown label built to stop a person clicking twice. (`retry-after` is not carried across
  the `ClaudeException` seam and is not worth widening it for.)
- **The test seam injects the fetch**, not frames and not parsed events. It is the narrowest cut that
  keeps the subtlest code under test — the carriage-hold for a CRLF split across chunks
  (`streamRun.ts:55-75`) and the malformed-frame skip (`:105-113`), both written for 18.5 — and handing
  back a `Response` keeps the status and content-type checks covered too.
- **One MSW test survives**, asserting the real wiring: `POST /api/prompts/{id}/run` with the Bearer
  header. The injected transport is the production default, and nothing else proves that URL.

- [ ] **22.1 Close-without-terminal has an owner.** A stream ending with neither `done` nor `error`
  resolves to `failed` with a message naming the truncation. → *verify (RTL + MSW): a stream closed after
  two token frames and no terminal frame leaves the tokens visible, hides Stop, re-enables Run, and
  reports the truncation; the happy path is unchanged.*
- [ ] **22.2 One failure shape, and the Console routes it.** Pre-stream `ApiError`s and mid-stream error
  frames normalise to `{category, message}` before the Console sees them; `no_api_key` maps into the
  `AUTH` family. `PromptConsolePage` performs the navigation. → *verify: no `useNavigate` or route
  literal remains in the run module; RTL still lands on `/settings/api-key` when the run endpoint answers
  `no_api_key`, and now also on a mid-stream `AUTH` frame.*
- [ ] **22.3 The category earns its keep.** Alert wording is chosen by category, and transient categories
  render a Retry that calls `handleRun`. → *verify: an `error` frame with `category: "rate_limit"` renders
  its own wording plus a Retry; clicking Retry re-flushes and re-runs; an `AUTH` frame offers the key
  page instead; the category is asserted, not just the message.*
- [ ] **22.4 Tests cross an injected transport.** The module takes a `(promptId, signal) =>
  Promise<Response>`; frame-level tests hand back a canned `Response` and stop touching MSW. Exactly one
  MSW test remains, asserting method, URL and Bearer header. → *verify: the frame-level cases run without
  MSW and without real timers; the malformed-frame, CRLF-split, comment/id/retry and 401 cases all still
  execute; the suite gets no slower.*
- [ ] **22.5 Collapse only if the seam asked for it.** Once 22.4 exists, decide whether `streamRun` and
  `useRunStream` want to be one `lib/run/` module — and record the answer either way. → *verify: whichever
  way it goes, the decision is written down rather than left to the next reader.*

**Constraint.** One-shot, no Run id, no reconnection stays true (ADR-0007): Stop is the client pulling an
abort the server already implements, Retry is a new run rather than a resumption, and a terminal state on
close is a *client* conclusion about a stream that ended — nothing is retried automatically and nothing
is persisted.


---

### Out of scope (do **not** build — from the PRD)

Multi-turn/conversational Runs · shared server key or billing beyond per-User attribution · draft-vs-published Versions · sharing/teams/roles · folders/tags/favorites · editing or deleting Versions/Runs · temperature/top_p/top_k · `PROMPTVAULT_ENC_KEY` rotation tooling · deployment/CI/CD/infra · rate limiting · security headers/TLS/production CORS · request tracing/metrics/APM · account lockout/password reset/email verification (see Phase 8 scope fence). Registration policy resolved to **open self-serve signup** (Phase 2). *Note: "search" was also originally on this list; Phase 9.1 subsequently scoped in a narrow name/description substring search — folders/tags/favorites (prompt organization) remain out of scope. "OAuth/SSO/social login" was likewise removed: Phase 16 scoped in Google sign-in as a second Login Method (ADR-0011) — SSO, other providers, and teams/roles remain out of scope.*
