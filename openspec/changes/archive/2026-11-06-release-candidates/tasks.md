# Tasks

## 1. Release preparation

- [x] 1.1 `prepare.mjs` accepts `x.y.z-rc.N`: a candidate writes only its `CHANGELOG.md` section and link and keeps the fragments (D1, D2); verify `node --test scripts/release/prepare.test.mjs` ("a release candidate only adds its CHANGELOG.md section")
- [x] 1.2 The final release drops its candidates' sections and links; ordering and open-candidate refusals before any write (D2, D3); verify `node --test scripts/release/prepare.test.mjs` ("the changelog of a candidate and of the release after it")
- [x] 1.3 `runGates`: the gates for the base version, the device record and screen-reader passes as warnings on a candidate (D4); `accessibilityAudit.mjs` `candidate` option; verify `node --test scripts/release/accessibilityAudit.test.mjs scripts/release/prepare.test.mjs` ("on a release candidate the other gates stay strict")

## 2. Release workflow and docs

- [x] 2.1 `claude-plugin` and `obsidian-plugin` jobs skip candidate tags (D5); verify `node --test scripts/repo-checks.test.mjs`
- [x] 2.2 RELEASING.md (Release candidates), `changelog.d/README.md`; changelog fragment; verify `make repo-check docs-check`
- [x] 2.3 `make openspec-validate`, `node --test scripts/release/*.test.mjs`, `make deploy-check`
