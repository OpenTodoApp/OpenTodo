#!/usr/bin/env bash
# Also publishes an image or a Helm chart under the legacy name, from before the repository
# moved from the user pixari to the organization OpenTodoApp, so existing installs that pull
# ghcr.io/pixari/opentodo keep getting updates (through deploy/deploy.json legacy.publishedThrough).
#
#   scripts/legacy-image.sh check <version>                      exit 0 when <version> is still published under the legacy name
#   scripts/legacy-image.sh login                                log in to ghcr.io for the legacy names
#   scripts/legacy-image.sh image <source ref> <tag>... [--sign] copy the image to ghcr.io/pixari/opentodo:<tag>... (and sign it)
#   scripts/legacy-image.sh chart <chart.tgz> <artifacthub-repo.yml>  push the chart to oci://ghcr.io/pixari/charts
#
# Credentials: GHCR_LEGACY_TOKEN (a classic personal access token of the user pixari with
# write:packages) when it is set, otherwise GITHUB_TOKEN. The legacy push never fails the
# workflow: when it is refused, the script prints a ::warning:: and exits 0.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
facts="${root}/deploy/deploy.json"
# One string of deploy/deploy.json, such as legacy.image.
fact() {
  node -e 'const v = process.argv[2].split(".").reduce((o, k) => o?.[k], require(process.argv[1])); if (typeof v !== "string") process.exit(1); console.log(v)' "${facts}" "$1"
}
legacy_image="$(fact legacy.image)"
current_image="$(fact image)"
through="$(fact legacy.publishedThrough)"
legacy_owner="$(printf '%s' "${legacy_image}" | cut -d/ -f2)"
legacy_charts="ghcr.io/${legacy_owner}/charts"

warn() { echo "::warning title=Legacy image::$*"; }

# The newest release this run belongs to: the tag for a release, otherwise the chart's version
# (the latest release; main builds stop being mirrored once a release after `through` is out).
version_of_run() {
  case "${GITHUB_REF:-}" in
    refs/tags/v*) printf '%s' "${GITHUB_REF_NAME#v}" ;;
    *) sed -n 's/^version: //p' "${root}/deploy/helm/opentodo/Chart.yaml" ;;
  esac
}

# 0 when <version> (x.y.z, maybe with a pre-release suffix) is at most `through` (x.y).
in_window() {
  local line
  line="$(printf '%s' "${1%%-*}" | cut -d. -f1,2)"
  [ "$(printf '%s\n%s\n' "${line}" "${through}" | sort -V | tail -1)" = "${through}" ]
}

# 0 when this repository publishes somewhere else than the legacy name (not a fork of the old one).
moved() {
  local here
  here="$(printf 'ghcr.io/%s' "${GITHUB_REPOSITORY:-}" | tr '[:upper:]' '[:lower:]')"
  [ "${here}" != "${legacy_image}" ] && [ "${current_image}" != "${legacy_image}" ]
}

login() {
  if [ -n "${GHCR_LEGACY_TOKEN:-}" ]; then
    printf '%s' "${GHCR_LEGACY_TOKEN}" | docker login ghcr.io --username "${legacy_owner}" --password-stdin > /dev/null
    if command -v helm > /dev/null; then printf '%s' "${GHCR_LEGACY_TOKEN}" | helm registry login ghcr.io --username "${legacy_owner}" --password-stdin; fi
    if command -v oras > /dev/null; then printf '%s' "${GHCR_LEGACY_TOKEN}" | oras login ghcr.io --username "${legacy_owner}" --password-stdin; fi
    echo "Logged in to ghcr.io with GHCR_LEGACY_TOKEN for ${legacy_owner}"
  else
    echo "GHCR_LEGACY_TOKEN is not set; trying the workflow's GITHUB_TOKEN for ${legacy_image}"
  fi
}

refused() {
  warn "could not publish to $1. Existing installs that pull it will not get this update. Add the repository secret GHCR_LEGACY_TOKEN (a classic personal access token of ${legacy_owner} with write:packages) and re-run, see docs/self-hosting/docker.md#the-move-to-opentodoapp."
  exit 0
}

cmd="${1:-}"
shift || true
case "${cmd}" in
  check)
    version="${1:-$(version_of_run)}"
    if ! moved; then echo "This repository publishes ${legacy_image} itself; nothing to mirror."; exit 1; fi
    if ! in_window "${version}"; then echo "${version} is after ${through}: the legacy name ${legacy_image} is no longer updated."; exit 1; fi
    echo "${version} is also published as ${legacy_image} (through ${through})."
    ;;
  login)
    login
    ;;
  image)
    src="$1"; shift
    sign=false
    names=()
    for a in "$@"; do
      if [ "${a}" = --sign ]; then sign=true; else names+=("${legacy_image}:${a}"); fi
    done
    [ "${#names[@]}" -gt 0 ] || { echo "no tags" >&2; exit 2; }
    args=()
    for n in "${names[@]}"; do args+=(-t "${n}"); done
    if ! docker buildx imagetools create "${args[@]}" "${src}"; then refused "${legacy_image}"; fi
    echo "Published ${src} as ${names[*]}"
    if [ "${sign}" = true ]; then
      # The digest the legacy name now points at (a copy keeps the index, so it is the source's digest).
      digest="$(docker buildx imagetools inspect "${names[0]}" --format '{{.Manifest.Digest}}')" || refused "${names[0]}"
      if ! cosign sign --yes "${legacy_image}@${digest}"; then refused "the signature of ${legacy_image}@${digest}"; fi
      echo "Signed ${legacy_image}@${digest}"
    fi
    ;;
  chart)
    tgz="$1"; meta="$2"
    if ! helm push "${tgz}" "oci://${legacy_charts}"; then refused "oci://${legacy_charts}"; fi
    if ! (cd "$(dirname "${meta}")" && oras push "${legacy_charts}/opentodo:artifacthub.io" \
      --config /dev/null:application/vnd.cncf.artifacthub.config.v1+yaml \
      "$(basename "${meta}")":application/vnd.cncf.artifacthub.repository-metadata.layer.v1.yaml); then
      refused "the Artifact Hub metadata in ${legacy_charts}"
    fi
    ;;
  *)
    sed -n '2,13p' "$0" >&2
    exit 2
    ;;
esac
