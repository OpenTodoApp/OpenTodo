#!/usr/bin/env bash
# Reports the result of the nightly workflow as one GitHub issue labelled
# ci-nightly: a failed night opens it (or comments on the open one), a green
# night closes it. Runs in .github/workflows/nightly.yml with GITHUB_TOKEN.
#
# Environment:
#   RESULTS  the workflow's `needs` context as JSON ({"job":{"result":"failure"},...})
#   RUN_URL  link to the run
#   GH_TOKEN token for the gh CLI (issues: write)
#   DRY_RUN  when set, print the gh commands instead of running them
set -euo pipefail

label=ci-nightly
title="Nightly CI is failing"

gh_() {
  if [ -n "${DRY_RUN:-}" ]; then echo "gh $*"; else gh "$@"; fi
}

failed=$(node -e '
  for (const [job, { result }] of Object.entries(JSON.parse(process.argv[1])))
    if (result !== "success" && result !== "skipped") console.log(`${job} (${result})`)
' "$RESULTS")
open=$(gh issue list --label "$label" --state open --json number --jq '.[0].number // empty' 2>/dev/null || true)

if [ -n "$failed" ]; then
  body=$(printf 'The nightly run failed: %s\n\nFailed jobs:\n%s\n' "$RUN_URL" "$(printf '%s\n' "$failed" | sed 's/^/- /')")
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
