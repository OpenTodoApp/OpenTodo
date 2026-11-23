# Fewer jobs in a row on pull requests

## Why

After ci-pr-fast-tier, a pull request uses a third of the runner time it did, but its wall time follows runner supply: the longest path is changed paths → web build → server → binaries → site bundle, and each job waits for a runner of its own (on 22 November the longest wait in a run had a median of 12 minutes). The binaries job builds the same linux/amd64 server and `ot` the server job already builds and smoke-tests, so on a pull request it catches nothing new. The site bundle does catch one kind of error, a change that breaks `scripts/site-bundle.mjs` or what it packs; moving it to the queue means such a change goes green on its pull request and leaves the queue instead, which keeps `main` safe at the cost of a later report.

## What Changes

- On a pull request, the binaries and site bundle jobs no longer run. The merge queue runs both before a change lands, as it runs the other heavy jobs, and a push to `main`, a release tag, the nightly run and a run by hand run them as before.
- A pull request's longest path becomes changed paths → web build → server (or the image), three waits instead of four (five when a change touches code and docs).
- `docs/contributing/tests-and-checks.md` says so.

## Out of scope

- The image job, which catches Dockerfile and vulnerability failures on a pull request.
- Runner supply and the queue's timeout.

No product change, no new dependency, no new environment variable. The preview bundle on `main` (site-bundle "Preview bundle for unreleased changes") is unchanged.
