# One Prompt Console replacing the separate Edit and Run pages

> **Amended by [ADR-0009](0009-remove-variables.md).** The decision stands. Its "Prompt text and Variables must be saved as one unit" consequence is void — Variables are gone, so there is no declaration list for the text to agree with and no `variableMismatch()` predicate. The separate Run page this ADR left in place is deleted; the Console's click-to-run pane is the sole run surface.
>
> **Amended by [ADR-0010](0010-console-absorbs-view-and-duplicate.md).** The decision stands. Its "three tabs: View / Console / Duplicate" end-state never shipped — the Console absorbed View and Duplicate too, leaving the Console as the sole prompt surface, and `PromptForm` is deleted. See ADR-0010.

Editing a [Prompt](../CONTEXT.md#prompt) and running it become one surface: the **Console**, at `/prompts/:id/console`.
Fields are edited in place and saved incrementally rather than through a whole-form Save button, and the response
streams into the same page. The separate Edit and Run pages are deleted once the Console does everything they did,
collapsing the Prompt tabs from five to three (View / Console / Duplicate).

This **amends [ADR-0007](0007-mutable-prompts-no-version-or-run-history.md)**, whose consequences were reasoned about an explicit, deliberate Save.

We chose this because iterating on a prompt is a loop — edit, run, read, edit again — and the app made that loop a navigation exercise. Every turn cost a tab switch, a form submit, a redirect, and a second page load, with the wording you were tuning and the output you were judging never on screen together. Collapsing the two pages removes the round trip from the app's single most repeated action.

## Considered options

- **Keep Edit and Run separate, add a run panel to Edit** — smaller change, but leaves two editing surfaces to maintain and keeps the Run page as a second way to do the same thing. Two surfaces that diverge is the failure mode, not the tab count.
- **Console as an extra power-user surface, Edit and Run retained** — no migration risk and nothing to delete, but permanently triples the editing code paths for a single-user tool. Rejected on the same grounds ADR-0007 rejected hiding versioning: an unused surface is still a maintained surface.
- **Merge into one Console and delete the originals (chosen)** — largest one-time cost, one surface at rest.

## What this amends in ADR-0007

- **"Concurrent edits are last-write-wins, silently."** The decision stands — there is still no optimistic locking, and the risk is still one User in two of their own tabs. What changes is its shape. That consequence was written about a save that is *deliberate, rare, and user-initiated*; incremental saves make writes *frequent and incidental*, so a stale tab can now clobber on a stray blur rather than only when someone hits Save hours later. Two things pull the other way and are the reason this is accepted rather than escalated to optimistic locking: `PATCH` narrows each clobber from every field to only the fields that tab actually touched, and a Console that shows the live prompt is a tab you are far less likely to leave open and stale. ADR-0007 said "revisit only if sharing is ever introduced"; that trigger has not been met, and this is a revisit under a different one — a change in write frequency, not in who is writing.
- **"Saving is destructive and has no undo."** Unchanged in substance and sharper in practice. Incremental saves mean more overwrites of a Prompt that has no history, and the moment where a User could still abandon an edit by navigating away without submitting is gone.

## Consequences

- **Prompt text and Variables must be saved as one unit.** `PATCH` validates the *merged* result, including placeholder/Variable set-equality, so the two fields are an atomic pair: adding `{{topic}}` to the text is invalid until `topic` is declared, and declaring `topic` is invalid until it is used. No ordering makes each step individually valid. Field-at-a-time autosave is therefore not implementable for these two — they commit together, or the save is held until the pair is consistent. The client already computes exactly this predicate in `variableMismatch()`, which becomes load-bearing rather than an optimization.
- **A Prompt is saved without the User asking.** Every prior mutation in this app was an explicit click. The Console introduces the first writes that happen as a side effect of typing, which is what makes the concurrency amendment above matter and what raises the cost of any validation gap.
- **`PATCH /api/prompts/{id}` exists before it has a caller.** It is committed with tests ahead of the Console consuming it. `PUT` remains the full-save path and keeps serving Create, Duplicate, and the Console's first iteration.
- **`PromptForm` survives with two consumers, Create and Duplicate.** Both create a Prompt that has no id yet, so neither can `PATCH` and neither wants in-place editing — the whole-form component remains the right shape for them. The Console owns a separate copy, which is the point: the two are diverging, not duplicating by accident.
- **Edit and Run are deleted only once the Console is a proven superset.** Until then all three coexist and the Console is knowingly redundant. Deleting earlier would leave the app's primary editing surface half-built.
- **The Console is a UI surface, not domain vocabulary.** It gets no `../CONTEXT.md` glossary entry; it names a page,
  not a concept the domain reasons about.
