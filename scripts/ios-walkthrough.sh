#!/bin/sh
# The iPhone walkthrough (docs/ios-app.md "Walkthrough"): WalkthroughTests in the iOS
# Simulator against a fresh, seeded bin/opentodo, once per device, and the screenshots out
# of each result bundle as <device>-<step>.png with a summary of what the accessibility
# audit found. It reports and never fails on what it finds. macOS with Xcode only; run by
# .github/workflows/ios-walkthrough.yml.
#
#   scripts/ios-walkthrough.sh [out-dir]      default dist/ios-walkthrough; needs bin/opentodo
set -eu
out=${1:-dist/ios-walkthrough}
port=18080
base=http://127.0.0.1:$port
email=ada@example.com
password='correct horse battery staple'
work=$(mktemp -d)
rm -rf "$out" && mkdir -p "$out/screenshots" "$out/logs"
out=$(cd "$out" && pwd)
summary=$out/summary.txt

server=
stop_server() { if [ -n "$server" ]; then kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true; server=; fi; }
trap stop_server EXIT

# A fresh server per device, so every run starts from the same account.
start_server() {
  stop_server
  data=$(mktemp -d "$work/data.XXXX")
  OPENTODO_ADDR=127.0.0.1:$port OPENTODO_DATA_DIR=$data OPENTODO_BASE_URL=$base bin/opentodo >> "$out/logs/server.log" 2>&1 &
  server=$!
  i=0; until curl -fs "$base/healthz" > /dev/null; do i=$((i + 1)); [ $i -lt 100 ] || { echo "the server did not start"; exit 1; }; sleep 0.2; done
}

# The owner and a small account: two projects, tasks for Today, the Inbox and later, a subtask.
seed() {
  jar=$work/cookies
  rm -f "$jar"
  post() { curl -fsS -b "$jar" -c "$jar" -H "Origin: $base" -H 'Content-Type: application/json' -X POST "$base/api/v1/$1" -d "$2"; }
  post auth/register "{\"email\":\"$email\",\"name\":\"Ada\",\"password\":\"$password\"}" > /dev/null
  today=$(date +%F); tomorrow=$(date -v+1d +%F); yesterday=$(date -v-1d +%F); later=$(date -v+5d +%F)
  home=$(post projects '{"name":"Home renovation"}' | jq -r .id)
  job=$(post projects '{"name":"Work"}' | jq -r .id)
  errand=$(post labels '{"name":"errand"}' | jq -r .id)
  kitchen=$(post tasks "{\"title\":\"Get three quotes for the kitchen\",\"project_id\":\"$home\",\"priority\":2,\"due\":{\"date\":\"$today\"},\"description\":\"Ask each for a written quote with the cabinets, the worktop and the fitting.\"}" | jq -r .id)
  for t in \
    "{\"title\":\"Call the electrician\",\"project_id\":\"$home\",\"parent_id\":\"$kitchen\"}" \
    "{\"title\":\"Buy paint samples\",\"project_id\":\"$home\",\"labels\":[\"$errand\"],\"due\":{\"date\":\"$today\",\"time\":\"17:30\"}}" \
    "{\"title\":\"Book the movers\",\"project_id\":\"$home\",\"due\":{\"date\":\"$today\"}}" \
    "{\"title\":\"Pay the electricity bill\",\"priority\":1,\"due\":{\"date\":\"$yesterday\"}}" \
    "{\"title\":\"Water the plants\",\"due\":{\"date\":\"$today\"}}" \
    "{\"title\":\"Renew passport before the trip to Lisbon in the spring, with new photos and the old passport\",\"due\":{\"date\":\"$today\"}}" \
    "{\"title\":\"Prepare the quarterly review\",\"project_id\":\"$job\",\"priority\":1,\"due\":{\"date\":\"$tomorrow\",\"time\":\"09:00\"}}" \
    "{\"title\":\"Reply to Sam about the offsite\",\"project_id\":\"$job\",\"due\":{\"date\":\"$later\"}}" \
    '{"title":"Read the article Lena sent"}' \
    '{"title":"Pick up the parcel","priority":3}'; do
    post tasks "$t" > /dev/null
  done
}

