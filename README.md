# Prompt Vault

Store and run Claude prompts with per-user encrypted API keys. See [`docs/CONTEXT.md`](docs/CONTEXT.md) for the
vocabulary and [`docs/`](docs/) for the
PRD, ADRs, and the build plan ([`docs/TASKS.md`](docs/TASKS.md)).

Monorepo layout:

- `backend/` — Spring Boot 4.1 / Java 25 (Maven). Own `pom.xml`.
- `frontend/` — Vite + React + TypeScript SPA. Own `package.json`.
- `docker-compose.yml` — local Postgres 18.

## Prerequisites

- **JDK 25+** (developed on 26)
- **Node 22+** and **npm** (developed on Node 26)
- **Docker** with **Docker Compose**

## Quickstart

From a clean clone:

```sh
# 1. Configure. The dev-only values in the template work as-is for local dev.
cp .env.example .env

# 2. Start Postgres (docker-compose reads .env for the POSTGRES_* vars).
docker compose up -d

# 3. Run the backend. Source .env into the shell first so the backend reads
#    its configuration from the environment.
set -a; . ./.env; set +a
cd backend && ./mvnw spring-boot:run
#    -> http://localhost:8080  (sanity check: http://localhost:8080/api/hello)

# 4. In a second terminal, run the frontend.
cd frontend && npm install && npm run dev
#    -> http://localhost:5173  (the SPA proxies /api/* to the backend)
```

Dev URLs:

| Service       | URL                            |
| ------------- | ------------------------------ |
| Frontend SPA  | http://localhost:5173          |
| Backend API   | http://localhost:8080/api      |
| Postgres      | localhost:5432                 |

## Checks

```sh
# Backend: compile + tests + Spotless format check
cd backend && ./mvnw verify

# Frontend: tests, type-check, lint/format
cd frontend && npm test && npm run typecheck && npm run lint
```

## Database migrations

The backend applies Flyway migrations (`backend/src/main/resources/db/migration`)
at startup, so normal development needs no extra step. To inspect or fix the
schema history out of band, use the Flyway Maven plugin:

```sh
cp backend/flyway.conf.example backend/flyway.conf   # once; git-ignored
cd backend
./mvnw flyway:info      # what is applied vs. pending
./mvnw flyway:repair    # realign checksums / clear failed entries
```

The plugin does not read `application.properties` or `.env`, which is why
`flyway.conf` repeats the connection details — keep it in sync with the
`SPRING_DATASOURCE_*` values in `.env`.

## Authentication & sessions

A user signs in with a password or with a Google account (ADR-0011). Both are
Login Methods on **one** account: a Google account whose email Google has
verified is linked onto the existing account with that email rather than
starting a second one, and a Google sign-in for an unknown email provisions a
new account. Either method issues the same token, and nothing downstream knows
which one was used.

Authentication is a stateless JWT (HS256). On login the server issues a single
~24h access token; the client sends it as `Authorization: Bearer <token>` on
every request, and the principal is resolved from the token's claims per
request. There is **no refresh token**.

Google sign-in is **off unless `GOOGLE_CLIENT_ID` is set** — the SPA reads
`GET /api/auth/config` at startup and renders no Google button when it is
absent. Nothing else changes: the app starts normally and password login is
unaffected.

**Logout is client-side only:** the SPA discards the stored token. There is
**no server-side revocation / denylist** — a discarded token remains
cryptographically valid until it expires, and the ~24h expiry bounds that
residual risk. This is an intentional trade-off of the stateless design, and it
holds for both Login Methods: logging out does not sign the user out of Google.

### Getting a Google client ID

The browser obtains an ID token in-page and the backend verifies it against
Google's JWK Set (ADR-0011), so all you need is an OAuth 2.0 **Web application**
client ID. There is no client secret to configure, and no redirect URI —
nothing in this flow ever leaves the page.

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and
   create or select a project.
2. Under **Google Auth Platform → Branding**, set the app name, user support
   email, and developer contact. Do this first; the Clients page sends you here
   if you skip it.
3. Under **Audience**, choose user type **External** (**Internal** only applies
   if you have a Google Workspace organization and want to restrict sign-in to
   it).
4. Go to **Google Auth Platform → Clients → Create client**, choose application
   type **Web application**, and name it.
5. Under **Authorized JavaScript origins**, add `http://localhost:5173` and
   `http://localhost` for local dev, plus your site's own origin for a
   deployment. Leave **Authorized redirect URIs** empty.
6. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`) into
   `GOOGLE_CLIENT_ID` in your `.env`. Ignore the client secret Google shows
   alongside it — this flow never uses one.

Then re-source `.env`, restart the backend (the value is read at startup), and
reload the SPA. `curl http://localhost:8080/api/auth/config` should echo the
client ID back, and a Google button should appear on the login and register
screens.

Worth knowing:

- **An origin is scheme + host + port, nothing else** — no path and no trailing
  slash. `http://127.0.0.1:5173` is a *different* origin from
  `http://localhost:5173`; register whichever one you actually browse to.
- **You do not need test users, and you do not need to publish the app.** An
  app in Testing status normally only admits listed test users, but that limit
  does not apply to one that just signs users in with basic profile and email —
  which is all Prompt Vault asks for.
- **The client ID is not a secret.** It is served to every browser by
  `/api/auth/config`, so it does not belong with `PROMPTVAULT_ENC_KEY` and
  `PROMPTVAULT_JWT_SECRET` in your threat model.
- Changes to a client's origins can take a few minutes to take effect.

## Configuration

All configuration is read from the environment; see [`.env.example`](.env.example)
for the full list. The real `.env` is git-ignored and must never be committed.
`PROMPTVAULT_ENC_KEY` and `PROMPTVAULT_JWT_SECRET` are secrets — generate fresh
values for any non-local use (commands are documented in `.env.example`).
