# The server job builds the web app on pull requests

## Why

After ci-pr-shorter-chain, a pull request's longest path is changed paths → web build → server, and each of these jobs waits for a runner of its own: on 22 November the longest wait in a run had a median of 12 minutes. On a pull request the web build has one consumer left, the server job. The layout, accessibility and binary jobs that also read `web-dist` run only in the merge queue. A job of its own then costs a runner wait and saves nothing.

## What Changes

- On a pull request, the web-build job is skipped and the server job builds the web app itself (build, bundle budget, tests of the built app) before its Go steps. In the merge queue, on pushes, tags, the nightly run and runs by hand, web-build runs as before and the server job downloads `web-dist`.
- On a pull request, `node_modules` is removed again after the build, so the Go steps' `./...` never includes the Go code some npm packages ship.
- Both jobs run the same script, `scripts/ci-web-build.sh`, so the two builds cannot drift apart.
- A pull request's longest path becomes changed paths → server: two runner waits instead of three.

## Out of scope

- The image job, which builds the web app inside its Dockerfile.
- Runner supply and the queue's timeout.

No product change, no new dependency, no new environment variable. The checks a pull request runs are the same; only where the web build runs changes.
