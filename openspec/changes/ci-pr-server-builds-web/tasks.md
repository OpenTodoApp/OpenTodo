## 1. The server job builds the web app on pull requests

- [x] 1.1 `scripts/ci-web-build.sh` (build, bundle budget, `test:built`), run by the web-build job; `.github/workflows/ci.yml`: web-build skips `pull_request`, and the server job runs the script there and downloads `web-dist` elsewhere. Verify: `node --test scripts/repo-checks.test.mjs`; `./scripts/ci-web-build.sh` passes locally
- [ ] 1.2 After merge: the next 10 pull request runs, wall time and their longest path, compared with the numbers in the proposal
