# Deployment Runbook — Prompt Vault on the DigitalOcean droplet

How to deploy Prompt Vault to the existing droplet behind Caddy. The server is
managed by the compose stack in the **caddy repo**
(`git@github.com:paulwoods/caddy.git`), which already runs a shared Postgres 18
container, Caddy (TLS termination), and the other apps (equipment, calculus).
Prompt Vault follows the same pattern as equipment: two Docker Hub images
(backend + frontend), one env file, one Caddyfile site block, one database in
the shared Postgres.

**Target hostname:** `promptvault.mrpaulwoods.com` (assumed; adjust everywhere
if a different subdomain is chosen).

---

## Architecture on the droplet

```
Browser ──HTTPS──▶ Caddy (ports 80/443, auto-TLS)
                     ├── /api/*  ──▶ promptvault-backend:8080  (Spring Boot jar)
                     └── /*      ──▶ promptvault-frontend:80   (nginx, static SPA)
promptvault-backend ──▶ postgres:5432 (shared container, database "promptvault")
```

- The SPA calls the API with relative `/api/*` URLs, so frontend and backend
  are same-origin behind Caddy and CORS never fires.
- Flyway owns the schema; the backend migrates the database on startup.
- Runs stream over SSE (ADR-0003). Caddy's `reverse_proxy` flushes
  `text/event-stream` responses immediately — no extra config needed.

## Required backend environment

The backend is configured entirely from the environment (no prod profile
needed — the default profile reads these variables):

| Variable | Purpose | Generate / value |
|---|---|---|
| `DATABASE_URL` | JDBC URL | `jdbc:postgresql://postgres:5432/promptvault` |
| `DATABASE_USERNAME` | DB role | `promptvault` |
| `DATABASE_PASSWORD` | DB password | strong random |
| `PROMPTVAULT_ENC_KEY` | AES-256-GCM master key for stored API keys (ADR-0002). Must decode to exactly 32 bytes or the app refuses to start. | `openssl rand -base64 32` |
| `PROMPTVAULT_JWT_SECRET` | HS256 signing secret, ≥ 256-bit | `openssl rand -base64 48` |

> **Never rotate or lose `PROMPTVAULT_ENC_KEY` casually** — it decrypts every
> user's stored Anthropic API key. Losing it means every user must re-enter
> their key. Back it up alongside the env file.

---

## Part 1 — One-time setup

### 1.1 DNS

In the DigitalOcean control panel, add an A record:

```
promptvault.mrpaulwoods.com  →  <droplet IP>
```

Caddy will obtain the certificate automatically on first request once the
record resolves and the Caddyfile block (1.5) is live.

### 1.2 Dockerfiles (commit to this repo)

These do not exist yet. Create them on first deploy and commit them.

**`backend/Dockerfile`** — multi-stage; tests are skipped in the image build
(they need Docker for Testcontainers — run the suite locally/CI before
building, per the git workflow):

```dockerfile
FROM eclipse-temurin:25-jdk AS build
WORKDIR /app
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -B dependency:go-offline
COPY src src
RUN ./mvnw -B package -DskipTests

FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /app/target/backend-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

**`frontend/Dockerfile`** — builds the SPA (the `build` script also runs the
typecheck), serves it with nginx:

```dockerfile
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**`frontend/nginx.conf`** — SPA fallback so client-side routes (react-router)
survive a hard refresh:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    # Hashed build assets are immutable
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

**`frontend/.dockerignore`** (avoid shipping local state into the build
context):

```
node_modules
dist
```

### 1.3 Create the database in the shared Postgres

The caddy repo's `init-app-db.sh` creates each app's role and database
(idempotent — safe to re-run; it re-asserts passwords and skips existing
databases). Update it to init promptvault alongside equipment:

