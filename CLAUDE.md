# CLAUDE.md

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature-slug>/`. GitHub Issues is not
used for this repo, and there is no PR triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles are used verbatim, recorded as a `Status:` line in each
issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. The glossary is at `docs/CONTEXT.md` (not the repo root) and ADRs are in
`docs/adr/`. See `docs/agents/domain.md`.
