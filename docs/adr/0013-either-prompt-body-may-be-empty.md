# Either prompt body may be empty; both-blank is saveable but not runnable

A [Prompt](../CONTEXT.md#prompt)'s two bodies — its **prompt text** and its **system prompt** — may each be empty,
independently. Empty is stored as `null`, a blank save normalizes to it, and clearing a body is an ordinary autosave
rather than a held edit. A Prompt with *neither* body filled is still saveable — it is a draft — but is not runnable:
the backend refuses the run with a `400`, and the Console disables Run with the reason on the button.

A run with a system prompt but no prompt text is legal, so it must reach the API — but the Messages API rejects an
empty text block and requires at least one message. The mapper therefore sends a **single period** as the user message in
that case: the least-said thing the API will accept.

> **Corrected 2026-08-29.** This decision originally sent a **single space**, on the premise that a space was the
> least-said thing the API would accept. That premise was wrong: the Messages API rejects a text block that is
> whitespace-only exactly as it rejects an empty one, with `400 invalid_request_error` — *"text content blocks must
> contain non-whitespace text"*. Every run of a Prompt with no prompt text therefore failed, surfacing to the User as
> the uncategorized *"Claude request failed"* (a 400 maps to `ErrorCategory.OTHER`). The substitute must contain
> non-whitespace, which makes the *"visible placeholder text"* option below — rejected at the time as steering the
> model — the only one of the considered options that works. It is now the decision. New Prompts begin with both bodies empty.

This **amends [ADR-0012](0012-prompt-bodies-autosave.md)**, whose consequences pinned the asymmetry this removes.

We chose this because the `@NotBlank` on prompt text predates ADR-0012 — no ADR ever argued it; ADR-0012 designed
*around* it with the held blank save, the *Can't be empty* status, and the blocked run. The rule bought safety against
one failure — a run that sends nothing — but charged for it everywhere: the two bodies behaved differently at empty, an
empty user prompt could not even be stored, and the UI carried a mechanism (hold the save, name the state, block the
run) that existed solely for it. The only thing genuinely unsafe was running on two empties, so that is now the only
thing forbidden.

## Considered options

- **Keep prompt text required (status quo)** — the run can never send nothing, at the cost of the asymmetry above and
  of making an empty draft unstorable. Rejected because the safety lives at the wrong gate: the dangerous end of an
  empty body is a *run*, not a *save*.
- **Forbid both-blank at save time** — a cross-field rule ("at least one body must be filled") enforced on every
  write. Rejected because saving a draft with nothing in it yet is harmless and ordinary — a new Prompt starts exactly
  there — and because the rule would need its own error surface, while the one gate that must actually be safe (Run)
  enforces the same condition without one.
- **Omit the user message when the prompt text is empty** — impossible: the Messages API requires at least one
  message.
- **Send visible placeholder text instead of a space** — `'.'` or `'(empty)'` is more honest on the wire but steers
  the model more than a space does. Rejected on that difference — **and later adopted** (see the correction above),
  since a space is not something the API accepts at all. `'.'` is the least steering text that clears the
  non-whitespace bar.

## Consequences

- **The two bodies are symmetric at empty.** Blank-to-null normalization applies to both; both clear via a blank save;
  the *Can't be empty* status and the hold-a-blank-save mechanism are gone, and save status is back to four states —
  *Saved*, *Saving…*, *Unsaved changes*, *Couldn't save*.
- **Running gains the validation the saving lost.** A Prompt with neither body filled gets a `400`
  (`promptText`: "A run needs a prompt text or a system prompt") from `RunService` before anything streams — reachable
  from the API in the small, and from the Console not at all, since the run button is disabled (with the reason on it)
  while both drafts are blank. The check is defence in depth against API callers, not the UI's plan A.
- **The mapper speaks for the absent prompt text.** The single-period substitution lives only in `ClaudeRequestMapper`,
  commented with why it exists; everywhere else empty stays `null` and means *nothing was written*. ADR-0009's "sent
  verbatim" contract survives: what a body holds is what the wire carries, and a body holding nothing is the one
  declared exception.
- **Clearing a body is destructive-by-autosave.** ADR-0012 already made emptying a prompt body irrecoverable; that now
  extends to clearing the *last* filled body, which writes the un-runnable draft rather than being held. The editor's
  own `Ctrl+Z` remains the only undo.
- **New Prompt starts empty.** Both bodies are blank on creation, so a brand-new Prompt is the canonical draft state:
  saveable immediately, runnable once either body has something in it.
