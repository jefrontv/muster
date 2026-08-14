#!/usr/bin/env bash
# Back-compat wrapper. Prefer `pnpm run dev-fresh`.
set -euo pipefail
exec node "$(dirname "$0")/run-dev-fresh.mjs" "$@"
