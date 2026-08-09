# Soft-deletable Prompts with a restore-only Trash

> **Amended by [ADR-0007](0007-mutable-prompts-no-version-or-run-history.md).** The decision stands, but the rationale below is void: it chose soft delete to protect Run history, which no longer exists. Trash is now kept purely as an undo for an accidental delete.

A [Prompt](../../CONTEXT.md#prompt) can now be deleted, but deletion is soft: the Prompt gets a `deleted_at` timestamp rather than being removed, and it — along with all its [Versions](../../CONTEXT.md#version) and [Runs](../../CONTEXT.md#run) — disappears from every normal view (lists, detail pages, historical Versions, direct `/runs/:id` links) until it is restored from [Trash](../../CONTEXT.md#trash). We chose soft delete because a hard delete would cascade-destroy Run history, undermining ADR-0001's premise that a stored Run always points at the precise inputs that produced it. This is a distinct, coarser operation from ADR-0001's per-Version immutability: individual Versions and Runs remain permanently undeletable; only a whole Prompt (identity + everything under it) can be deleted, as a unit.

## Considered options

- **Hard delete** — simplest, but permanently destroys Run history for a Prompt, which nothing else in the app does.
- **Soft delete, invisible safety net only** (no Trash UI, just a flag protecting Run integrity) — cheaper to build, but reversibility nobody can act on isn't reversibility that matters to the user.
- **Soft delete with a Trash view (chosen)** — restore is a first-class, user-facing action.

## Consequences

- Delete fires immediately on click with no confirmation dialog (matching the app's existing convention of zero confirm dialogs anywhere) — this is safe specifically because Trash + restore already makes it low-stakes.
- Trash is restore-only, forever: there is no "permanently delete" action anywhere and no purge job. The Trash list itself is minimal — name and deleted-at timestamp only, with a Restore button — it does not permit drilling into a deleted Prompt's content or Version history.
- The cascade is total: while deleted, a Prompt's detail page, historical Versions, and Runs (including reads that go straight through `/runs/:id`, bypassing the Prompt route) all read as not-found, exactly like the existing owner-scoped 404 convention — deletion is just another reason a resource isn't currently reachable.
- Implementing the cascade check on Run reads requires a `run → version → prompt` join for `deleted_at`. This deliberately diverges from ADR-0003's denormalization of `user_id` onto `run` (which exists to keep the *owner* filter join-free everywhere): that denormalization is about a filter applied on every request, whereas deletion is a one-off, low-frequency check not worth the write-amplification of updating every affected `run` row on each delete/restore.
- Deleting a Prompt with an `in_progress` Run is unconditional — no blocking, no 409. The stream runs to completion or failure exactly as it would have; the resulting Run row is simply hidden by the cascade until restored. This matches the app's existing tolerance for orphaned in-progress Runs on a hard crash (ADR-0003) rather than introducing a new class of special-cased rejection.
- This is the first `DELETE`-shaped mutation in the API. It does not reopen Phase 4's "no `DELETE` on Prompts/Versions" — that constraint is about individual Versions (and Runs), which still cannot be edited or deleted; whole-Prompt deletion is a new, separate operation at a coarser grain.
