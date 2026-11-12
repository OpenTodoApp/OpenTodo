#!/usr/bin/env bash
# Tells a nightly run whose only failures are jobs GitHub never gave a runner (a
# hosted runner shortage, most often macOS: "The job was not acquired by Runner of
# type hosted even after multiple attempts") from a real failure, and retries such a
# run once. Used by the nightly alert (scripts/nightly-alert.sh), which stays quiet
# about a first attempt that will be retried, and by .github/workflows/nightly-retry.yml,
# which re-runs it.
#
#   nightly-retry.sh check RUN_ID ATTEMPT   exit 0 when every finished job of the attempt
#                                           that did not pass or skip never got a runner
#                                           (and at least one did not), 1 otherwise
#   nightly-retry.sh rerun RUN_ID           re-run the run's failed and cancelled jobs
#
# Environment: GH_TOKEN (actions: read for check, actions: write for rerun),
# GITHUB_REPOSITORY (owner/name); DRY_RUN prints the rerun instead of running it.
set -euo pipefail

repo=${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}

case "${1:-}" in
  check)
    run=${2:?run id}
    attempt=${3:?attempt}
    # One line per finished job that did not pass or skip: "unacquired" when it never
    # had a runner or a step, "failed" otherwise. A job still running (the alert
    # itself) has no conclusion yet and is left out.
    verdicts=$(gh api "repos/$repo/actions/runs/$run/attempts/$attempt/jobs" --paginate --jq '
      .jobs[] | select(.conclusion != null and .conclusion != "success" and .conclusion != "skipped")
      | if ((.runner_name // "") == "" and (.steps | length) == 0) then "unacquired \(.name)" else "failed \(.name)" end')
    printf '%s\n' "$verdicts" | sed '/^$/d'
    [ -n "$verdicts" ] && ! printf '%s\n' "$verdicts" | grep -q '^failed '
    ;;
  rerun)
    run=${2:?run id}
    if [ -n "${DRY_RUN:-}" ]; then echo "gh run rerun $run --failed"; else gh run rerun "$run" --failed -R "$repo"; fi
    ;;
  *)
    echo "usage: $0 check RUN_ID ATTEMPT | rerun RUN_ID" >&2
    exit 2
    ;;
esac
