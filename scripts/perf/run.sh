#!/usr/bin/env bash
# The time benchmark of the performance budgets (OpenSpec change performance-10k,
# docs/performance.md), after the app and the server are built (`make perf` builds
# them; the nightly workflow runs this in the Playwright image, which has no make).
# Builds the 10,000-task account, then the server budgets (internal/perf) and the
# desktop and phone-profile budgets (run.mjs), each PERF_RUNS times; fails when a
# median is over its limit. Reports in perf-report/; the failures, one per line,
# in perf-report/failures.txt.
#
# NOTES=1 runs the notes fixture instead (design D7): about 2 GB of note history
# on top of the account, compacted by the server's job, then the notes budgets.
#
# Env: PERF_FIXTURE (default perf-report/fixture), PERF_SEED_FLAGS (extra perfseed
# flags, such as "-scale 5"), PERF_RUNS, PERF_PROFILES, PERF_BIN, NOTES,
# NOTES_SEED_FLAGS (notes-seed.mjs flags, such as "--notes 50" for a quick look).
set -uo pipefail

# Absolute: go test runs the server half from its package directory.
fixture=$(realpath -m "${PERF_FIXTURE:-perf-report/fixture}")
reports=$(realpath -m perf-report)
mkdir -p "$reports"
rm -rf "$fixture"

if [ -n "${NOTES:-}" ]; then
  docs="$reports/notes-docs.jsonl"
  # shellcheck disable=SC2086 # the flags are words
  node scripts/perf/notes-seed.mjs "$docs" ${NOTES_SEED_FLAGS:-} || exit 1
  # shellcheck disable=SC2086
  go run ./cmd/perfseed -data "$fixture" -notes "$docs" ${PERF_SEED_FLAGS:-} || exit 1
  rm -f "$docs"
  st=0
  PERF_NOTES_FIXTURE=$fixture PERF_NOTES_COMPACTED=$reports/notes-compacted PERF_NOTES_REPORT=$reports/notes-server.json \
    go test -tags perf -count=1 -timeout 60m -run TestNotesBudgets -v ./internal/perf/... || st=1
  PERF_NOTES=1 PERF_FIXTURE=$reports/notes-compacted PERF_REPORT=$reports/notes-web.json node scripts/perf/run.mjs || st=1
  node scripts/perf/failures.mjs perf-report/notes-server.json perf-report/notes-web.json > perf-report/failures.txt
  cat perf-report/failures.txt
  rm -rf "$fixture"
  exit $st
fi

# shellcheck disable=SC2086 # the flags are words
go run ./cmd/perfseed -data "$fixture" ${PERF_SEED_FLAGS:-} || exit 1

st=0
PERF_FIXTURE=$fixture PERF_REPORT=$reports/server.json go test -tags perf -count=1 -timeout 40m -run TestServerBudgets ./internal/perf/... || st=1
PERF_FIXTURE=$fixture PERF_REPORT=$reports/web.json node scripts/perf/run.mjs || st=1
node scripts/perf/failures.mjs perf-report/server.json perf-report/web.json > perf-report/failures.txt
# The 2,000-row list as a screen reader gets it (accessibility-aa): every row in the tree, one named list per section.
PERF_FIXTURE=$fixture node scripts/perf/a11y-list.mjs > "$reports/a11y-list.txt" 2>&1 || { st=1; echo "a11y-list: $(tail -1 "$reports/a11y-list.txt")" >> perf-report/failures.txt; }
cat perf-report/failures.txt
exit $st
