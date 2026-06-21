# Runs stream over SSE with an explicit lifecycle

A [Run](../../CONTEXT.md#run) delivers Claude's response to the browser incrementally via Server-Sent Events rather than a single blocking JSON response. The backend streams Claude's tokens as they arrive and persists the complete Run once the stream finishes. Consequently a Run carries an explicit lifecycle — in-progress → completed / failed — rather than existing only as a finished record. We chose this for responsiveness on long generations, accepting the extra plumbing on both Spring (SSE endpoint, partial-state handling) and React (consuming the stream, rendering partial output).

## Considered options

- **Blocking JSON call** — POST a run, wait, return the full response. Dead simple on both ends, but the user stares at a spinner for the whole generation.
- **SSE streaming (chosen)** — incremental delivery; better UX for long outputs.

## Consequences

- The Run model needs a status (at least: in-progress, completed, failed); a Run can be observed before it is complete.
- A dropped connection mid-stream must be handled — decide whether the persisted Run still completes server-side or is marked failed.
- The export/read API for run history is separate from the streaming endpoint.
