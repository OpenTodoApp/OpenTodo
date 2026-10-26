## 1. Script

- [x] 1.1 `scripts/upgrade-check.mjs`: release binary download checked against `SHA256SUMS`, seeding through the release's API, export and op log compared after the current build starts, schema version read with `node:sqlite`, a write after the upgrade; `node scripts/upgrade-check.mjs` passes for v0.14.0, v0.13.0, v0.12.0, v0.9.0 and v0.6.1
- [x] 1.2 `make upgrade-check`; `scripts/README.md`

## 2. CI

- [x] 2.1 `upgrade` job in `.github/workflows/nightly.yml`, needed by the alert job; pull request trigger on `internal/store`, `internal/sync`, `internal/auth`, the export and the script; the race job stays nightly only
- [x] 2.2 `scripts/repo-checks.test.mjs` requires the job; `node --test scripts/repo-checks.test.mjs` passes
