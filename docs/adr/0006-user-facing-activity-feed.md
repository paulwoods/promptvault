# User-facing activity feed recorded in the same transaction

Each [User](../../CONTEXT.md#user) gets an [Activity](../../CONTEXT.md#activity) feed — their own account history, shown newest-first on the Profile page. Events are rows in one append-only `activity_event` table (type, timestamp, optional refs to Prompt/Version/Run, and a **denormalized display label** such as the Prompt's name at event time), written **synchronously in the same transaction** as the mutation they describe. The taxonomy is nine types — `registered`, `logged_in`, `api_key_set`, `name_changed`, `prompt_created`, `version_saved`, `prompt_deleted`, `prompt_restored`, `run_started` — i.e. every mutation plus login. This is deliberately *not* operator analytics (the app has no admin concept) and *not* a security-audit log: no failed logins, and events carry only type + time + label — **no IP, user-agent, or device data**, so indefinite retention never accumulates PII. Logout is not recorded because a stateless-JWT server cannot observe it truthfully.

## Considered options

- **Derive the feed from existing tables** (Versions, Runs, and registration already carry timestamps) — rejected: the feed becomes a `UNION` across heterogeneous tables with painful pagination, and a new table is needed anyway for the events with no home (logins, delete/restore history, name changes).
- **Decoupled writes** (Spring application events / async listeners) — rejected: after-commit listeners fail silently, so the feed could quietly lose events; async infrastructure buys nothing at this scale.
- **Run events at terminal transition** (`run_completed`/`run_failed`) — rejected: a hard crash (ADR-0003's accepted orphan case) would leave a Run that spent real tokens with no event at all, and the timestamp would mark the end, not the user's action.
- **Cascade-hiding events for Trashed Prompts** (mirroring ADR-0004's reachability rule) — rejected: it would hide the very `prompt_deleted` event that explains the deletion, and force the `prompt.deleted_at` join the denormalized label exists to avoid.
- **One append-only table, same-transaction writes, run-started events, always-visible history (chosen).**

## Consequences

- An event-insert failure **fails the mutation** — the feed is exactly the truth, at the cost that a broken `activity_event` table blocks writes. Login gains its first database write; a failed insert there fails the login too, with no special-casing.
- A Run is recorded once, at creation (`run_started`), in the transaction that writes the `in_progress` row; the feed shows the Run's **live status via a primary-key join** to `run` at read time. Orphaned in-progress Runs appear honestly as in-progress.
- Events referencing a Trashed Prompt **stay visible** (precedent: ADR-0005 counts deleted Prompts' tokens — history is fact, reachability is state). Feed entries are **plain text with no links** in v1, so no per-row reachability check against ADR-0004's cascade is needed; ADR-0004's "no drill-in from Trash" holds because only the denormalized name is shown, never content.
- Retention is **indefinite** — no purge job, no cap, matching ADR-0004's no-purge stance. Login events make this the fastest-growing table; pruning them is a named future option, not built.
- The creating migration **backfills true history** via `INSERT … SELECT` (registrations, every Version, every Run, currently-Trashed deletes, the latest key-set) — every backfilled event is a real action with its real timestamp. Not reconstructible, accepted: past logins, restores, name changes, deletes since restored, key-set history.
- If "was this me?" login forensics (IP/device) is ever wanted, that is a deliberate revisit of the rejected security-audit scope — not fields to bolt onto this table.
