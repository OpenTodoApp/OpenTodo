#!/usr/bin/env bash
# End-to-end smoke test of the `ot` CLI against a freshly started local server:
# owner setup -> login -> add -> list --json -> done (dry run first) -> exit codes
# -> schema -> export -> logout. Prints "CLI OK".
#
# Usage: scripts/cli-smoke.sh            (expects bin/opentodo and bin/ot; see `make cli-smoke`)
# Env:   OPENTODO_BIN, OT_BIN            override the binaries
#        OPENTODO_SMOKE_PORT             port for the throwaway server (default 18080)
set -euo pipefail

cd "$(dirname "$0")/.."
SERVER=${OPENTODO_BIN:-./bin/opentodo}
OT=${OT_BIN:-./bin/ot}
PORT=${OPENTODO_SMOKE_PORT:-18080}
URL="http://127.0.0.1:${PORT}"
EMAIL="smoke@example.com"
PASSWORD="smoke test password"

WORK=$(mktemp -d)
export OPENTODO_CONFIG="$WORK/config.json"
unset OPENTODO_URL OPENTODO_TOKEN OPENTODO_PROFILE

fail() { echo "cli-smoke: FAIL: $*" >&2; exit 1; }

OPENTODO_ADDR="127.0.0.1:${PORT}" OPENTODO_DATA_DIR="$WORK/data" OPENTODO_LOG_LEVEL=warn "$SERVER" >"$WORK/server.log" 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

for _ in $(seq 1 50); do
  curl -fsS "$URL/healthz" >/dev/null 2>&1 && break
  sleep 0.2
done
curl -fsS "$URL/healthz" >/dev/null || fail "server did not start (see $WORK/server.log)"

# 1. Setup: the first account becomes the owner.
curl -fsS "$URL/api/v1/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"name\":\"Smoke\",\"password\":\"$PASSWORD\"}" >/dev/null || fail "owner setup"

# 2. Login: the password is read from stdin because this is not a terminal.
printf '%s\n' "$PASSWORD" | "$OT" login "$URL" --email "$EMAIL" >/dev/null || fail "ot login"
[ -f "$OPENTODO_CONFIG" ] || fail "config file not written"
grep -q 'ot_' "$OPENTODO_CONFIG" || fail "token not stored"
"$OT" auth status | grep -q "$EMAIL" || fail "ot auth status"

# 3. Add a task and a project.
"$OT" project add "Smoke" >/dev/null || fail "ot project add"
ID=$("$OT" add "Smoke test task" --project Smoke --due today --priority 2) || fail "ot add"
[ -n "$ID" ] || fail "ot add printed no id"

# 4. Machine-readable list: a JSON array that contains the task, nothing else.
LIST=$("$OT" list --json --today) || fail "ot list --json"
case "$LIST" in
  \[*\]) ;;
  *) fail "ot list --json did not print a JSON array: $LIST" ;;
esac
echo "$LIST" | grep -q "\"id\":\"$ID\"" || fail "new task missing from list --json"
echo "$LIST" | grep -q '"priority":2' || fail "priority not applied"

# 5. Complete it with an id prefix (after a dry run that changes nothing), then
#    it leaves the open views.
"$OT" done "${ID:0:6}" --dry-run --json | grep -q '"dry_run":true' || fail "ot done --dry-run"
"$OT" today --json | grep -q "$ID" || fail "a dry run completed the task"
"$OT" done "${ID:0:6}" >/dev/null || fail "ot done"
"$OT" today --json | grep -q "$ID" && fail "completed task still in today"
"$OT" list --completed --json | grep -q "$ID" || fail "completed task not in --completed"

# 6. Exit codes.
set +e
"$OT" add "bad" --priority 9 >/dev/null 2>&1; [ $? -eq 2 ] || fail "usage error should exit 2"
OPENTODO_URL="http://127.0.0.1:1" OPENTODO_TOKEN=ot_x "$OT" list >/dev/null 2>&1; [ $? -eq 4 ] || fail "unreachable server should exit 4"
OPENTODO_TOKEN=ot_wrong "$OT" list >/dev/null 2>&1; [ $? -eq 3 ] || fail "bad token should exit 3"
"$OT" rm "$ID" >/dev/null 2>&1; [ $? -eq 2 ] || fail "rm without --yes off a terminal should exit 2"
"$OT" add "nope" --read-only >/dev/null 2>&1; [ $? -eq 5 ] || fail "--read-only write should exit 5"
set -e
OPENTODO_URL= OPENTODO_CONFIG=/nonexistent/config.json "$OT" schema | grep -q '"output_version": 1' || fail "ot schema offline"

# 7. Export includes the task.
"$OT" export --out "$WORK/export.json" >/dev/null || fail "ot export"
grep -q '"format":"opentodo-export"' "$WORK/export.json" || fail "export format"
grep -q "$ID" "$WORK/export.json" || fail "export content"

# 8. Logout revokes the token.
"$OT" auth logout --yes >/dev/null || fail "ot auth logout"
set +e
"$OT" list >/dev/null 2>&1; [ $? -eq 2 ] || fail "after logout the CLI should ask to sign in (exit 2)"
set -e

echo "CLI OK"
