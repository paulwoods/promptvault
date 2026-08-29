# The run's client stays two files in `lib/`, not a `lib/run/` folder

The frontend's [Run](../CONTEXT.md#run) lives in `frontend/src/lib/streamRun.ts` — the transport, the SSE frame
parser, and the failure vocabulary — and `frontend/src/lib/useRunStream.ts` — the React lifecycle: one run at a
time, Stop, the unmount abort, and the status a page renders. They stay two sibling files. There is no `lib/run/`
folder and no barrel file.

`useRunStream.ts` is the module's front door: it re-exports `RunFailure` and `RunFailureCategory`, so a page takes
the hook and the failure vocabulary from one path and never imports `streamRun.ts` at all.

We chose this because the collapse was made conditional on a reason, and the reason did not appear. An architecture
review had drawn the run as three leaky fragments; by the time this was revisited, `streamRun` already owned the
abort signal, the malformed-frame skip and the CRLF carriage hold, and shared one `clearAndAnnounceUnauthorized()`
with the JSON client. The remaining defects — a stream closing without a terminal frame, a lib hook that knew a
route, a parsed-and-discarded failure category — were each fixed without moving a file. The injected transport that
was expected to force the question was added as an exported type and a default in the file that already made the
request, creating no third file and no folder-shaped pressure.

## Considered options

- **Move both into `lib/run/` with an `index.ts`.** The honest case for it: the Console briefly imported the failure
  type from `streamRun` and the hook from `useRunStream`, two paths for one concept. Rejected because the
  re-export fixes that in one line, and because every other module in `lib/` is a single flat file — a lone folder
  would say "this one is bigger than the rest" about a module that is 200 lines.
- **Collapse to a single `run.ts`.** Rejected: the two halves have different test shapes. The parser is exercised
  against a canned `Response` with no React and no mock server; the lifecycle is exercised through `renderHook`.
  One file would not change that and would only make the seam between them implicit.
- **Move the transport into its own file to force the folder.** Rejected as building the reason rather than finding
  it. A file created so a folder can exist is the diagram drawing the code.

## Consequences

- **Pages import `useRunStream` only.** `RunFailure` and `RunFailureCategory` are re-exported from it. Reaching into
  `streamRun.ts` from outside `lib/` is now the visible smell it should be.
- **The decision is revisitable on evidence, not taste.** A third file that genuinely belongs to the run — a second
  transport, a reconnect policy, run-level retry state — is the trigger to look again. Note that ADR-0007's one-shot
  constraint makes most of those unlikely: there is no Run id, no persistence and no reconnection.
- **Nothing moved, so nothing to re-point.** No import paths changed for existing callers, and the test files stay
  beside the sources they cover.
