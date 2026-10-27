#!/usr/bin/env bash
# The browser end-to-end checks (`make e2e`, and CI's End-to-end layout leg, whose
# Playwright image has no make): each script against a throwaway server on :18081,
# then the network audit. Expects bin/opentodo and bin/ot; needs Playwright with Chromium.
set -uo pipefail

for s in e2e-smoke e2e-views e2e-offline e2e-mcp-decrypt; do
  d=$(mktemp -d)
  OPENTODO_DATA_DIR=$d OPENTODO_ADDR=127.0.0.1:18081 ./bin/opentodo >"$d/server.log" 2>&1 &
  pid=$!
  for _ in $(seq 1 30); do curl -fsS 127.0.0.1:18081/healthz >/dev/null 2>&1 && break; sleep 0.3; done
  echo "== $s"
  OPENTODO_URL=http://127.0.0.1:18081 node "scripts/$s.mjs"
  st=$?
  kill "$pid"; wait "$pid" 2>/dev/null
  if [ "$st" -ne 0 ]; then cat "$d/server.log"; rm -rf "$d"; exit "$st"; fi
  rm -rf "$d"
done
echo "== e2e-network"
OPENTODO_BIN=./bin/opentodo node scripts/e2e-network.mjs
