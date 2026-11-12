#!/usr/bin/env bash
# Reports the result of the nightly workflow as one GitHub issue labelled
# ci-nightly: a failed night opens it (or comments on the open one), a green
# night closes it. Runs in .github/workflows/nightly.yml with GITHUB_TOKEN.
#
# Environment:
#   RESULTS  the workflow's `needs` context as JSON ({"job":{"result":"failure"},...})
#   RUN_URL  link to the run
#   RUN_ID, RUN_ATTEMPT  the run and its attempt (a first attempt that failed only
#            for want of a runner is retried, see scripts/nightly-retry.sh)
#   GH_TOKEN token for the gh CLI (issues: write)
#   DRY_RUN  when set, print the gh commands instead of running them
set -euo pipefail

label=ci-nightly
title="Nightly CI is failing"

gh_() {
  if [ -n "${DRY_RUN:-}" ]; then echo "gh $*"; else gh "$@"; fi
}

# A job may name what failed in an output called failures (perf: one metric over
# budget per line, "first sync, desktop, 41 s, budget 30 s").
failed=$(node -e '
  for (const [job, { result, outputs }] of Object.entries(JSON.parse(process.argv[1]))) {
    if (result === "success" || result === "skipped") continue
    console.log(`${job} (${result})`)
    for (const line of (outputs?.failures ?? "").split("\n").filter(Boolean)) console.log(`  ${line}`)
  }
' "$RESULTS")
open=$(gh issue list --label "$label" --state open --json number --jq '.[0].number // empty' 2>/dev/null || true)

if [ -n "$failed" ]; then
  # A first attempt whose only failures are jobs that never got a runner is re-run
  # once by nightly-retry.yml; the retry's own alert reports its result.
  if [ "${RUN_ATTEMPT:-1}" = 1 ] && [ -n "${RUN_ID:-}" ] && "$(dirname "$0")/nightly-retry.sh" check "$RUN_ID" 1; then
    echo "nightly: only jobs without a runner failed; retrying once before reporting"
    exit 0
  fi
  body=$(printf 'The nightly run failed: %s\n\nFailed jobs:\n%s\n' "$RUN_URL" "$(printf '%s\n' "$failed" | sed -e 's/^  /  - /' -e t -e 's/^/- /')")
  if [ -n "$open" ]; then
    gh_ issue comment "$open" --body "$body"
  else
    gh_ label create "$label" --color B60205 --description "The nightly workflow is red" --force
    gh_ issue create --title "$title" --label "$label" --body "$body"
  fi
  echo "nightly failed: $failed"
  exit 0
fi

if [ -n "$open" ]; then
  gh_ issue close "$open" --comment "The nightly run is green again: $RUN_URL"
fi
echo "nightly green"
