#!/usr/bin/env bash
# Run editor module tests via the MolVis host client (requires sibling monorepo layout).
set -euo pipefail
HOST_CLIENT="$(cd "$(dirname "$0")/../../client" && pwd)"
cd "$HOST_CLIENT"
npm test -- ../editor/client
