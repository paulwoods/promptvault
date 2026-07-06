# Architecture Decision Records

Why Prompt Vault is shaped the way it is. Each ADR records *that* a decision was made and *why* — read these before reversing one of them. Domain vocabulary is defined in [`CONTEXT.md`](../../CONTEXT.md).

- [0001 — Fully-immutable, everything-versioned Prompts](0001-immutable-everything-versioning.md)
- [0002 — Per-user, reversibly-encrypted Anthropic API keys](0002-per-user-encrypted-api-keys.md)
- [0003 — Runs stream over SSE with an explicit lifecycle](0003-sse-streaming-runs.md)
- [0004 — Soft-deletable Prompts with a restore-only Trash](0004-soft-deletable-prompts-with-trash.md)
- [0005 — Usage dashboard shows token counts, not dollar cost](0005-usage-dashboard-tokens-not-dollars.md)
- [0006 — User-facing activity feed recorded in the same transaction](0006-user-facing-activity-feed.md)
