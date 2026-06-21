# Prompt Vault

Store, version, and run Claude prompts with per-user encrypted API keys.
See [`CONTEXT.md`](CONTEXT.md) for the vocabulary and [`docs/`](docs/) for the
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
cd frontend && npm test && npx tsc -b && npm run lint
```

## Configuration

All configuration is read from the environment; see [`.env.example`](.env.example)
for the full list. The real `.env` is git-ignored and must never be committed.
`PROMPTVAULT_ENC_KEY` and `PROMPTVAULT_JWT_SECRET` are secrets — generate fresh
values for any non-local use (commands are documented in `.env.example`).
