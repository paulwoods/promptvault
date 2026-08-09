# Prompt Vault — Context & Glossary

The shared, implementation-free vocabulary for Prompt Vault. Use these names in code, comments, API, and commits.

## Glossary

### User
An account holder. Every [Prompt](#prompt) is owned by exactly one User. A User can only see and act on their own Prompts; authorization is enforced on every endpoint. Each User supplies their own **Anthropic API key**, which is stored encrypted at rest, never returned to the client, and used whenever that User runs a Prompt — so cost is attributed per User.

### Prompt
Something a User maintains and runs. A Prompt carries all of its own content: a name, an optional description, the **prompt text**, its declared [Variables](#variable), and its [Run Settings](#run-settings). A Prompt is **mutable** — saving an edit overwrites what was there, and the previous content is not recoverable. It records when it was created and when it was last updated; lists show the most recently updated first.

A Prompt can be **run** against Claude: a single **one-shot** (single-turn) execution in which the prompt text, with [Variable](#variable) values substituted, is sent as the user message and Claude's response streams back to the browser as it is generated. A run is not stored — no inputs, no response, no history. The only trace a run leaves is its contribution to the User's token totals. A Prompt can be moved to [Trash](#trash) and restored.

### Run Settings
The Claude parameters on a [Prompt](#prompt) that govern **how** it is run, as distinct from *what* is sent: **model** (one of the supported Claude model IDs), an optional **system prompt**, **max tokens**, **effort** (`low` / `medium` / `high`), and **thinking** (`off` / `adaptive`). There is deliberately no temperature — the current default models reject it. Not every setting applies to every model: `effort` and `adaptive` thinking are supported only by some models, so a Prompt may not select a capability its model lacks; the supported combinations are described by a model→capabilities map the app maintains. The system prompt is distinct from the Prompt's prompt text: the prompt text (with [Variables](#variable) substituted) is sent as the user message, while the system prompt is sent separately.

### Variable
A named, **explicitly declared** input on a [Prompt](#prompt). Each Variable has a name, a description, a `required` flag, and an optional default value. The prompt text references Variables by name as `{{name}}` placeholders. At run time the User supplies a value for each Variable (defaults pre-fill); values are substituted into the text before it is sent to Claude. Because the declared list and the `{{...}}` in the text are separate, saving a Prompt is **strictly validated**: the set of `{{placeholders}}` in the text must match the set of declared Variable names *exactly* — every placeholder must be declared, and every declared Variable must be used. Mismatches reject the save.

### Trash
The holding state for a deleted [Prompt](#prompt). Deletion is soft: a deleted Prompt disappears from every normal view until it is **restored**. There is no permanent-delete action anywhere, and Trash holds a Prompt indefinitely. Trash protects against deleting a Prompt by accident; it does **not** protect the Prompt's content, which an ordinary save can overwrite irrecoverably at any time.
