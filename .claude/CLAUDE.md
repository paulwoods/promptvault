# Prompt Vault

Store, version, and run Claude prompts with per-user encrypted API keys.
Monorepo: `backend/` (Spring Boot 4.1 / Java 25, Maven) and `frontend/` (Vite +
React + TypeScript SPA). See `CONTEXT.md` for the vocabulary and `docs/` for the
PRD, ADRs, and build plan.

## Git Workflow

Always run the full test suite (backend and frontend) before committing. Only
commit if all tests pass. Use descriptive commit messages. After pushing, verify
the push landed on the remote.

## Architecture Review Workflow

When asked to grill or review architecture: (1) Read the existing
architecture/review docs first to find correct package paths, (2) Ask one
question at a time — never pack multiple questions into a single prompt, (3) Wait
for the user's answer before proceeding, (4) Only implement after the user
explicitly approves the design.

## Codebase Paths

Before exploring any package or module, verify the path exists with a quick `ls`
or `find` command. Do not trust paths from documentation files blindly — docs may
be stale or aspirational.

## UI Changes

When implementing UI or styling changes, verify the result by running the
frontend dev server or build. Check for lint errors after CSS/HTML changes.
Prefer hardcoded values over CSS `var()` inside data-URI `url()` — CSS variables
inside `url()` don't work reliably across browsers.
