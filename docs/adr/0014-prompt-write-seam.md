# One write seam for the Prompt: POST creates, PATCH changes

A [Prompt](../CONTEXT.md#prompt) has exactly two mutating doors. `POST /api/prompts` creates one from a complete body;
`PATCH /api/prompts/{id}` changes one, laying the supplied fields over what is stored. There is no `PUT` — the
full-save door is retired, along with the `PromptService.updatePrompt` behind it.

Both doors validate the same way, in the same place, once. The service's mechanical pass runs Bean Validation over a
*complete* Prompt — the create body, or a patch merged onto the stored content — and reports **every** violation it
finds in one `details` map. `@Valid` no longer appears on a Prompt controller argument.

We chose this because `PUT` had no caller. The Console writes through `PATCH` (ADR-0012) and Create and Duplicate
write through `POST`; the endpoint survived only as a convenience in five test fixtures, which is not a reason for an
endpoint to exist. Keeping it meant a second write path that nothing exercised in anger, validated by a different
mechanism from the one every real write crossed, and free to drift from it.

## Considered options

- **Keep `PUT` for symmetry** — a full-save verb reads naturally beside a partial-save one. Rejected: the symmetry is
  the whole cost. Two doors into the same overwrite means two validation entry points and two chances to diverge, paid
  for by an endpoint no client calls.
- **Unify validation downward — one violation, always.** Make `POST` report a single field the way the merged pass
  did. Rejected because it moves user-facing behaviour backwards: break two fields in one write and you are told about
  one of them, fix it, and are told about the next.
- **Collect in the domain validators too.** Rejected. `RunSettingsValidator` is sequential by necessity — effort
  cannot be judged until the model is known to be real, and adaptive thinking not until that model's capabilities are
  in hand. Reporting "unsupported model `x`" *and* "invalid effort for model `x`" states one fact twice.
- **Keep `PUT` but delete `updatePrompt`** — impossible, and the wrong half: a service method kept alive only for the
  test suite is the same smell as the endpoint.

## Consequences

- **The full-save *shape* survives.** `PromptRequest` is still the create body and still the merge target a patch is
  laid over. This retires a door, not the idea of a complete Prompt.
- **Validation cardinality changed; the envelope did not.** Both mechanisms always produced
  `{error: "validation_error", message: "Validation failed", details: {field: message}}`, and the frontend already
  joins however many entries it finds. What changed is how many entries a mechanical failure can carry. No frontend
  change was needed.
- **`DomainValidationException` carries a map.** The single-field constructor remains and every existing caller —
  `RunSettingsValidator`, `RunService` — is untouched and still fail-fast. Only the mechanical pass throws the
  multi-field form.
- **The lowest-property-path tiebreaker is gone.** It existed to make a one-error report deterministic; with every
  violation reported there is nothing left to tiebreak. Details are ordered by property path so the body is stable.
- **An unsupported verb is now a client error, not a server one.** Retiring `PUT` made "live path, wrong method"
  reachable, and the catch-all was rendering it as a `500`. `GlobalExceptionHandler` maps
  `HttpRequestMethodNotSupportedException` to a `405` in the envelope.
- **Concurrency reasoning is unchanged.** ADR-0012's last-write-wins analysis is about `PATCH` and stands as written;
  `PATCH` still narrows each clobber to the fields a tab actually touched (ADR-0008).

This **amends [ADR-0008](0008-prompt-console.md)**, whose consequence *"`PUT` remains the full-save path and keeps
serving Create, Duplicate, and the Console's first iteration"* has expired — Create and Duplicate go through `POST`,
and the Console's first iteration is long past. The decision that consequence hung off is otherwise intact.
