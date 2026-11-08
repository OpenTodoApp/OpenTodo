#!/bin/sh
# Collects the GitHub release assets from the downloaded CI artifacts
# (actions/download-artifact puts each artifact in <artifacts>/<name>/) into <out>,
# then writes <out>/SHA256SUMS. Only the files a release ships are copied, named
# exactly: the server and `ot` binaries, the browser extension zips, the agent and
# MCP skill zips, the signed Android APK and AAB, the site bundle and the web
# app's signed file list (signed-web-app). Anything
# else an artifact holds (the web app's build chunks, reports, a debug APK) stays
# out, and a release without all twelve binaries fails.
# Usage: scripts/release/collect-assets.sh <artifacts-dir> <out-dir>
set -eu
artifacts=${1:?artifacts directory}
out=${2:?output directory}
mkdir -p "$out"

ver='v?[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?'
allowed="^((opentodo|ot)-(linux|darwin)-(amd64|arm64)|(opentodo|ot)-windows-(amd64|arm64)\.exe|opentodo-browser-extension-(chrome|firefox)\.zip|opentodo-(agent|mcp)-skill\.zip|opentodo-android-${ver}\.(apk|aab)|opentodo-site-bundle-${ver}\.tar\.gz|opentodo-web-manifest-${ver}\.json)$"

# Release files sit at the top of their artifact, never deeper.
for f in $(find "$artifacts" -mindepth 2 -maxdepth 2 -type f | sort); do
  name=$(basename "$f")
  printf '%s\n' "$name" | grep -Eq "$allowed" || continue
  if [ -e "$out/$name" ]; then
    echo "two artifacts hold $name" >&2
    exit 1
  fi
  cp "$f" "$out/$name"
done

missing=0
for b in opentodo ot; do
  for p in linux-amd64 linux-arm64 darwin-amd64 darwin-arm64 windows-amd64.exe windows-arm64.exe; do
    if [ ! -f "$out/$b-$p" ]; then
      echo "missing release binary $b-$p" >&2
      missing=1
    fi
  done
done
[ "$missing" -eq 0 ] || exit 1

cd "$out" && sha256sum -- * > SHA256SUMS && cat SHA256SUMS
