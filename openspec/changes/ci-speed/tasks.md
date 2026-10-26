## 1. Interface audit off the push path

- [x] 1.1 `.github/workflows/ux-audit.yml` (pull requests that change code, nightly, on demand) with the job removed from `ci.yml` and from the `docker` and `release` needs; `node --test scripts/repo-checks.test.mjs` checks the triggers and that `ci.yml` has no audit job
- [x] 1.2 `docs/design-system.md` says where it runs

## 2. Web build first

- [x] 2.1 `web-build` job (build, built-app tests, `web-dist` artifact); `web` keeps typecheck, lint, tests and docs; downstream jobs need `web-build`

## 3. Split the long browser jobs

- [x] 3.1 Chromium layout check per width, end-to-end checks as their own leg
- [x] 3.2 `SHARD=i/n` in `scripts/ui-check/a11y.mjs`; `ui-a11y` runs two shards, motion in the first

## 4. Verify

- [x] 4.1 Compare wall time and per-job times of this pull request's CI run with earlier runs (see the pull request description)
