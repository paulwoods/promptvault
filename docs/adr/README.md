# Architecture Decision Records

Why Prompt Vault is shaped the way it is. Each ADR records *that* a decision was made and *why* — read these before
reversing one of them. Domain vocabulary is defined in [`../CONTEXT.md`](../CONTEXT.md).

Superseded and amended ADRs are kept, never deleted or rewritten — a reversed decision is still the reason the code looks the way it does. Each carries a banner at the top pointing at the ADR that changed it.

- [0001 — Fully-immutable, everything-versioned Prompts](0001-immutable-everything-versioning.md) — *superseded by 0007*
- [0002 — Per-user, reversibly-encrypted Anthropic API keys](0002-per-user-encrypted-api-keys.md)
- [0003 — Runs stream over SSE with an explicit lifecycle](0003-sse-streaming-runs.md) — *amended by 0007*
- [0004 — Soft-deletable Prompts with a restore-only Trash](0004-soft-deletable-prompts-with-trash.md) — *amended by 0007*
- [0005 — Usage dashboard shows token counts, not dollar cost](0005-usage-dashboard-tokens-not-dollars.md) — *amended by 0007*
- [0006 — User-facing activity feed recorded in the same transaction](0006-user-facing-activity-feed.md) — *superseded by 0007*
- [0007 — Mutable Prompts with no Version or Run history](0007-mutable-prompts-no-version-or-run-history.md) — *amended by 0008, 0009*
- [0008 — One Prompt Console replacing the separate Edit and Run pages](0008-prompt-console.md) — *amended by 0009*
- [0009 — Remove Variables from Prompts](0009-remove-variables.md)