udid_of() {
  xcrun simctl list devices available -j | jq -r --arg n "$1" \
    '[.devices | to_entries | sort_by(.key)[] | select(.key | test("iOS")) | .value[] | select(.name == $n)] | last | .udid // empty'
}

# The screenshots of one result bundle, named <label>-<step>.png.
export_shots() {
  dir=$(mktemp -d "$work/attachments.XXXX")
  xcrun xcresulttool export attachments --path "$2" --output-path "$dir" > /dev/null || { echo "$1: no attachments exported" >> "$summary"; return 0; }
  jq -r '.[].attachments[] | [.exportedFileName, .suggestedHumanReadableName] | @tsv' "$dir/manifest.json" |
    while IFS="$(printf '\t')" read -r file name; do
      step=$(printf '%s' "$name" | sed -E 's/\.[A-Za-z]+$//; s/_[0-9]+_[0-9A-Fa-f-]{36}$//')
      case "$file" in
        *.png) cp "$dir/$file" "$out/screenshots/$1-$step.png" ;;
        *) sips -s format png "$dir/$file" --out "$out/screenshots/$1-$step.png" > /dev/null ;;
      esac
    done
}

echo "  building for testing"
xcodebuild -version
(cd mobile/ios && xcodebuild -project OpenTodo.xcodeproj -scheme OpenTodo -configuration Debug -derivedDataPath build \
  -destination 'generic/platform=iOS Simulator' build-for-testing -quiet) > "$out/logs/build.log" 2>&1 || { tail -50 "$out/logs/build.log"; exit 1; }

{ echo "iPhone walkthrough $(date -u '+%Y-%m-%d %H:%M UTC'), $(git rev-parse --short HEAD)"
  echo "WKWebView console errors: not collected (the shell's bridge has no console channel)."; echo; } > "$summary"

# label|simulator|appearance|text size
for run in \
  "iphone-se|iPhone SE (3rd generation)|light|large" \
  "iphone-16|iPhone 16|light|large" \
  "iphone-16-pro-max|iPhone 16 Pro Max|light|large" \
  "iphone-16-dark-xxxl|iPhone 16|dark|accessibility-extra-extra-extra-large"; do
  IFS='|' read -r label name appearance size <<EOF
$run
EOF
  udid=$(udid_of "$name")
  if [ -z "$udid" ]; then echo "== $label: no simulator named $name on this runner, skipped" | tee -a "$summary"; continue; fi
  echo "  $label: $name ($udid), $appearance, $size"
  xcrun simctl shutdown "$udid" 2> /dev/null || true
  xcrun simctl erase "$udid"
  xcrun simctl boot "$udid"
  xcrun simctl bootstatus "$udid" -b > /dev/null
  xcrun simctl ui "$udid" appearance "$appearance"
  xcrun simctl ui "$udid" content_size "$size"
  xcrun simctl status_bar "$udid" override --time 9:41 --batteryState charged --batteryLevel 100 || true
  start_server
  seed
  bundle=$work/$label.xcresult
  (cd mobile/ios && TEST_RUNNER_OPENTODO_WALKTHROUGH_URL=$base TEST_RUNNER_OPENTODO_WALKTHROUGH_EMAIL=$email \
    TEST_RUNNER_OPENTODO_WALKTHROUGH_PASSWORD=$password \
    xcodebuild -project OpenTodo.xcodeproj -scheme OpenTodo -configuration Debug -derivedDataPath build \
    -destination "id=$udid" -only-testing:OpenTodoUITests/WalkthroughTests -resultBundlePath "$bundle" \
    test-without-building) > "$out/logs/$label.log" 2>&1 || echo "  $label: xcodebuild exited non-zero (see logs/$label.log)"
  export_shots "$label" "$bundle"
  { echo "== $label ($name, $appearance, text $size): $(ls "$out/screenshots" | grep -c "^$label-" || true) screenshots"
    grep -h -o 'walkthrough \(note\|audit\): .*' "$out/logs/$label.log" | sort -u || echo "no audit issues or notes"
    grep -h -E 'error: |Test Case .* (passed|failed|skipped)' "$out/logs/$label.log" | head -20 || true
    echo; } >> "$summary"
  xcrun simctl shutdown "$udid" || true
done
stop_server
echo "  $(ls "$out/screenshots" | wc -l | tr -d ' ') screenshots in $out/screenshots, summary in $summary"
