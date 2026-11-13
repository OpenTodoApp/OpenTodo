#!/usr/bin/env bash
# Runs the app's Maestro flows against an OpenTodo server (native-app-foundation 4.4).
#
#   flows/run.sh ios|android [flow.yaml ...]
#
# With OT_SERVER_BIN (a server binary with the web app built in), a throwaway server is
# started on a new data directory and an account is registered; otherwise SERVER names a
# running one that has the account, and API the same server as this machine reaches it.
# The app must be installed on the booted simulator or emulator. Maestro's report, its
# log and each flow's screenshots (the named ones, and the screen at a failure) go to OUT
# (default: flows/out), in a folder per flow.
set -euo pipefail
cd "$(dirname "$0")"

platform=${1:?ios or android}; shift
ACCOUNT_EMAIL=${ACCOUNT_EMAIL:-ada@example.com}
ACCOUNT_PASSWORD=${ACCOUNT_PASSWORD:-correct horse battery staple}
ACCOUNT_NAME=${ACCOUNT_NAME:-Ada Lovelace}
OUT=${OUT:-$PWD/out}
PORT=${PORT:-18080}
case $platform in
  # The simulator shares the Mac's loopback; the emulator reaches the host at 10.0.2.2.
  ios) app=app.open-todo.ios; host=127.0.0.1 ;;
  android) app=app.opentodo; host=10.0.2.2 ;;
  *) echo "unknown platform $platform" >&2; exit 2 ;;
esac

if [ -n "${OT_SERVER_BIN:-}" ]; then
  data=$(mktemp -d)
  OPENTODO_DATA_DIR=$data OPENTODO_ADDR=127.0.0.1:$PORT "$OT_SERVER_BIN" > "$data/server.log" 2>&1 &
  server=$!
  trap 'kill $server 2>/dev/null || true; rm -rf "$data"' EXIT
  for _ in $(seq 1 50); do curl -sf "http://127.0.0.1:$PORT/api/v1/health" > /dev/null && break; sleep 0.2; done
  curl -sf -X POST "http://127.0.0.1:$PORT/api/v1/auth/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$ACCOUNT_EMAIL\",\"name\":\"$ACCOUNT_NAME\",\"password\":\"$ACCOUNT_PASSWORD\"}" > /dev/null
  SERVER=http://$host:$PORT
  API=http://127.0.0.1:$PORT
fi
: "${SERVER:?set OT_SERVER_BIN or SERVER}"
: "${API:?set API to the address of the server from this machine}"

# An API token for the flows' scripts (the REST side of the sync checks).
jar=$(mktemp)
curl -sf -c "$jar" -X POST "$API/api/v1/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ACCOUNT_EMAIL\",\"password\":\"$ACCOUNT_PASSWORD\"}" > /dev/null
TOKEN=$(curl -sf -b "$jar" -X POST "$API/api/v1/tokens" -H 'Content-Type: application/json' -d '{"name":"app flows"}' | sed -n 's/.*"secret":"\([^"]*\)".*/\1/p')
rm -f "$jar"
[ -n "$TOKEN" ] || { echo "no API token from $API" >&2; exit 1; }

mkdir -p "$OUT"
[ $# -gt 0 ] || set -- sign-in.yaml today.yaml tabs.yaml
for flow in "$@"; do
  maestro test --format junit --output "$OUT/${flow%.yaml}.xml" --debug-output "$OUT/${flow%.yaml}" --flatten-debug-output \
    -e APP_ID="$app" -e SERVER="$SERVER" -e ACCOUNT_EMAIL="$ACCOUNT_EMAIL" -e ACCOUNT_PASSWORD="$ACCOUNT_PASSWORD" -e ACCOUNT_NAME="$ACCOUNT_NAME" \
    -e API="$API" -e TOKEN="$TOKEN" "$flow"
done