```bash
#!/bin/bash
# Create each application's database role and database (idempotent).
#
# Runs automatically on a FRESH postgres volume via /docker-entrypoint-initdb.d.
# For an EXISTING volume, run it manually inside the container:
#   docker compose exec postgres bash /docker-entrypoint-initdb.d/init-app-db.sh
#
# Reads from the environment (provided by postgres.env via docker compose):
#   SPRING_DATASOURCE_USERNAME  equipment role; also used as its database name
#   SPRING_DATASOURCE_PASSWORD  equipment role password
#   PROMPTVAULT_DB_USERNAME     promptvault role (default: promptvault); also its database name
#   PROMPTVAULT_DB_PASSWORD     promptvault role password
set -euo pipefail

create_app_db() {
  local app_user="$1"
  local app_password="$2"
  local app_db="$app_user"

  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d postgres <<EOSQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${app_user}') THEN
        CREATE ROLE "${app_user}" LOGIN PASSWORD '${app_password}';
    ELSE
        ALTER ROLE "${app_user}" LOGIN PASSWORD '${app_password}';
    END IF;
END
\$\$;

SELECT 'CREATE DATABASE "${app_db}" OWNER "${app_user}"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${app_db}')\gexec
EOSQL

  echo "Role '${app_user}' and database '${app_db}' are ready."
}

# equipment
create_app_db \
  "${SPRING_DATASOURCE_USERNAME:?SPRING_DATASOURCE_USERNAME is not set}" \
  "${SPRING_DATASOURCE_PASSWORD:?SPRING_DATASOURCE_PASSWORD is not set}"

# promptvault
create_app_db \
  "${PROMPTVAULT_DB_USERNAME:-promptvault}" \
  "${PROMPTVAULT_DB_PASSWORD:?PROMPTVAULT_DB_PASSWORD is not set}"
```

The script runs **inside the postgres container**, which only loads
`postgres.env` — it cannot see `promptvault.env`. Add the promptvault
credentials to `postgres.env` on the droplet:

```bash
# postgres.env — add:
PROMPTVAULT_DB_PASSWORD=<same value as DATABASE_PASSWORD in promptvault.env>
```

The password lives in two files and must stay in sync: the backend
authenticates with the one in `promptvault.env`; the init script creates the
role with the one in `postgres.env`.

Then run it against the existing volume (on the droplet, in the caddy-repo
deploy directory `~/caddy`):

```bash
cd ~/caddy
docker compose exec postgres bash /docker-entrypoint-initdb.d/init-app-db.sh
```

No schema setup is needed; Flyway migrates on first backend start.

### 1.4 Caddy repo: env file, compose services, Caddyfile

All three changes go in the caddy repo; commit and push them, then pull on the
droplet.

**New `promptvault.env.example`** (commit the example; create the real
`promptvault.env` on the droplet only, never commit it):

```bash
# --- Datasource (shared postgres container, database "promptvault") ---
DATABASE_URL=jdbc:postgresql://postgres:5432/promptvault
DATABASE_USERNAME=promptvault
DATABASE_PASSWORD=xxxxxxxxxxxxxxxxxx

# --- Encryption master key (base64, 32 bytes): openssl rand -base64 32 ---
# Decrypts every user's stored Anthropic API key. Back it up. Do not lose it.
PROMPTVAULT_ENC_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx=

# --- JWT signing secret (HS256, >= 256-bit): openssl rand -base64 48 ---
PROMPTVAULT_JWT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**`docker-compose.yml`** — add two services, matching the equipment style. The
two tags are pinned independently (Part 2) — they are not expected to match:

```yaml
  promptvault-backend:
    image: paulwoods/promptvault-backend:0.1.5
    env_file:
      - promptvault.env
    restart: unless-stopped
    logging: *default-logging
    deploy:
      resources:
        limits:
          memory: 1g

  promptvault-frontend:
    image: paulwoods/promptvault-frontend:0.0.4
    restart: unless-stopped
    logging: *default-logging
    deploy:
      resources:
        limits:
          memory: 256m
