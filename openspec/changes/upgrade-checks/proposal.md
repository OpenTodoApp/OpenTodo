# Upgrade checks: data written by released versions is migrated and read back

## Why

Migrations are tested one at a time, by dropping tables and lowering `user_version` in a database the current code created. Nothing checks data written by an actual released binary: a migration that loses a column, an op the new schema refuses, a token or password hash the new auth code cannot read, would only show up on a user's server after they pulled the new image.

## What Changes

- `scripts/upgrade-check.mjs` (`make upgrade-check`): for each released version (by default the three newest and v0.6.1, the oldest with a server binary), download the release's own linux-amd64 server binary, check it against the release's `SHA256SUMS`, start it on a fresh data directory and write an account's data through its API (owner, API token, nested projects, section, label, tasks with every common field, subtask, completed and deleted tasks, comment, saved view, as sync ops). Keep its export and full op log, stop it, start the server under test on the same directory, and require: the newest schema version, the token and the password still working, every exported row and field and every op unchanged (new fields allowed), and a new write accepted.
- It runs nightly (`.github/workflows/nightly.yml`, so a failure opens the `ci-nightly` issue) and on pull requests that touch `internal/store`, `internal/sync`, `internal/auth` or the export.

## Out of scope

- Restoring backup archives produced by old releases.
- Releases without a server binary (before v0.6) and other platforms than linux-amd64.
- Committed golden data directories: the releases' own binaries produce the data on each run.

## Roadmap

Quality work behind every ROADMAP.md item (improvement plan wave 3, G2); no feature item.

## Capabilities

### New Capabilities

### Modified Capabilities
- `self-hosting`: upgrades from released versions are checked with data those versions wrote.

## Impact

`scripts/upgrade-check.mjs`, `scripts/README.md`, `Makefile` (`upgrade-check`), `.github/workflows/nightly.yml` (an `upgrade` job and a pull request trigger limited to those paths; the race job stays nightly only), `scripts/repo-checks.test.mjs`, `.gitignore` (`.cache/`). Downloads about 20 MB per release from GitHub releases in CI only. Uses Node 22's built-in `node:sqlite` to read `user_version`; no new dependency. No change to the app, the binary or the image.
