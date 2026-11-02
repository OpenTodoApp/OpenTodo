#!/usr/bin/env bash
# The time benchmark of the performance budgets (OpenSpec change performance-10k,
# docs/performance.md), after the app and the server are built (`make perf` builds
# them; the nightly workflow runs this in the Playwright image, which has no make).
# Builds the 10,000-task account, then the server budgets (internal/perf) and the
# desktop and phone-profile budgets (run.mjs), each PERF_RUNS times; fails when a
# median is over its limit. Reports in perf-report/; the failures, one per line,
# in perf-report/failures.txt.
#
# Env: PERF_FIXTURE (default perf-report/fixture), PERF_SEED_FLAGS (extra perfseed
# flags, such as "-scale 5"), PERF_RUNS, PERF_PROFILES, PERF_BIN.
set -uo pipefail

fixture=${PERF_FIXTURE:-perf-report/fixture}
mkdir -p perf-report
rm -rf "$fixture"
# shellcheck disable=SC2086 # the flags are words
go run ./cmd/perfseed -data "$fixture" ${PERF_SEED_FLAGS:-} || exit 1

st=0
PERF_FIXTURE=$fixture PERF_REPORT=perf-report/server.json go test -tags perf -count=1 -timeout 40m ./internal/perf/... || st=1
PERF_FIXTURE=$fixture PERF_REPORT=perf-report/web.json node scripts/perf/run.mjs || st=1
node scripts/perf/failures.mjs perf-report/server.json perf-report/web.json > perf-report/failures.txt
cat perf-report/failures.txt
exit $st
