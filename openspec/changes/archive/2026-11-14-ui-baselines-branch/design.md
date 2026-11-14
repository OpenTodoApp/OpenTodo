## Context

`scripts/ui-check/visual.spec.ts` compares every story × theme × width with a PNG under `web/src/ui/__screenshots__`. The PNGs are committed to main; Git stores each changed image whole, so history grows by the full size of every refreshed image.

## Goals / Non-Goals

**Goals:** stop main's history growing with baselines; keep one documented way to add or change a baseline; keep `make ui-check` working offline; no manual bootstrap.

**Non-Goals:** recover the space already in history; change what is captured.

## Decisions

- **One replaced branch.** `ui-baselines` holds the PNGs at its root in one parentless commit, written with `git hash-object`, `mktree` and `commit-tree` and force-pushed. Each refresh replaces it, so old images become unreachable and are dropped by GitHub's garbage collection. Alternatives: Git LFS (a dependency and quotas for every contributor and fork), fewer screenshots (slows the growth, doesn't stop it).
- **Pull requests carry only their delta.** A pull request commits its new or changed PNGs under `web/src/ui/__screenshots__`; `baselines.mjs fetch` lays them over the branch's set in `web/.ui-baselines` (ignored by git), which the Playwright config compares against. This keeps a reviewable diff of the images that change and works for forks, which can't push to the branch. Those PNGs still enter main's history once each when the pull request merges; full refreshes, the bulk of the growth, never touch main.
- **Fold after merge.** A push to main that touches `web/src/ui/__screenshots__` runs the fold job: fetch the branch, overlay main's PNGs, replace the branch, then remove the PNGs from main with one commit. One concurrency group serialises every writer of the branch, never cancelling.
- **Bootstrap by fallback.** When the branch doesn't exist, `fetch` takes main's PNGs, or main's parent's when main has just removed them. The pull request that moves the baselines therefore checks against main's set, and the fold that runs when it merges writes the branch from the parent commit.
- **Collect by hash.** `fetch` records each assembled file's SHA-1; `collect` copies the files Playwright then wrote or rewrote. `make ui-baselines` and the workflow on a branch use `--update-snapshots=changed`, so only images that differ beyond the threshold are rewritten.
- **Source.** `fetch` reads `https://github.com/OpenTodoApp/OpenTodo.git` by default, so a fork's checkout still gets the real set; the workflows use `origin`. `UI_BASELINES_REPO` overrides it.

## Risks / Trade-offs

- **Main's branch protection may refuse the fold's push** of the removal commit → the fold job fails visibly and the PNGs stay in main until removed by hand or by allowing the workflow's token. The check stays correct either way: the PNGs in main equal the branch's.
- **Two pull requests changing the same baseline** → the second to merge wins, as before.
- **A fetch failure in CI** (network) → the check falls back to main's tree, which no longer holds the set, and fails loudly rather than passing.
- Data model, image size, memory: none.
