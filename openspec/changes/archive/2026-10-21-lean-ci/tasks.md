## 1. Layout check

- [x] 1.1 Run the layout check as a matrix: Chromium at all widths, WebKit once per width (`ENGINES`, `WIDTHS`); every leg installs Chromium, which seeds the data; artifacts `layout-report-<engine>-<n>`
- [x] 1.2 Depend on `web` instead of `server`; run `make e2e` on the Chromium job only

## 2. UI check

- [x] 2.1 Split into `ui-a11y` and `ui-visual`; shard the visual comparison three ways with `--shard`, artifacts `ui-check-report-<shard>`
- [x] 2.2 Check four stories at once in `scripts/ui-check/a11y.mjs` (`CONCURRENCY`), failures sorted so the report is stable
- [x] 2.3 Make `docker` and `release` wait for `ui-a11y` and `ui-visual`; update the artifact names in `docs/design-system.md`

## 3. Verify

- [x] 3.1 Compare the pull request's CI wall time and per-job times with the runs before the change: 22–24 min before, 10.1 min after (longest job: the Chromium layout check, 7.4 min)
