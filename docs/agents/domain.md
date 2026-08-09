# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring
the codebase.

## Before exploring, read these

- **`docs/CONTEXT.md`** — the glossary. Note this repo keeps it under `docs/`, not at the
  repo root. There is no `CONTEXT-MAP.md`; this is a single-context repo.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.
  `docs/adr/README.md` indexes them and marks which are superseded or amended.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't
suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs`
and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually
get resolved.

## File structure

Single-context repo:

```
/
├── docs/
│   ├── CONTEXT.md          ← the glossary
│   └── adr/
│       ├── README.md       ← index, marks superseded/amended
│       └── 0001-*.md …
├── backend/
└── frontend/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a
hypothesis, a test name), use the term as defined in `docs/CONTEXT.md`. Don't drift to
synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing
language the project doesn't use (reconsider) or there's a real gap (note it for
`/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently
overriding:

> _Contradicts ADR-0007 (mutable Prompts, no Version or Run history) — but worth reopening
> because…_

Several ADRs here are superseded (0001, 0006) or amended (0003, 0004, 0005) by 0007/0008.
Check `docs/adr/README.md` for current status before treating an ADR as live.
