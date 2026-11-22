# CI: pull requests run the fast tier, the merge queue runs the rest

## Why

Since 21 Nov every change reaches `main` through the merge queue, and the queue runs the same pull request tier again on the change merged onto the queue's base. So every browser, workbench, accessibility and phone job runs twice per change: once on the pull request, once in the queue. Measured over the last 20 completed runs of each (22 Nov):

- Pull request run: wall time median 14.3 min (p90 22.9), 69 runner-minutes median.
- Merge queue run: wall time median 22.1 min (p90 31.1), 100 runner-minutes median.
- The longest jobs are the same in both: Web 8 min, UI check 7.5 min a leg (three legs plus Storybook), Layout check 6.5 to 7 min a leg (three legs), Accessibility 6 min, Server 5.5 min, Docker image 4 min.
- Jobs wait for a runner: median 0.6 min on pull requests and 1.8 min in the queue, p90 4.0 and 9.2 min; 174 of 365 queue jobs waited more than 2 minutes. The two runs compete for the same runners, so the duplicate work also slows down the run that gates `main`.

## What Changes

- A pull request, draft or not, runs the **fast tier**: the repository checks, and for code the web (typecheck, lint, unit tests, docs), web build, web scale, server, image and one binary jobs; the docs website, extension, Obsidian plugin and skill jobs for their own paths. That is today's draft tier, now for every pull request.
- The **merge queue** runs the whole path tier for what the queued change adds, heavy jobs included: the Chromium layout and end-to-end job, the workbench accessibility and visual checks, the accessibility gate on real screens, Android and iOS. Its "CI result" stays the one required check, so nothing reaches `main` without them.
- A push to `main`, release tags, the nightly run and a run by hand are unchanged.
- `ready_for_review` no longer starts a run, because a draft and a ready pull request now run the same tier.

## Effect

- A pull request's checks: about 9 min of critical path (Web), with roughly half the runner-minutes (about 30 to 35 instead of 69), so the run that gates `main` competes with fewer pull request jobs.
- What is caught later: a layout, workbench, accessibility or phone failure shows up in the queue instead of on the pull request. The queue then removes the change, the author fixes it, and it is queued again. The failing run's report artifacts (for example `ui-check-report-<shard>` with the new screenshots) are on the queue run. Someone who wants these checks before queueing can run the workflow by hand with `base: main` on their branch.

## Out of scope

- Running only the unit tests a change touches (`vitest --changed`): a separate change, once its misses are measured.
- Repository settings: the ruleset, the required check and the merge queue configuration stay as they are.
- A push to `main` still runs the path tier although the queue just tested the same tree; dropping that is a separate change, because the push run is also what publishes the image.

Advances the ROADMAP's CI and release-hygiene work; no runtime change, no op log or environment change.
