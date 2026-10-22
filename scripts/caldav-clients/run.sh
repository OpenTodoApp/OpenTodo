#!/bin/bash
# run.sh thunderbird|todoman: the CalDAV verification scenario against a real
# client (OpenSpec change caldav-interop, task 5.2). Starts a fresh server on
# 127.0.0.1:18080 with CalDAV on, a recording proxy on :18081 (traffic.jsonl),
# then drives the client and prints one PASS/FAIL line per check.
#
#   OPENTODO_BIN  server binary (default: bin/opentodo; `make build`)
#   WORK          work directory (default: /tmp/opentodo-caldav-clients)
#
# Thunderbird is downloaded from Mozilla into $WORK and runs headless with
# Marionette; todoman and vdirsyncer are installed into a venv in $WORK.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
export WORK=${WORK:-/tmp/opentodo-caldav-clients}
BIN=${OPENTODO_BIN:-$ROOT/bin/opentodo}
client=${1:?usage: run.sh thunderbird|todoman}
mkdir -p "$WORK"
cd "$WORK"

stop() { fuser -k 18080/tcp 18081/tcp 2828/tcp 2>/dev/null || true; }
trap stop EXIT
stop
sleep 1

[ -x venv/bin/python ] || python3 -m venv venv
venv/bin/pip -q install vdirsyncer==0.21.0 todoman==4.7.0
export PATH=$WORK/venv/bin:$PATH

# A fresh server, an owner and an app password.
rm -rf data jar; mkdir -p data
OPENTODO_ADDR=127.0.0.1:18080 OPENTODO_DATA_DIR=$WORK/data OPENTODO_CALDAV=true "$BIN" > server.log 2>&1 &
for _ in $(seq 60); do curl -sf http://127.0.0.1:18080/healthz >/dev/null && break; sleep 0.5; done
H=(-s -H "Origin: http://127.0.0.1:18080" -H "Content-Type: application/json" -b jar -c jar)
curl "${H[@]}" -X POST http://127.0.0.1:18080/api/v1/auth/register -d '{"email":"t@example.com","password":"correct horse battery staple","name":"Tester"}' > register.json
curl "${H[@]}" -X POST http://127.0.0.1:18080/api/v1/app-passwords -d '{"name":"clients"}' > apppw.json

rm -f traffic.jsonl; touch traffic.jsonl
python "$HERE/proxy.py" > proxy.log 2>&1 &
sleep 1

case $client in
thunderbird)
  if [ ! -x thunderbird/thunderbird ]; then
    curl -sSL -o tb.tar.xz "https://download.mozilla.org/?product=thunderbird-latest&os=linux64&lang=en-US"
    tar -xf tb.tar.xz
  fi
  thunderbird/thunderbird --version
  rm -rf tbprofile; mkdir -p tbprofile
  cat > tbprofile/user.js <<'EOF'
user_pref("marionette.port", 2828);
user_pref("mail.provider.suppress_dialog_on_startup", true);
user_pref("mailnews.start_page.enabled", false);
user_pref("app.update.disabledForTesting", true);
user_pref("calendar.timezone.local", "Europe/Berlin");
user_pref("calendar.timezone.useSystemTimezone", false);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
EOF
  MOZ_HEADLESS=1 "$WORK/thunderbird/thunderbird" --headless --marionette -remote-allow-system-access --no-remote --profile "$WORK/tbprofile" > tb.log 2>&1 &
  python "$HERE/tb_scenario.py"
  ;;
todoman)
  bash "$HERE/tm.sh" init
  bash "$HERE/tm.sh" discover > /dev/null
  python "$HERE/tm_scenario.py"
  ;;
*) echo "unknown client $client" >&2; exit 2 ;;
esac
