# PRD: Prompt Vault (MVP)

> Vocabulary in this document — **User, Prompt, Version, Variable, Run Settings, Run** — is defined in [`CONTEXT.md`](../../CONTEXT.md). Load-bearing decisions are recorded in [`docs/adr/`](../adr/README.md) and are treated as fixed constraints here.

## Problem Statement

People who work with Claude accumulate prompts in scattered places — text files, chat history, sticky notes — with no history. When they tweak a prompt that was working, the previous wording is lost, and there is no record of which exact prompt produced a given Claude output. They also can't reuse a prompt with different inputs without hand-editing it each time, and they have no single place to keep a prompt, run it, and compare what it produced across revisions.

## Solution

Prompt Vault is a web app where a signed-in User creates and maintains Prompts, runs them against Claude, and keeps the full history of both. Every edit to a Prompt appends a new immutable Version (numbered from 1), so nothing is ever lost and any past Version can be viewed or re-run exactly as it was. Prompts support declared Variables (`{{placeholders}}`) so one Prompt can be reused with different inputs at run time. Each Run is executed against Claude with the Version's frozen Run Settings, streamed back token-by-token, and saved — giving the User a browsable record of which inputs produced which output for every Version. Each User supplies their own Anthropic API key (stored encrypted), so usage and cost are attributed per User.

## User Stories

### Accounts & authentication
1. As a visitor, I want to register an account with an email and password, so that I can start keeping my own Prompts.
2. As a registered User, I want to log in and receive a session token, so that I can access my Prompts securely.
3. As a logged-in User, I want my session token to authorize every request, so that no one else can read or change my data.
4. As a User, I want to log out, so that my session can no longer be used on a shared machine.
5. As a User, I want every Prompt, Version, and Run to belong to me alone, so that other Users can never see or act on my data.
6. As a User, I want requests without a valid token to be rejected, so that my vault is protected.

### Anthropic API key management
7. As a User, I want to save my own Anthropic API key, so that my Runs use my own quota and billing.
8. As a User, I want my saved key to be stored encrypted and never shown back to me in full, so that it can't be leaked from the UI or API.
9. As a User, I want to replace or update my saved key, so that I can rotate it when needed.
10. As a User, I want to be told clearly when I try to run a Prompt without a saved key, so that I know I must add one first.
11. As a User, I want to see whether a key is currently set (without seeing the key itself), so that I know my account is ready to run.

### Creating and editing Prompts
12. As a User, I want to create a new Prompt with a name, an optional description, prompt text, declared Variables, and Run Settings, so that its first Version (Version 1) is saved.
13. As a User, I want to edit any field of a Prompt and save it, so that a new Version is appended with an incremented number.
14. As a User, I want renaming a Prompt to create a new Version, so that the name change is part of the permanent history (per ADR-0001).
15. As a User, I want each Version to freeze its name, description, prompt text, Variables, and Run Settings together, so that re-running an old Version reproduces exactly what it was.
16. As a User, I want to declare Variables on a Version with a name, description, a required flag, and an optional default, so that I can reuse the Prompt with different inputs.
17. As a User, I want to reference declared Variables in the prompt text as `{{name}}`, so that their values are substituted at run time.
18. As a User, I want the save to be rejected with a clear message if my `{{placeholders}}` and my declared Variables don't match exactly, so that my Versions are always internally consistent.
19. As a User, I want to set the Run Settings on a Version — model (from the supported list), an optional system prompt, max tokens, effort (low/medium/high), and a thinking mode (off/adaptive) — so that runs of that Version behave predictably. (Which of effort/adaptive-thinking apply depends on the chosen model — see Further Notes.)
20. As a User, I want to be prevented from choosing a temperature, so that I'm not surprised by the model rejecting it.

### Browsing Prompts and history
21. As a User, I want to see a list of all my Prompts, each shown by the name of its current (latest) Version, so that I can find what I'm looking for.
22. As a User, I want to open a Prompt and see its full Version history in order, so that I can review how it evolved.
23. As a User, I want to view the frozen content of any historical Version, so that I can see exactly what it contained.
24. As a User, I want to clearly see which Version is the current (latest) one, so that I know what I'd be editing from.
25. As a User, I want to start editing from any Version (current or historical), so that I can branch my work off an older revision.

### Running a Prompt against Claude
26. As a User, I want to run any Version (current or historical), so that I can test or reuse it.
27. As a User, I want to be prompted to supply a value for each declared Variable before running, with defaults pre-filled, so that the prompt text is complete.
28. As a User, I want required Variables enforced before a Run starts, so that I don't accidentally send an incomplete prompt.
29. As a User, I want the Variable values substituted into the prompt text and sent as the user message, with the Version's system prompt sent separately, so that the request matches the Version's intent.
30. As a User, I want the Run to use the Version's frozen model, max tokens, and effort, so that the result is reproducible.
31. As a User, I want Claude's response streamed to me token-by-token, so that I see output immediately instead of waiting for the whole generation.
32. As a User, I want a Run to be one-shot (a single request and single response, no follow-up turns), so that the model stays simple and each Run maps to one Version.
33. As a User, I want a Run that fails (e.g. an API error or a dropped connection) to be recorded as failed rather than silently lost, so that I can see what happened.
34. As a User, I want my own saved Anthropic key used for the Run, so that the cost is mine.

