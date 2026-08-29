# Prompt Vault — Context & Glossary

The shared, implementation-free vocabulary for Prompt Vault. Use these names in code, comments, API, and commits.

## Glossary

### User
An account holder. Every [Prompt](#prompt) is owned by exactly one User. A User can only see and act on their own Prompts; authorization is enforced on every endpoint. A User proves who they are with one or more [Login Methods](#login-method), and always holds at least one. Each User supplies their own **Anthropic API key**, which is stored encrypted at rest, never returned to the client, and used whenever that User runs a Prompt — so cost is attributed per User.

### Login Method
A way a [User](#user) proves they are themselves: a **password** they chose, or a **Google account** they own. A User holds at least one and may hold both; either one alone grants full access to the same User — they are alternative doors into one account, not separate accounts.

A Google account is recognised by Google's own permanent identifier for it, never by the email address it currently carries; that email is a label, and it may change at Google without changing whose account it is. When a Google account whose email Google has **verified** matches an existing User's email, that Google account becomes an additional Login Method on that User rather than the start of a new one.

### Prompt
Something a User maintains and runs. A Prompt carries all of its own content: a name, an optional description, the **prompt text**, and its [Run Settings](#run-settings). A Prompt is **mutable** — saving an edit overwrites what was there, and the previous content is not recoverable. It records when it was created and when it was last updated; lists show the most recently updated first.

A Prompt can be **run** against Claude: a single **one-shot** (single-turn) execution in which the prompt text is sent as the user message **verbatim** and Claude's response streams back to the browser as it is generated. A run is not stored — no inputs, no response, no history. The only trace a run leaves is its contribution to the User's token totals. A Prompt can be moved to [Trash](#trash) and restored.

### Run Settings
The Claude parameters on a [Prompt](#prompt) that govern **how** it is run, as distinct from *what* is sent: **model** (one of the supported Claude model IDs), an optional **system prompt**, **max tokens**, **effort** (`low` / `medium` / `high`, with `xhigh` / `max` also accepted by the widest-capability models), and **thinking** (`off` / `adaptive`). There is deliberately no temperature — the current default models reject it. Not every setting applies to every model: `effort` and `adaptive` thinking are supported only by some models, so a Prompt may not select a capability its model lacks; the supported combinations are described by a model→capabilities map the app maintains. One model always thinks regardless of the stored setting, so both stored values stay legal for it while the run sends its required form. The system prompt is distinct from the Prompt's prompt text: the prompt text is sent as the user message, while the system prompt is sent separately.

### Trash
The holding state for a deleted [Prompt](#prompt). Deletion is soft: a deleted Prompt disappears from every normal view until it is **restored**. There is no permanent-delete action anywhere, and Trash holds a Prompt indefinitely. Trash protects against deleting a Prompt by accident; it does **not** protect the Prompt's content, which an ordinary save can overwrite irrecoverably at any time.
