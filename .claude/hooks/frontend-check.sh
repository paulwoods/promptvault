#!/usr/bin/env bash
# Split typecheck/lint gate for frontend/ edits (docs/TASKS.md Phase 10).
#
# Modes:
#   edit  (PostToolUse, matcher Edit|Write) — runs eslint + prettier --check
#         on the single edited file, but only when it's a frontend/*.ts(x)
#         file. Any edit under frontend/ (including non-TS files, e.g. CSS)
#         touches a session-keyed dirty marker so the `stop` gate still runs
#         at turn end even for a TS-free frontend change.
#   stop  (Stop) — no-ops (exit 0) if there's no dirty marker for this
#         session, or if stop_hook_active is set (avoids a self-triggered
#         infinite stop loop — the marker is left intact so the next turn's
#         Stop hook re-checks). Otherwise consumes the marker and runs the
#         full `npm run typecheck && npm run lint`, blocking (exit 2) on
#         failure.
#
# Accepted risks (left as-is, not bugs):
#   - A hook that exceeds its timeout is cancelled non-blocking by the
#     harness — it fails open with only a generic hook-error notice, no
#     tsc/eslint output. Not handled here.
#   - The `.tsbuildinfo` race is now confined to concurrent *sessions*
#     (tsc runs once per turn on Stop, not once per edit); tsc self-heals
#     via a full rebuild on a stale/corrupt cache, so the worst case is a
#     perf blip, not a wrong diagnosis.
#   - A stop_hook_active turn intentionally skips re-verification for that
#     turn; the marker persists so the next turn's Stop hook re-checks.

set -uo pipefail

mode="${1:?usage: frontend-check.sh <edit|stop>}"

if ! command -v jq >/dev/null 2>&1; then
  echo "frontend-check.sh: 'jq' is required but was not found on PATH. Install jq (e.g. 'apt install jq' / 'brew install jq') to re-enable the frontend check gate." >&2
  exit 2
fi

project_dir="${CLAUDE_PROJECT_DIR:?frontend-check.sh: CLAUDE_PROJECT_DIR is not set}"
frontend_dir="$project_dir/frontend"

input=$(cat)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')
marker="/tmp/claude-frontend-check-dirty-${session_id}"

case "$mode" in
  edit)
    file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
    [ -n "$file_path" ] || exit 0

    case "$file_path" in
      "$frontend_dir"/*) ;;
      *) exit 0 ;;
    esac

    touch "$marker"

    case "$file_path" in
      *.ts | *.tsx) ;;
      *) exit 0 ;;
    esac

    if [ ! -d "$frontend_dir/node_modules" ]; then
      echo "frontend-check.sh: frontend/node_modules is missing. Run 'npm install' in frontend/ to enable the frontend check gate." >&2
      exit 2
    fi

    cd "$frontend_dir" || exit 2
    if ! out=$(npx --no-install eslint "$file_path" --max-warnings 0 2>&1 && npx --no-install prettier --check "$file_path" 2>&1); then
      printf '%s\n' "$out" >&2
      exit 2
    fi
    ;;

  stop)
    stop_hook_active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')
    if [ "$stop_hook_active" = "true" ]; then
      exit 0
    fi
    [ -f "$marker" ] || exit 0

    if [ ! -d "$frontend_dir/node_modules" ]; then
      echo "frontend-check.sh: frontend/node_modules is missing. Run 'npm install' in frontend/ to enable the frontend check gate." >&2
      exit 2
    fi

    rm -f "$marker"

    cd "$frontend_dir" || exit 2
    if ! out=$(npm run --silent typecheck 2>&1 && npm run --silent lint 2>&1); then
      printf '%s\n' "$out" >&2
      exit 2
    fi
    ;;

  *)
    echo "frontend-check.sh: unknown mode '$mode' (expected edit|stop)" >&2
    exit 2
    ;;
esac