```

**`Caddyfile`** — add a site block (mirrors the equipment block):

```caddyfile
promptvault.mrpaulwoods.com {
	encode zstd gzip

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
	}

	handle /api/* {
		reverse_proxy promptvault-backend:8080
	}

	handle {
		reverse_proxy promptvault-frontend:80
	}
}
```

---

## Part 2 — Publish images (every release)

**Images are built and pushed by CI, not by hand.** Pushing to `develop`
triggers the workflows in `.github/workflows/` (`publish-backend.yml`,
`publish-frontend.yml`), which run the tests, bump the version, build for
`linux/amd64`, and push to Docker Hub. Do not `docker build`/`docker push`
manually — a hand-picked tag collides with CI's numbering and leaves the
version in `pom.xml`/`package.json` disagreeing with the image it labels.

```bash
# From the promptvault repo on the dev machine
git push origin develop
```

**The two images version independently.** Each workflow is path-filtered, so a
backend-only change publishes only a new backend image and the frontend tag
stays where it is (hence `0.1.5` / `0.0.4` rather than one shared number):

| Change under | Publishes | Version bumped by |
|---|---|---|
| `backend/**` | `paulwoods/promptvault-backend` | Maven, patch, before the build |
| `frontend/**` | `paulwoods/promptvault-frontend` | `npm version patch` |

Each successful run pushes back to `develop`: a `chore: bump … [skip ci]`
commit and a `backend-v<version>` / `frontend-v<version>` git tag. **Your local
`develop` is behind afterwards — `git pull` before doing more work**, or the
next push conflicts with CI's bump commit.

Read the version to deploy from that commit (or the tag):

```bash
git pull
git tag --list 'backend-v*' 'frontend-v*' --sort=-creatordate | head -4
```

Every image is also tagged `latest` and `sha-<short>`, but **the server pins
exact version tags** (like equipment's `2.0.46`) — never deploy `latest`.

Then in the caddy repo, set the two image tags in `docker-compose.yml` to those
versions, commit, and push.

> CI is the gate that decides an image ships: the backend runs `./mvnw -B verify`
> and the frontend `npm test -- --run` before either pushes. The CLAUDE.md rule
> to run both suites locally before committing still stands — it just isn't what
> guards the registry.

## Part 3 — Deploy on the droplet

```bash
ssh <droplet>
cd ~/caddy             # caddy-repo deploy directory

git pull               # picks up compose/Caddyfile/env-example changes
docker compose pull promptvault-backend promptvault-frontend
docker compose up -d   # recreates only changed services
```

If the **Caddyfile** changed (first deploy, or any later edit), reload Caddy —
the file is bind-mounted, but Caddy only reads it at start/reload:

```bash
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

## Part 4 — Verify

```bash
# TLS + SPA: expect HTTP/2 200 and HTML
curl -sSI https://promptvault.mrpaulwoods.com/

# API is up and behind auth: expect 401/403 (not 502)
curl -sS -o /dev/null -w '%{http_code}\n' https://promptvault.mrpaulwoods.com/api/prompts

# Backend started clean (Flyway migrations, no missing-env failures)
docker compose logs --tail 50 promptvault-backend
```

Then in a browser: register/log in, save an API key, create a prompt, and run
it — the run must **stream** incrementally (verifies SSE through Caddy), not
appear all at once.

## Rollback

Images are immutable and tag-pinned, so rollback is re-pointing the tags:

```bash
cd ~/caddy
# edit docker-compose.yml: set the promptvault image tags back to the previous version
docker compose up -d
```

Caveat: Flyway migrations are **not** rolled back. If the bad release shipped a
migration the old code can't tolerate, restore the database from backup first
(below), or roll forward with a fix instead.

## Backups

Nothing to add: the existing nightly cron on the droplet runs the caddy repo's
`backup.sh`, which does a `pg_dumpall` of the shared Postgres container —
promptvault's database is included automatically once it exists. Keep a
separate copy of `promptvault.env` (especially `PROMPTVAULT_ENC_KEY`) — the
database backup is useless for stored API keys without the encryption key.

## Troubleshooting

- **Backend restart-loops** — `docker compose logs promptvault-backend`. Most
  likely a missing/malformed env var: the app fails fast if
  `PROMPTVAULT_ENC_KEY` is unset, not base64, or not 32 bytes decoded.
- **502 from Caddy on `/api/*`** — backend container down or still starting;
  check `docker compose ps` and backend logs.
- **Full-page TLS warning in the browser** — the hostname has no site block in
  the Caddyfile (so no certificate). Confirm the block landed and Caddy was
  reloaded; check `docker compose logs caddy` for ACME errors (DNS not
  propagated yet is the usual cause on first deploy).
- **Hard refresh on a deep link returns 404** — nginx SPA fallback missing;
  confirm `nginx.conf` made it into the frontend image.
- **Runs don't stream (response arrives all at once)** — something is
  buffering the SSE response. Caddy flushes `text/event-stream` automatically;
  if it regresses, exclude the stream from compression in the site block:
  `encode zstd gzip { match { header Content-Type !text/event-stream* } }`.
