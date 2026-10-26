## 1. Code

- [x] 1.1 Go module `github.com/OpenTodoApp/opentodo` in `go.mod` and every import; `go build ./...`, `go vet ./...` and `go test ./...` pass
- [x] 1.2 Links in the web app (About, footer, "Report a bug"), the docs site generator and the VAPID default subject name the new repository; `npm test` and `npm run build` in `web/`

## 2. Publishing

- [x] 2.1 `scripts/legacy-image.sh` (check, login, image, chart) with the window from `deploy/deploy.json` `legacy`; `scripts/legacy-image.sh check` answers 0 for 0.16.x and main, 1 for 0.17.0 and pre-releases after it
- [x] 2.2 The `docker` job of `ci.yml`, `promote-stable.yml` and `helm.yml` also publish under the old names, a refused push being a `::warning::`
- [x] 2.3 `Promote stable` copies a release that exists only under the old name with `cosign copy` first

## 3. Templates and docs

- [x] 3.1 Every template, upstream copy and guide names `ghcr.io/opentodoapp/opentodo` and the OpenTodoApp repositories; `make deploy-check` and `node --test scripts/deploy/*.test.mjs` pass
- [x] 3.2 `release-digest` pins and the Home Assistant add-on's `FROM` keep the legacy name for releases up to `legacy.lastRelease` (`imageFor` in `scripts/deploy/common.mjs`, tests in `deploy.test.mjs`, `umbrel.test.mjs`, `homeassistant.test.mjs`); `pin.mjs` rewrites a legacy pin to the new name for a newer release
- [x] 3.3 `docs/self-hosting/docker.md` "The move to OpenTodoApp" and a CHANGELOG entry under Unreleased; `make docs-check`
