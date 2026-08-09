# Usage dashboard shows token counts, not dollar cost

> **Amended by [ADR-0007](0007-mutable-prompts-no-version-or-run-history.md).** The decision stands, but its premise is void: token counts are no longer a by-product of stored Runs. They live in a purpose-built `token_usage` table keyed `(user_id, model)`.

The Profile page's account-wide usage summary reports all-time input/output token totals per model — it does not estimate a dollar cost. The PRD's Out of Scope section already rules out "any billing/cost-tracking beyond per-User attribution via the User's own key"; token counts *are* that per-User attribution (already recorded on every [Run](../../CONTEXT.md#run)), but converting them to a dollar figure would mean introducing and maintaining a per-model price table that has no other reason to exist in this app and goes silently wrong the moment Anthropic reprices a model.

## Considered options

- **Dollar-cost estimate** — more directly useful, but requires a price table with no source of truth in the app, and a stale table shows confidently wrong figures.
- **Token counts only (chosen)** — answers "am I using a lot?" without an accuracy liability.

## Consequences

- If real cost-tracking is ever wanted, that's a deliberate re-scoping of the PRD's existing non-goal, not something to bolt onto this dashboard — don't add a price table here without revisiting that boundary explicitly.
- The dashboard is a single account-wide, all-time aggregate (grouped by model) on `ProfilePage`, sourced directly from `run` filtered by the denormalized `user_id` — no join through `version`/`prompt`, so it includes token usage from Runs whose Prompt has since been soft-deleted (ADR-0004): the tokens were genuinely spent regardless of the Prompt's current visibility.
