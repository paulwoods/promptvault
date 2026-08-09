# Per-user, reversibly-encrypted Anthropic API keys

Each [User](../../CONTEXT.md#user) supplies their own Anthropic API key, which is used whenever that User [runs a Prompt](../../CONTEXT.md#prompt) so cost is attributed per User and one User cannot drain another's quota. Because the key must be sent to Claude at run time it cannot be hashed like a password — it is stored **reversibly encrypted** with AES-256-GCM, where the master encryption key comes from an environment variable / secret (`PROMPTVAULT_ENC_KEY`) and never lives in the database or the repository. The database stores only the IV, ciphertext, and auth tag; the plaintext key is never returned to the client.

## Considered options

- **Single shared server key** — simplest, but the operator pays for everyone and any User can spend the shared budget.
- **External secrets manager (Vault / AWS Secrets Manager)** — strongest isolation and rotation, but adds an external dependency and setup we don't want for v1.
- **DB-native (pgcrypto)** — keeps crypto in the DB, but the passphrase ends up in SQL/connection scope, weakening key isolation.
- **Per-user key, app-level AES-GCM, env master key (chosen)** — self-contained, no extra infra, master key isolated from the data store.

## Consequences

- Losing/rotating `PROMPTVAULT_ENC_KEY` requires re-encrypting (or invalidating) all stored keys — plan a rotation path before it's needed.
- The encryption key must be present in the app's environment for any Run to work.
