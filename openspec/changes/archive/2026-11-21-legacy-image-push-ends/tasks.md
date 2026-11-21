## 1. Remove the legacy publishing

- [x] 1.1 Remove "Also publish under the legacy name" from `ci.yml` and `helm.yml` and "Retag the legacy name" from `promote-stable.yml`; `grep -rn legacy-image .github` finds nothing
- [x] 1.2 Delete `scripts/legacy-image.sh`; `make repo-check` passes
- [x] 1.3 Keep "Copy a release from before the move" in `promote-stable.yml` (it reads the public legacy image, no credential)

## 2. Words

- [x] 2.1 `deploy/deploy.json` `legacy.$comment` says the window is over; `make deploy-check` passes
- [x] 2.2 RELEASING.md and docs/self-hosting/docker.md say the legacy name received releases through 0.16.0; `make docs-check` passes
