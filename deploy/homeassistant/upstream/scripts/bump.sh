#!/usr/bin/env bash
# Usage: scripts/bump.sh <opentodo-version>
# Points the add-on at an OpenTodo release: the OpenTodo image in the Dockerfile, the
# add-on version in config.yaml and a changelog entry. Used by the Follow OpenTodo workflow
# and by hand; running it twice with the same version changes nothing.
set -euo pipefail

version="${1:?usage: scripts/bump.sh <opentodo-version>, such as 0.13.0}"
if ! [[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "not a release version: ${version}" >&2
    exit 1
fi
cd "$(dirname "$0")/../opentodo"

sed -i -E "s/^ARG OPENTODO_VERSION=.*/ARG OPENTODO_VERSION=${version}/" Dockerfile
sed -i -E "s/^version: .*/version: \"${version}\"/" config.yaml

if ! grep -q "^## ${version}\$" CHANGELOG.md; then
    entry="## ${version}\n\n- OpenTodo [${version}](https://github.com/pixari/opentodo/releases/tag/v${version}).\n"
    awk -v entry="${entry}" '!done && /^## / { printf "%s\n", entry; done = 1 } { print }' CHANGELOG.md > CHANGELOG.md.new
    mv CHANGELOG.md.new CHANGELOG.md
fi
