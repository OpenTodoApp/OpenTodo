#!/usr/bin/env bash
# Runs every Go fuzz target (func FuzzXxx in a *_test.go file) for a while each.
# Go fuzzes one target per `go test` call, so the targets run one after another.
# A failing input is written to <package>/testdata/fuzz/<FuzzXxx>/ by Go; commit
# it with the fix so it stays a regression test that plain `go test` replays.
#
#   scripts/fuzz.sh            # 30s per target
#   scripts/fuzz.sh 5m         # longer
#   scripts/fuzz.sh 10s ./internal/webauthn   # one package
#
# Needs the web build in internal/web/dist (make web) like the other Go tests.
set -euo pipefail

fuzztime="${1:-30s}"
shift || true
pkgs=("$@")
if [ ${#pkgs[@]} -eq 0 ]; then
  pkgs=(./...)
fi

cd "$(dirname "$0")/.."
failed=0
found=0
for pkg in $(go list "${pkgs[@]}"); do
  dir=$(go list -f '{{.Dir}}' "$pkg")
  targets=$(grep -ho '^func Fuzz[A-Za-z0-9_]*' "$dir"/*_test.go 2>/dev/null | sed 's/^func //' | sort -u || true)
  for target in $targets; do
    found=$((found + 1))
    echo "::group::$pkg $target ($fuzztime)"
    if ! go test "$pkg" -run '^$' -fuzz "^${target}\$" -fuzztime "$fuzztime" -fuzzminimizetime 10s -parallel 2; then
      echo "::error::fuzz target $pkg $target failed; the input is in $dir/testdata/fuzz/$target/"
      failed=$((failed + 1))
    fi
    echo "::endgroup::"
  done
done

echo "fuzz: $found targets, $failed failed"
[ "$failed" -eq 0 ]
