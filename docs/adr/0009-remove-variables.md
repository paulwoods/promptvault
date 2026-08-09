# Remove Variables from Prompts

A [Prompt](../CONTEXT.md#prompt) no longer has declared Variables. The `variables` column, the declaration
UI, the run-time value form, and the `{{name}}` substitution that tied them together are all removed. A Prompt's text is
sent to Claude **verbatim** as the user message, with nothing interpolated. Running a Prompt takes no request body and
collects no per-run values; the Console's Run pane is the only run surface.

This **amends [ADR-0007](0007-mutable-prompts-no-version-or-run-history.md)**, which listed Variables among a Prompt's
content, and **amends [ADR-0008](0008-prompt-console.md)**, whose "Prompt text and Variables must be saved as one unit"
consequence is void (there is no declaration list for the text to agree with).

The old contract was strict: the set of `{{placeholders}}` in the text had to match the set of declared Variable names
*exactly* — every placeholder declared, every declared Variable used — enforced at save time by a `PlaceholderValidator`
on the server and a `variableMismatch()` predicate on the client. We removed it because the coupling was the cost, not
the feature. Variables demanded a declaration editor, a separate run page to fill values in, a save-time validator, a
client-side mirror of that validator, and a default/required model — a whole sub-system whose only job was to interpolate
strings into the text before sending it to Claude. For a personal prompt-iteration tool the payoff did not justify the
surface: the User can write the value they want directly in the text, and the strict match turned ordinary `{{...}}`
content (asking Claude about template syntax, pasting an example) into a save error.

## Considered options

- **Drop the declaration list, keep free-form `{{...}}` substitution** — no declarations and no save-time validation, but
  `{{name}}` is still substituted at run time from an ad-hoc key/value form the User fills in each run. Rejected: it
  leaves a templating half-feature that is harder to explain than either the old design or no variables at all, and the
  run-time value form (the thing being deleted) survives.
- **Keep declarations, drop only the strict match** — Variables stay as declared inputs, but the text no longer has to
  reference them. Rejected: this is a relaxation, not a removal. It keeps the declaration editor and the run-time value
  form while removing the one property (declared ⇄ used) that gave the list a reason to exist.
- **Remove Variables outright (chosen)** — largest one-time cost, smallest steady state. The prompt text becomes a
  plain string with no machinery around it.

## What this amends in earlier ADRs

- **ADR-0007 (mutable Prompts)** — a Prompt's content is now name, description, prompt text, and Run Settings; Variables
  are no longer part of it. The "saving is destructive" and "last-write-wins" consequences stand unchanged.
- **ADR-0008 (Console)** — the "Prompt text and Variables must be saved as one unit" consequence is void. There is no
  declaration list, so there is no set-equality to validate, no atomic pair, and no `variableMismatch()` predicate.
  Field-at-a-time `PATCH` is now implementable for the prompt text the same as every other field. The separate Run page
  that ADR-0008 left in place is deleted: its only remaining job was collecting per-run Variable values, and with no
  Variables the Console's click-to-run pane is the single run surface and the only one that ever makes a run deliberate.

## Consequences

- **The prompt text is a verbatim user message.** `{{anything}}` is ordinary text sent to Claude as-is. There is no
  detection, no validation, and no warning for `{{...}}` anywhere: reintroducing one would rebuild the coupling this
  decision removed, and `{{...}}` is legitimately valid content a User may want to send.
- **Existing Prompts keep their `{{...}}` literals.** The migration drops the `variables` column only; it does not
  rewrite `prompt_text` (ADR-0007's rule that only an explicit save mutates content holds even in the migration). A
  leftover `{{name}}` produces one odd response on the next run; the User sees it and fixes it with a normal edit —
  the same low-stakes, self-correcting loop the run is.
- **The migration is irreversible.** V11 drops the `variables` `jsonb` column; Flyway has no down-path, and the declared
  Variable metadata on every Prompt is destroyed when it runs. The declarations were never more than interpolation
  inputs, so no content is lost — only the `{{...}}` in the text remains, which the migration deliberately leaves alone.
- **The run endpoint takes no body.** `POST /api/prompts/{id}/run` runs the Prompt as stored; there are no values to
  supply and no `RunRequest`. `RunPreparer` is removed and the trivial Prompt→`ClaudeRequest` mapping moves inline into
  `RunService`, which resolves the Prompt, builds the request, and streams — it owns no persistent state, as ADR-0007
  already required.
- **`PlaceholderValidator`, `VariableValidator`, and `VariableDeclaration` are removed as orphans**, along with the
  `RunForm` and `RunPage` UI and their tests.