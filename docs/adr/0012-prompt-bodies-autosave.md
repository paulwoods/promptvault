# Prompt bodies autosave; Details fields commit explicitly

> **Amended by [ADR-0013](0013-either-prompt-body-may-be-empty.md).** The decision stands — the bodies still autosave and the Details fields still commit explicitly. Its "a blank prompt text becomes a state the app must name" consequence is void: prompt text is optional too, blank autosaves for both bodies, the *Can't be empty* state is gone, and save status is four states again. Only a Prompt with *both* bodies blank cannot run.

The [Console](0008-prompt-console.md)'s two prompt bodies — a [Prompt](../CONTEXT.md#prompt)'s **prompt text** and its
**system prompt**, labelled *User Prompt* and *System Prompt* in the UI — save themselves as the User types: a `PATCH`
one second after typing stops, and at least every ten seconds under unbroken typing. Their per-field commit and revert
buttons are deleted. The Details fields keep the click-to-edit, explicit-commit behaviour ADR-0008 shipped, so the
Console carries **two save models on one surface**, deliberately.

Because a run reads the *stored* Prompt (ADR-0009), **Run now writes before it reads**: it cancels any pending
autosave, `PATCH`es, waits for the write to land, and only then streams. A failed write blocks the run.

This **amends [ADR-0008](0008-prompt-console.md)** and **[ADR-0007](0007-mutable-prompts-no-version-or-run-history.md)**.

We chose this because ADR-0008 already described autosave and then could not build it. Its stated consequence — *"A
Prompt is saved without the User asking … the first writes that happen as a side effect of typing"* — describes this
ADR, not what shipped: the Console shipped an explicit ✓ click per field, which is a smaller Save button, not the
absence of one. The reason is recorded in the same ADR: prompt text and Variables validated as an atomic pair, *"no
ordering makes each step individually valid,"* so *"field-at-a-time autosave is therefore not implementable for these
two."* [ADR-0009](0009-remove-variables.md) deleted Variables and with them the set-equality gate. The blocker is gone,
and this ADR spends the freedom on the two fields that earn it — the ones a User iterates on in the edit → run → read
loop that ADR-0008 exists to shorten.

## Considered options

- **Keep the per-field ✓ (status quo)** — a commit gesture per body, already built and tested. But it leaves the User
  responsible for remembering to save before every run, and the failure is silent: the run streams confidently against
  the previous text. Rejected because the surface whose entire purpose is a tight edit-run loop is the worst place to
  put a step the User must remember.
- **One explicit Save for the whole Console** — deliberate, familiar, and it restores the abandon-an-edit affordance
  ADR-0008 gave up. Rejected because it reverses ADR-0008's central decision for every field rather than the two under
  discussion, and it does not fix the stale-run trap — it relocates it to a bigger button.
- **Save only as part of Run** — the edit-run loop becomes one gesture and nothing is written while merely thinking.
  Rejected because editing without running is ordinary (drafting, tidying, renaming a placeholder) and would be lost on
  navigation, and because Run silently mutating the Prompt is the same surprise as below with none of the compensating
  safety.
- **Autosave the bodies, explicit commit for Details (chosen)** — the largest behavioural change and the only one that
  makes what runs always equal what is on screen. Pays for it with an inconsistency the Consequences name.

## What this amends in ADR-0008

- **"Fields are edited in place and saved incrementally rather than through a whole-form Save button."** Stands, and is
  reached for the first time. The ✓-per-field Console was an intermediate state, not the destination.
- **"Prompt text and Variables must be saved as one unit … Field-at-a-time autosave is therefore not implementable for
  these two."** Already void via ADR-0009, which removed Variables and `variableMismatch()`. Recorded here because it
  is the constraint that kept autosave unbuilt, and its removal is why this ADR is possible.
- **"A Prompt is saved without the User asking."** Now literally true for the two bodies, and deliberately *not* true
  for the Details fields. ADR-0008 did not anticipate the split; it is this ADR's genuinely new decision.
- **"Concurrent edits are last-write-wins, silently."** Stands, and gets likelier again. ADR-0008 reasoned about writes
  becoming *frequent and incidental*; a debounce makes them more so. `PATCH` still narrows each clobber to the one
  field that tab touched, which remains the reason this is accepted rather than escalated to optimistic locking.

## What this amends in ADR-0007

- **"Saving is destructive and has no undo."** Unchanged in substance, sharper again. ADR-0008 removed the moment where
  a User could abandon an edit by navigating away without submitting; this ADR removes the revert button that replaced
  it. Emptying a prompt body and waiting ten seconds destroys it, and there is no history to recover it from. The only
  undo is the editor's own `Ctrl+Z`, which is why the markdown editor must stay mounted for the life of the Console
  rather than being unmounted on every tab switch.

## Consequences

