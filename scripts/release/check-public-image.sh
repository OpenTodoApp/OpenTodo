#!/bin/sh
# Checks that a published image can be pulled without signing in: ghcr.io hands out
# an anonymous pull token only for a public package, and the tag's manifest must then
# answer 200. A package left private (as the Home Assistant add-on's image was after
# the move to OpenTodoApp) makes every install fail with 401, so the release fails
# here instead. Retries a few times while the registry catches up after a push.
# Usage: scripts/release/check-public-image.sh <owner/name> <tag>
# REGISTRY (default https://ghcr.io), ATTEMPTS (default 5) and DELAY (seconds,
# default 10) are for tests.
set -eu
repo=$(printf '%s' "${1:?image repository, like opentodoapp/opentodo}" | tr '[:upper:]' '[:lower:]')
tag=${2:?tag}
registry=${REGISTRY:-https://ghcr.io}
attempts=${ATTEMPTS:-5}
delay=${DELAY:-10}
body=$(mktemp)
trap 'rm -f "$body"' EXIT

accept='application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.oci.image.manifest.v1+json,application/vnd.docker.distribution.manifest.v2+json'

i=1
while :; do
  token_status=$(curl -sS -o "$body" -w '%{http_code}' "$registry/token?scope=repository:$repo:pull") || token_status=000
  manifest_status=skipped
  if [ "$token_status" = 200 ]; then
    token=$(sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$body")
    manifest_status=$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" -H "Accept: $accept" \
      "$registry/v2/$repo/manifests/$tag") || manifest_status=000
    if [ "$manifest_status" = 200 ]; then
      echo "ghcr.io/$repo:$tag can be pulled anonymously."
      exit 0
    fi
  fi
  [ "$i" -ge "$attempts" ] && break
  i=$((i + 1))
  sleep "$delay"
done

echo "::error::ghcr.io/$repo:$tag cannot be pulled without signing in (anonymous token: HTTP $token_status, manifest: HTTP $manifest_status)." >&2
if [ "$manifest_status" = 404 ]; then
  echo "The package is readable but has no tag $tag: the push did not publish it." >&2
else
  echo "The package is probably private. Make it public: the organization's Packages, $repo, Package settings, Change visibility, Public. Every install pulls it anonymously and fails with 401 until then." >&2
fi
exit 1
