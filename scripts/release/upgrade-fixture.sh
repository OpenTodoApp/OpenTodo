#!/usr/bin/env bash
# Builds the upgrade fixture of one released version (OpenSpec change
# stability-contract, design D4): the server of tag v<version>, built from a
# temporary checkout of that tag, runs on an empty data directory; the fixed
# scenario (scripts/release/upgrade-scenario.mjs) drives it through its own
# API; the stopped server's data directory is stored with a manifest of what
# the version reported.
#
#   scripts/release/upgrade-fixture.sh 0.16.0
#
# writes internal/store/testdata/upgrade/0.16/data.tar.gz, manifest.json and export.json
# (the version's own export, which the importer tests import)
# (one fixture per minor version: build it from the minor's latest patch).
# Needs git, go (old toolchains are fetched by GOTOOLCHAIN=auto), node and tar.
# `go test ./internal/tenant -run TestUpgradeFromEveryRelease` then upgrades it.
set -euo pipefail

version=${1:?usage: upgrade-fixture.sh <version, e.g. 0.16.0> [ref, default v<version>; HEAD when preparing the release]}
version=${version#v}
ref=${2:-v$version}
minor=$(printf '%s' "$version" | cut -d. -f1,2)
root=$(cd "$(dirname "$0")/../.." && pwd)
out="$root/internal/store/testdata/upgrade/$minor"
port=${UPGRADE_FIXTURE_PORT:-18090}

work=$(mktemp -d)
pid=""
cleanup() {
  if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; fi
  rm -rf "$work"
}
trap cleanup EXIT

commit=$(git -C "$root" rev-parse "$ref^{commit}")
mkdir -p "$work/src" "$work/data"
git -C "$root" archive "$ref" | tar -x -C "$work/src"
# Only the API matters: an empty web build keeps the embed compiling.
mkdir -p "$work/src/internal/web/dist"
touch "$work/src/internal/web/dist/.gitkeep"
(cd "$work/src" && GOTOOLCHAIN=auto CGO_ENABLED=0 go build -trimpath -o "$work/opentodo" ./cmd/opentodo)
gover=$(cd "$work/src" && GOTOOLCHAIN=auto go env GOVERSION)

OPENTODO_DATA_DIR="$work/data" OPENTODO_ADDR="127.0.0.1:$port" OPENTODO_ALLOW_SIGNUP=true \
  OPENTODO_PUSH=false OPENTODO_LOG_LEVEL=warn "$work/opentodo" >"$work/server.log" 2>&1 &
pid=$!
for _ in $(seq 1 100); do
  if curl -fsS "http://127.0.0.1:$port/healthz" >/dev/null 2>&1; then break; fi
  sleep 0.1
done
curl -fsS "http://127.0.0.1:$port/healthz" >/dev/null || { cat "$work/server.log"; exit 1; }

node "$root/scripts/release/upgrade-scenario.mjs" "http://127.0.0.1:$port" "$work/scenario.json" "$work/export.json"

# A clean stop checkpoints the write-ahead log into opentodo.db.
kill -TERM "$pid"
wait "$pid" || true
pid=""

mkdir -p "$out"
rm -f "$out/data.tar.gz"
cp "$work/export.json" "$out/export.json"
# The database and the attachment files; caches, backups and logs are not data.
(cd "$work/data" && tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner \
  --exclude='./cache' --exclude='./backups' --exclude='./tmp' --exclude='*.lock' -cf - .) | gzip -9n >"$out/data.tar.gz"
node -e '
const fs = require("fs")
const [scenario, out, version, commit, gover] = process.argv.slice(1)
const m = JSON.parse(fs.readFileSync(scenario, "utf8"))
const manifest = { version, source: { ref: process.argv[6], commit, built_with: gover, how: "scripts/release/upgrade-fixture.sh" }, ...m }
fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n")
' "$work/scenario.json" "$out/manifest.json" "$version" "$commit" "$gover" "$ref"
echo "upgrade fixture: $out ($(du -h "$out/data.tar.gz" | cut -f1))"