### Run history
35. As a User, I want every Run persisted with the Version it ran, the Variable values I supplied, the rendered prompt that was sent, Claude's response, the model used, token usage, a timestamp, and a status, so that I have a complete record.
36. As a User, I want to browse the Runs for a Prompt or a specific Version, so that I can see what each produced.
37. As a User, I want to compare outputs across Versions of the same Prompt, so that I can judge whether an edit improved the result.
38. As a User, I want to see whether a Run is in-progress, completed, or failed, so that I understand its state.
39. As a User, I want to re-open a completed Run and read its full response and inputs, so that I can reuse or reference it later.

### Cross-cutting
40. As a User, I want clear validation errors when a request is malformed, so that I can correct it.
41. As a User, I want my data to survive restarts and be stored durably, so that my vault is reliable.

## Implementation Decisions

### Architecture & stack
- Two deployables: a **Spring Boot REST backend** and a **Vite + React + TypeScript frontend**. No server-side rendering; the frontend is a SPA that talks to the REST API.
- Persistence is **PostgreSQL** via Spring Data JPA, with **Flyway** managing schema migrations.
- Authentication is **email/password + JWT**: passwords stored BCrypt-hashed; the backend issues a JWT on login; the SPA sends it as a `Bearer` token; authorization is enforced on every endpoint and scoped to the owning User.

### Domain model (per ADR-0001)
- A **Prompt** is pure identity plus an append-only ordered history of **Versions**. The Prompt row carries no editable content fields. Prompt-list responses derive the display name from the Prompt's current (latest) Version.
- A **Version** is immutable. It freezes: name, description, prompt text, the declared **Variables**, and the **Run Settings**. Its number is an integer starting at 1 and incrementing by one per save. Any edit — including a rename — creates a new Version; there is no in-place update of Version content.
- A **Variable** is explicitly declared on a Version with: name, description, `required` flag, optional default. Variables are referenced in the prompt text as `{{name}}`.
- **Run Settings** on a Version are: model (one of the supported Claude model IDs), optional system prompt, max tokens, effort (`low`/`medium`/`high`), and thinking (`off`/`adaptive`). No temperature — the current default models reject it. `effort` and `adaptive` thinking are not supported by every model, so a Version may not select a capability its model lacks; the supported combinations are described by a backend-maintained model→capabilities map, validated at save and exposed to the SPA. (Thinking was added during the build grilling as a deliberate extension to the original four settings.)

### Save-time validation
- Saving a Version is **strictly validated**: the set of `{{placeholders}}` in the prompt text must exactly equal the set of declared Variable names — every placeholder declared, every declared Variable used. Any mismatch rejects the save with a clear error.

### Claude integration (per ADR-0003)
- The boundary to Anthropic is a **single injected interface** (the "Claude client"): it takes the rendered prompt, the Version's Run Settings, and the User's decrypted API key, and produces a stream of response tokens. This is the only seam to the external model and is what the SSE endpoint and the tests depend on.
- A **Run** is one-shot (single request → single response). The rendered prompt (Variables substituted) is sent as the user message; the Version's system prompt is sent separately.
- Claude's response is delivered to the browser incrementally over **Server-Sent Events**. The backend persists the complete Run when the stream finishes.
- A **Run carries a lifecycle**: in-progress → completed / failed. The read/history API for Runs is separate from the streaming endpoint. A dropped connection or API error transitions the Run to failed. *Resolved in ADR-0003 / Phase 6:* a dropped connection aborts generation, closes the per-Run client, and marks the Run failed with a `CLIENT_DISCONNECT` cause (no background completion, no reaper).
- A persisted Run records: the Version, the supplied Variable values, the rendered prompt sent, the response, the model used, token usage, a timestamp, and a status.

### API key handling (per ADR-0002)
- Each User stores their own Anthropic API key. Because it must be sent to Claude at run time, it is **reversibly encrypted** with AES-256-GCM. The master encryption key comes from an environment variable / secret (`PROMPTVAULT_ENC_KEY`) and is never in the database or repository.
- The database stores only IV + ciphertext + auth tag. The plaintext key is **never returned to the client** in any response; the API exposes only whether a key is set.

### API contract (shape, not paths)
- Resource-oriented REST over JSON for: auth (register/login), the current User's API-key status/set, Prompts (list/create), a Prompt's Versions (list/create/get), and Runs (list/get) — plus a **separate SSE endpoint** that executes a Version and streams the Run.
- All non-auth endpoints require a valid JWT and operate only on resources owned by the authenticated User; cross-User access returns not-found/forbidden.
- Validation failures (auth, malformed body, Variable/placeholder mismatch, missing required Variable values, missing API key on run) return structured error responses.

