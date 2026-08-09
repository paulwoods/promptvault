# Mutable Prompts with no Version or Run history

> **Amended by [ADR-0008](0008-prompt-console.md).** The decision stands. Its "concurrent edits are last-write-wins" consequence was reasoned about an explicit Save button; the Console saves incrementally, making writes frequent and incidental rather than deliberate and rare.

A [Prompt](../../CONTEXT.md#prompt) now carries all of its own content — name, description, prompt text, [Variables](../../CONTEXT.md#variable), and [Run Settings](../../CONTEXT.md#run-settings) — in one **mutable** row. Saving an edit overwrites what was there. Running a Prompt still streams Claude's response to the browser, but the run is **not persisted**: no inputs, no rendered prompt, no response, no status, no id. The `version`, `run`, and `activity_event` tables are dropped, and the Version, Run, and Activity concepts are removed from the glossary entirely.

This **supersedes [ADR-0001](0001-immutable-everything-versioning.md)** (fully-immutable, everything-versioned Prompts) and **[ADR-0006](0006-user-facing-activity-feed.md)** (user-facing activity feed), and **amends [ADR-0003](0003-sse-streaming-runs.md)**, **[ADR-0004](0004-soft-deletable-prompts-with-trash.md)**, and **[ADR-0005](0005-usage-dashboard-tokens-not-dollars.md)** as described below.

We chose this because the reproducibility ADR-0001 bought was not being used. Prompt Vault is a personal tool for iterating on prompts, not an audit system: in practice a User wants the *current* wording of a Prompt and the answer Claude just gave, and the accumulated history of every intermediate revision and every past response was cost — in schema, in query complexity, in UI surface, and in navigation — with no corresponding use. Removing it collapses two entities into one, deletes four pages and eight endpoints, and makes the streaming path stateless.

## Considered options

- **Keep versioning, hide it in the UI** — cheapest to implement and reversible, but it keeps every join, the append-only write path, and the `version` table's growth while delivering none of the benefit. Hidden features are still maintained features.
- **Keep Runs but cap retention** (e.g. last N per Prompt, or a TTL) — preserves "what did this produce?" for recent work at bounded cost, but needs a purge job the app has deliberately never had (ADR-0004), and a run history that silently forgets is harder to reason about than one that doesn't exist.
- **Delete both outright (chosen)** — largest one-time cost, smallest steady state.

## What this amends in earlier ADRs

- **ADR-0003 (SSE streaming)** — the *decision* stands: runs stream over SSE for responsiveness. Its "explicit lifecycle" half is void. There is no persisted `in_progress → completed / failed` status, nothing to observe mid-flight, and no row to mark `CLIENT_DISCONNECT` on — a dropped connection simply aborts generation. Its accepted "orphaned in-progress Run on a hard crash" consequence disappears permanently, along with any future need for a reaper. The frame protocol loses its `meta` frame (it carried only `runId` and `versionNumber`) and becomes `token*` → `done` | `error`.
- **ADR-0004 (soft delete + Trash)** — the *decision* stands, but its stated rationale is entirely void: it chose soft delete because a hard delete would cascade-destroy Run history. There is no Run history. Trash is kept on new grounds — it is an undo for an accidental delete, and it costs one nullable column. See the consequences below for the asymmetry this leaves.
- **ADR-0005 (tokens, not dollars)** — the *decision* stands, but its premise that token counts were "already recorded on every Run, so the dashboard is free" is void. Token totals now live in a purpose-built `token_usage` table keyed `(user_id, model)`, incremented when a run completes. The dashboard is no longer a by-product of run history; it is the reason that table exists. Its "sourced directly from `run`" consequence is replaced accordingly.

## Consequences

- **Saving is destructive and has no undo, while deleting a whole Prompt is reversible forever.** This inversion is accepted, not overlooked: the frequent, low-thought action (save) now destroys data, and the deliberate one (delete) is the protected one. Versioning was what made save safe, which is why ADR-0004 only ever had to reason about delete. "No permanent delete anywhere" remains true but is now a much weaker promise than it reads.
- **Concurrent edits are last-write-wins, silently.** ADR-0001's per-Prompt `FOR UPDATE` lock existed to serialize Version numbering and, incidentally, was the app's only concurrency control. It is removed rather than replaced with optimistic locking: this is a single-User-per-Prompt tool, so the only realistic collision is one User in two of their own tabs. The real exposure is a stale tab saved hours later, which reverts everything in between with no warning. Accepted; revisit only if sharing is ever introduced.
- **A failed or disconnected run leaves nothing at all** — not even the partial output that was previously saved onto the failed Run row. The User keeps whatever reached the screen.
- **The `logged_in` / `api_key_set` / `name_changed` trail is gone** with the Activity feed. The app now has no record of account activity of any kind. Reintroducing one means a new table and a new ADR, not restoring this one.
- **The migration is irreversible.** V10 drops `version`, `run`, and `activity_event`; Flyway has no down-path, and every historical Prompt revision and every stored Claude response is destroyed when it runs. A `pg_dump` taken immediately before the deploy is the only route back to that content, and it lives outside the app.
- **The `run` package owns no persistent state** — no entity, no repository, no transaction boundary of its own. It resolves a Prompt, talks to Claude, pushes frames at a stream, and reports a token count to the `usage` package. This is the structural payoff of the change and is worth preserving.
- **`PromptSummary.currentVersionNumber` and the `diff` npm dependency are removed as orphans** — the former was already unrendered, the latter existed solely for the deleted version-comparison page.
