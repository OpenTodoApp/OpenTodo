# Nightly alerts: a red nightly is fixed and reported

## Why

The nightly race-detector run has failed four nights in a row on a data race inside a test (`TestMCPBridgeStaleKey` polled a plain `bytes.Buffer` while the bridge goroutine wrote to it). Nobody noticed, because a failed scheduled run only shows in the Actions tab. While the job is red for a known reason, a real race in the schedulers or the sync hub would not stand out.

## What Changes

- The test reads the bridge's output through a mutex-guarded buffer. With that race gone, the race detector found a real one: the backup service published its in-progress run as a pointer to the struct the backup goroutine keeps filling in, while the backup status route copied it; it now publishes a copy.
- The nightly workflow gets an `alert` job that runs after every other nightly job: on a failure it opens one issue labelled `ci-nightly` (or comments on the open one) with the run link and the failed jobs; on a green night it closes that issue. It uses only `GITHUB_TOKEN`, with `issues: write` on that job alone.
- The repository checks require the alert job to need every other nightly job.

## Out of scope

- Running the race detector on pull requests.
- Notifications outside GitHub (email, chat).

## Roadmap

Quality work behind every ROADMAP.md item (improvement plan wave 3, F8); no feature item.

## Capabilities

### New Capabilities

### Modified Capabilities
- `self-hosting`: the nightly checks report their result as a GitHub issue.

## Impact

`internal/cli/encryption_test.go`, `.github/workflows/nightly.yml`, `scripts/nightly-alert.sh`, `scripts/repo-checks.test.mjs`. No change to the app, the binary or the image.
