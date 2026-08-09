# Console absorbs View and Duplicate — the sole prompt surface

A [Prompt](../CONTEXT.md#prompt) has one surface now: the [Console](0008-prompt-console.md). The View and Duplicate pages
that ADR-0008 left as separate tabs are gone — View because the Console already shows the live prompt inline, and
Duplicate because it is a single action with no form of its own. The last Edit page, the shared `PromptForm`, and the
`PromptTabs` nav went with them in the same consolidation, so the Console is the only prompt route that renders. Create is
a one-click action that opens a fresh Console; Duplicate is a button in the Console's Details section that POSTs a copy
and navigates to the new prompt's Console.

This **amends [ADR-0008](0008-prompt-console.md)**, whose stated end-state was "three tabs: View / Console / Duplicate."
That end-state never shipped. ADR-0008 began the collapse by deleting the Run page (and ADR-0009 finished removing it);
this ADR takes the collapse to its conclusion by deleting View and Duplicate-as-a-page, leaving one surface.

We chose this because the surviving tabs were both redundant once the Console existed. A separate View page shows exactly
what the Console already shows — the prompt's current content — only without the ability to act on it, so it forced a
navigation to a strictly less capable surface. Duplicate is a one-shot action (copy a Prompt's fields into a new one) with
no editing surface of its own; making it a tab meant a page whose entire job was forwarding to a create form. A button in
the Console's Details section does that job without a route, and `PromptForm` — which existed to serve a Create/Duplicate
page that no longer exists — is deleted rather than maintained for a single consumer that has become a one-click action.

## Considered options

- **Keep View and Duplicate as tabs (ADR-0008's stated end-state)** — leaves two surfaces whose jobs the Console already
  does. View is a read-only copy of the Console; Duplicate is a page that forwards to Create. Two surfaces that duplicate
  the Console is the same failure mode ADR-0008 rejected when it deleted Edit and Run.
- **Absorb View, keep Duplicate as a page** — half-measure. View is the more clearly redundant of the two, but keeping
  Duplicate as a tab preserves a one-action page for no reason, and leaves the tab count at two rather than one.
- **Absorb both (chosen)** — one surface. The Console is the only prompt route that renders.

## What this amends in ADR-0008

- **"collapsing the Prompt tabs from five to three (View / Console / Duplicate)."** The end-state is one surface, not
  three. View and Duplicate are deleted as pages; the Console is the sole prompt surface. ADR-0008's direction — one
  editing surface — stands and is taken to its conclusion.
- **"`PromptForm` survives with two consumers, Create and Duplicate."** Void. `PromptForm` is deleted. Create is a
  one-click "new prompt → Console" action with no form, and Duplicate is a Console button that POSTs a copy. There is no
  form component to share between them.
- **"Edit and Run are deleted only once the Console is a proven superset."** Done — and View and Duplicate went with them
  in the same consolidation, so the "proven superset" caution no longer leaves anything coexisting.

## Consequences

- **The Console is the only prompt route that renders.** `/prompts/:id`, `/prompts/:id/edit`, and
  `/prompts/:id/duplicate` redirect to `/prompts/:id/console`. There is no View page, no Edit page, and no Duplicate page.
- **Duplicate is a button, not a page.** It lives in the Console's Details section, POSTs a new prompt copying the
  current one's fields, and navigates to the new prompt's Console. It has no route and no dedicated component.
- **Create skips the form.** "New Prompt" POSTs a default prompt and opens its Console; the first editing happens inline
  in the Console, the same surface every other edit uses.
- **The tab count falls from three to one.** ADR-0008's "five to three" is replaced by "five to one": Edit and Run were
  deleted by ADR-0008 (and the Run page by ADR-0009); View and Duplicate-as-a-page are deleted here.
- **This is a UI-surface change, not domain vocabulary.** Like the Console itself (ADR-0008), it gets no
  `../CONTEXT.md` glossary entry; it names a page, not a concept the domain reasons about.