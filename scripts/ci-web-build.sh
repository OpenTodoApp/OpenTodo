#!/bin/sh
# The web app's CI build (ci-pr-server-builds-web): the web-build job runs it, and on a pull
# request the server job runs it instead, so a pull request waits for one runner less. Expects
# `npm ci` in web/ already. The signed file list (signed-web-app) names the version: a release
# tag the tag's version, a build of main a preview build, anything else 0.0.0-dev.
set -eu
case "${GITHUB_REF:-}" in
  refs/tags/v*) export OPENTODO_VERSION="${GITHUB_REF_NAME#v}" ;;
  refs/heads/main) export OPENTODO_BUILD=preview ;;
esac
(cd web && npm run build)
# The first load's gzip size against web/bundle-budget.json (raise it only on purpose).
node scripts/bundle-budget.mjs
# The built service worker and manifest (and no workbench code in the build): these skip
# before a build, and fail here if the build is missing.
(cd web && npm run test:built)
