#!/bin/sh
# Print the CHANGELOG.md section for a version (without the leading "v"), plus
# install pointers, for the GitHub release body. Fails if the section is missing,
# so a tag cannot be released without notes.
set -eu
version="$1"
file="${2:-CHANGELOG.md}"
section=$(awk -v v="$version" '
  /^## \[/ { if (found) exit; if (index($0, "## [" v "]") == 1) { found = 1; next } }
  found { print }
' "$file")
if [ -z "$(printf '%s' "$section" | tr -d '[:space:]')" ]; then
  echo "release-notes: no section for $version in $file" >&2
  exit 1
fi
printf '%s\n' "$section"
cat <<NOTES

---

**Install**

- Docker: \`docker run -d -p 8080:8080 -v opentodo:/data ghcr.io/pixari/opentodo:$version\`
- Binary: download \`opentodo-<os>-<arch>\` below, then run it (data goes to \`./data\`).
- Command-line client: \`ot-<os>-<arch>\`. Browser extension: \`opentodo-browser-extension.zip\`.

Verify downloads with \`sha256sum -c SHA256SUMS\`. Self-hosting guides: [docs/self-hosting](https://github.com/pixari/opentodo/tree/v$version/docs/self-hosting).
NOTES
