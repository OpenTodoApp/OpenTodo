## 1. Baselines on a branch

- [x] 1.1 `scripts/ui-check/baselines.mjs` with `fetch`, `collect` and `commit` (verified: `fetch` assembles 3,056 images from main without the branch; `collect` copies one changed file; `commit` prints a parentless commit)
- [x] 1.2 Playwright compares against `web/.ui-baselines`, ignored by git
- [x] 1.3 CI's visual regression job runs `fetch` first; its report carries the `*-actual.png` images
- [x] 1.4 The UI baselines workflow folds on push to main, regenerates and replaces the branch on main, and returns the delta on other branches
- [x] 1.5 `make ui-check` and `make ui-baselines` use the branch; main's PNGs are removed, with a README in their folder
- [x] 1.6 `docs/design-system.md` "Updating baselines" describes the flow; `make docs-check` passes
