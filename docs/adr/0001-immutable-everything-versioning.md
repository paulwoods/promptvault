# Fully-immutable, everything-versioned Prompts

A [Prompt](../../CONTEXT.md#prompt) carries no editable fields of its own — it is pure identity plus an append-only history of immutable [Versions](../../CONTEXT.md#version). Each Version freezes *everything* (name, description, prompt text, declared Variables, and Run Settings) under an integer that starts at 1; any edit, including a rename, appends a new Version rather than mutating an existing one. We chose this for maximum reproducibility: any historical Version can be viewed and run exactly as it was, and a stored [Run](../../CONTEXT.md#run) always points at the precise inputs that produced it.

## Considered options

- **Mutable current row + version counter** — overwrite the text, bump an integer. Simpler, but loses old text and the ability to view/run prior versions.
- **Immutable text only; name/description/tags mutable on the Prompt** — the common middle ground.
- **Everything versioned (chosen)** — strongest reproducibility.

## Consequences

- Renaming a Prompt creates a new Version. This is accepted, not a bug.
- A Prompt has no mutable columns, so lists must show each Prompt by its *current* (latest) Version's name.
- The `version` table is append-only and grows monotonically; there is no in-place update path for Version content.
