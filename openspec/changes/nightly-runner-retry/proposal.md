# Proposal

## Why

The nightly run of 2026-11-12 was reported red (issue #1235) although nothing failed: GitHub never gave the two macOS jobs of `app-native` a runner ("The job was not acquired by Runner of type hosted even after multiple attempts", with a notice about macOS arm64 capacity) and cancelled them after 15 minutes without running a step. A shortage of hosted runners says nothing about the code, and re-running the jobs passes, but the alert treats it like a failure and opens the `ci-nightly` issue.

## What Changes

- **Alert:** a first attempt whose only unsuccessful jobs never got a runner (no runner name, no steps) is not reported; `scripts/nightly-alert.sh` says it will be retried.
- **Retry:** a new workflow, `nightly-retry.yml`, runs when Nightly completes; for a failed first attempt of that kind it re-runs the failed and cancelled jobs once (`gh run rerun --failed`), which runs the alert again on the second attempt. A job that failed on a runner is never re-run, and a second attempt is never retried.

## Capabilities

### Modified Capabilities

- `self-hosting`: "Nightly failures are reported" gains the retry of jobs that never got a runner.

## Out of scope

Retrying real failures, retries on pull request or push runs, and self-hosted macOS runners.

## Roadmap

A CI fix outside the roadmap's milestones (issue #1235).