## Testing Decisions

A good test asserts **external, user-observable behavior** — request in / response + persisted state out, or rendered UI behavior — never internal structure. Tests should not assert on private methods, class shapes, or call sequences; they should survive any refactor that preserves behavior. Prefer the highest seam; the fewer seams, the better.

### Backend — tested through the HTTP front door
- Drive tests through real API calls (`@SpringBootTest` with MockMvc/WebTestClient) against a **real Postgres via Testcontainers**. This exercises auth, ownership scoping, validation, versioning, and persistence end-to-end.
- Behaviors to cover at this seam:
  - Registration and login; rejection of unauthenticated and cross-User requests.
  - Creating a Prompt creates Version 1; editing appends an incremented Version; renaming appends a Version; historical Versions remain readable and unchanged.
  - Strict Variable/placeholder validation rejects mismatches (placeholder without declaration; declared-but-unused Variable).
  - Prompt-list shows each Prompt by its current Version's name.
  - API-key endpoints: a submitted key round-trips for a Run, is **never returned** in any response, and is stored as **ciphertext** (assert the stored bytes differ from plaintext).
  - Running with no saved key returns the clear "add a key" error; running with missing required Variable values is rejected.

### Backend — the one injected Claude-client seam
- The Anthropic boundary is stubbed by a **fake Claude client** in tests (no network, no key, deterministic). The fake:
  - emits canned tokens then completes, to test a successful streamed Run and its persisted record (response text, model, token usage, status = completed);
  - errors, to test the **failed-Run** path and lifecycle;
  - **captures the key and rendered prompt it received**, to prove the User's key was decrypted correctly and that Variables were substituted and the system prompt sent separately.

### Frontend — tested through the rendered UI
- Component/flow tests with **React Testing Library**, asserting user-facing behavior; **no** mocking of hooks or internal components.
- The backend is mocked at the network boundary with **MSW** (the single frontend seam). Cover: login flow, creating/editing a Prompt (and seeing a new Version), the run form (Variable inputs with defaults, required enforcement), and rendering streamed output + the in-progress/completed/failed states.

### Prior art
- No existing tests in `promptvault/` (greenfield). The nearest in-repo precedent is the parent 3dlabel project's pattern of **pure, dependency-injected cores tested headlessly** (e.g. `label-model.test.js` driving a pure module with fake `ops`). The fake-Claude-client seam follows the same philosophy: keep the external/impure dependency behind an injected interface and substitute it in tests.

## Out of Scope

- Multi-turn / conversational Runs (a Run is strictly one-shot, single request → single response).
- A single shared server-side API key or any billing/cost-tracking beyond per-User attribution via the User's own key.
- External OAuth / SSO / social login (email + password + JWT only).
- A draft/published-Version distinction; sharing Prompts or Runs between Users; teams/organizations; roles/permissions beyond owner-only.
- Prompt folders, tags, search, or favorites.
- Editing or deleting Versions or Runs (history is append-only / immutable).
- Temperature / top_p / top_k controls.
- Key rotation tooling for `PROMPTVAULT_ENC_KEY` re-encryption (noted as a future need in ADR-0002).
- **Registration policy** — resolved during the build grilling to **open self-serve signup** (public registration; tightenable later via a single env flag). No longer an open question.
- Deployment, CI/CD, containerization, and infrastructure provisioning.

## Further Notes

- Open questions, resolved during the build grilling (recorded here for history):
  - **Run failure semantics on dropped SSE connection** — *resolved:* a dropped connection **aborts** generation and marks the Run **failed** (`CLIENT_DISCONNECT`); no background completion (the stream is a blocking push on the request thread with no reattach endpoint). A hard crash may leave an orphaned in-progress Run (accepted; no reaper for the MVP). (ADR-0003, now marked resolved.)
  - **Registration policy** — *resolved:* open self-serve signup (see Out of Scope note above).
  - **Exact REST endpoint paths** — concrete paths are now pinned in the build plan (`docs/TASKS.md`); the streaming run endpoint is a single `POST .../versions/{number}/runs` returning `text/event-stream`, separate from the Run-history reads. (This PRD stays at the contract-shape level by design.)
- Supported Claude model IDs at time of writing: `claude-opus-4-8` (default), `claude-sonnet-4-6`, `claude-haiku-4-5`, `claude-fable-5`. Run Settings use `effort` rather than temperature because the current default models reject sampling parameters. Note: `effort` and `adaptive` thinking are **per-model** capabilities (e.g. Haiku does not support `effort`), reconciled via the model→capabilities map rather than assumed universal.
- This project currently lives inside the `3dlabel` git repo under `promptvault/`. If Prompt Vault should be its own repository, that should be decided before code is committed.
- The triage label `ready-for-agent` does not exist on `paulwoods/3dlabel`, and the Matt Pocock triage vocabulary was not set up in this environment; this PRD was saved locally rather than published to the issue tracker.
