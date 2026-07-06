# Prompt Vault — Context & Glossary

The shared, implementation-free vocabulary for Prompt Vault. Use these names in code, comments, API, and commits.

## Glossary

### User
An account holder. Every [Prompt](#prompt) (and therefore its [Versions](#version)) and every [Run](#run) is owned by exactly one User. A User can only see and act on their own Prompts and Runs; authorization is enforced on every endpoint. Each User supplies their own **Anthropic API key**, which is stored encrypted at rest, never returned to the client, and used for that User's [Runs](#run) — so cost is attributed per User.

### Prompt
The stable identity for something a user maintains over time. A Prompt carries **no editable fields of its own** — it is purely an identifier plus an ordered history of one or more [Versions](#version). All meaningful content lives on the Versions. A Prompt is referred to in lists by the name of its *current* (latest) Version. A Prompt can be moved to [Trash](#trash) and restored; this is the only way a Prompt's visibility changes, and it never touches the immutability of its Versions or Runs.

### Version
An immutable snapshot identified by an integer that starts at **1** and increments by one per save. A Version freezes **everything**: name, description, the prompt text, and the [Run Settings](#run-settings). Once created, a Version never changes. Any edit — including a rename — appends a new Version rather than mutating an existing one. Any historical Version can be viewed and [run](#run). The newest Version is the *current* (latest) Version.

### Run
A single **one-shot** (single-turn) execution of a specific [Version](#version) against Claude — one rendered prompt produces one response, with no follow-up turns. A Run is **persisted** (run history) and records: the Version it ran, the [Variable](#variable) values supplied, the rendered prompt actually sent, Claude's response, the model used, token usage, a timestamp, and a status. Runs are browsable per Prompt/Version, enabling output comparison across Versions.

### Run Settings
The Claude parameters frozen into a Version that make a [Run](#run) reproducible: **model** (one of the supported Claude model IDs), an optional **system prompt**, **max tokens**, **effort** (`low` / `medium` / `high`), and **thinking** (`off` / `adaptive`). There is deliberately no temperature — the current default models reject it. Not every setting applies to every model: `effort` and `adaptive` thinking are supported only by some models, so a Version may not select a capability its model lacks; the supported combinations are described by a model→capabilities map the app maintains. The system prompt is distinct from the Version's prompt text: the prompt text (with [Variables](#variable) substituted) is sent as the user message, while the system prompt is sent separately.

### Variable
A named, **explicitly declared** input on a Version. Each Variable has a name, a description, a `required` flag, and an optional default value. The prompt text references Variables by name as `{{name}}` placeholders. At [run](#run) time the user supplies a value for each Variable (defaults pre-fill); values are substituted into the text before it is sent to Claude. Because the declared list and the `{{...}}` in the text are separate, saving a Version is **strictly validated**: the set of `{{placeholders}}` in the text must match the set of declared Variable names *exactly* — every placeholder must be declared, and every declared Variable must be used. Mismatches reject the save.

### Trash
The holding state for a deleted [Prompt](#prompt). Deletion is soft and applies only at the whole-Prompt grain — never to an individual Version or Run, both of which stay permanently immutable and undeletable. A deleted Prompt, together with everything under it (its Versions and Runs), disappears from every normal view until it is **restored**; there is no permanent-delete action anywhere, and Trash holds a Prompt indefinitely.

### Activity
A [User](#user)'s own account history: an append-only record of every mutation plus login — registration, logins, API-key sets, name changes, Prompt creates/deletes/restores, Version saves, and [Run](#run) starts — shown newest-first on the Profile page. Each event freezes its type, timestamp, and a display label (e.g. the Prompt's name at event time); it is written in the same transaction as the action it describes, is never edited or purged, and stays visible even when the Prompt it references is in [Trash](#trash). Activity records only *what* happened and *when* — never where from or on what device — and is visible only to the owning User.