- **Run writes to the database before it runs.** A button labelled *Run* now has a mutation as a precondition, and a
  failed `PATCH` aborts it. This is surprising, and it is the price of `streamRun` sending only a `promptId` — the
  backend reads the stored Prompt, so the only way to guarantee the output matches the screen is to make the screen the
  stored Prompt first. Duplicate flushes the same way, for the same reason: it copies from the query cache and would
  otherwise silently duplicate the previous text. *(Widened by Phase 21: the flush covers all eight fields, not
  the two bodies alone — an open Model or Max tokens editor used to stream the previous value with no indication. A
  failed flush now names the field it failed on, since six of the eight can be behind a closed tab.)*
- **The Console has two save models, and a reader will trip over it.** The bodies save themselves; Name, Description,
  Model, Max tokens, Effort and Thinking are clicked, edited and committed. The line is *content you iterate on* versus
  *settings you set once*, and it is a judgement, not a rule the code can enforce.
- **A blank prompt text becomes a state the app must name.** `promptText` is `@NotBlank`, so an empty body can never be
  saved; the save is held rather than sent to be rejected, and Run is blocked, because a flush that writes nothing would
  let Run fall through to the previous stored text. `systemPrompt` has no such rule — blank is how it is cleared — so
  the two bodies behave differently at empty. Save status therefore has five states: *Saved*, *Saving…*, *Unsaved
  changes*, *Can't be empty*, *Couldn't save*. ***Superseded by [ADR-0013](0013-either-prompt-body-may-be-empty.md):***
  prompt text is optional too, blank autosaves for both bodies, the *Can't be empty* state is gone, and only a
  both-blank Prompt cannot run.
- **Failure is visible and inert.** A failed autosave is reported and not retried. The next keystroke restarts the
  debounce and Run flushes, so the ordinary paths recover; walking away from a failure loses the work. Automatic retry
  was rejected because a `400` can never succeed and a give-up rule is another decision.
- **The editors stay mounted for the life of the Console.** Tab switching hides them rather than unmounting them, so
  `Ctrl+Z` — now the only undo — survives a trip to Details. This costs an explicit `codemirror.refresh()` when a hidden
  editor is revealed; EasyMDE's `autoRefresh` option does not cover it, as the addon arms once and stops listening the
  first time it fires.
- **`beforeunload` is the app's first browser dialog.** Closing or reloading the tab warns when any Console field has
  uncommitted work — the bodies *and* an open Details editor, one rule rather than two. In-app navigation is not
  guarded, so abandoning a Details edit by navigating away still works exactly as it did.
- **Leaving the Console writes the bodies and discards the Details drafts, and the asymmetry is deliberate.** In-app
  navigation is unguarded (above), so unmount is the last chance to write anything pending. A body is flushed there
  because it has no discard gesture *precisely because* it is always live — its undo is the editor's own `Ctrl+Z`, and
  nothing else would ever write what was typed. A Details field's discard gesture *is* leaving: clicking away to
  abandon an uncommitted edit is a thing users rely on, and flushing all eight on unmount would turn backing out into a
  silent save with no undo. Hence two verbs on the flush seam — `flush` for Run, Duplicate and any other reader of the
  stored Prompt, `flushOnLeave` for unmount — named so that calling the wrong one at the unmount site reads as a
  mistake.
- **The content-vs-settings split is unchanged.** Phase 21 sharpened *when* a settings field is written, not whether it
  autosaves: no field started saving itself as a side effect. Making the six live would supersede this ADR and would
  still not remove the flush — an autosave is debounced, so a pending window exists either way. It would change how
  many fields can be pending, not whether pending is possible. `PATCH` still narrows each clobber to the fields a tab
  actually touched (ADR-0008).
- **A field that cannot be sent blocks the Run, and the seam says which.** Clearing the Name leaves a field that is
  uncommitted *and* unsendable, which no flush can reconcile; running would use the stored name while the screen shows
  nothing. Blocking with the reason on the button is the rule the Console already teaches for a both-blank Prompt
  (ADR-0013), applied to one more case, with precedence between them owned by the seam — the only thing holding all
  eight fields.
- **Writes are cheap, and that is load-bearing.** `['prompts', q]` is queried only by the prompt list, which is
  unmounted while the Console is open, so each save's list invalidation marks stale without refetching. The cost of a
  save is one `PATCH`. Overlapping saves need an ordering guard, since each success writes
  `setQueryData(['prompt', id])` and a slow earlier response would otherwise overwrite a newer one.
- **This is a UI-surface change, not domain vocabulary.** Like the Console itself (ADR-0008) and its consolidation
  (ADR-0010), it gets no `../CONTEXT.md` glossary entry. *Prompt text* and *system prompt* already exist there; when a
  Prompt is written is not something the domain reasons about.
