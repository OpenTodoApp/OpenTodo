#!/usr/bin/env bash
# Usage: scripts/bump.sh <opentodo-version>
# Points the add-on at an OpenTodo release: the OpenTodo image and version in the Dockerfile, the
# add-on version in config.yaml and a changelog entry. Used by the Follow OpenTodo workflow
# and by hand; running it twice with the same version changes nothing.
set -euo pipefail

version="${1:?usage: scripts/bump.sh <opentodo-version>, such as 0.13.0}"
if ! [[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "not a release version: ${version}" >&2
    exit 1
fi
cd "$(dirname "$0")/../opentodo"

# OpenTodo moved to the OpenTodoApp organization after 0.14.2: earlier releases exist only as
# ghcr.io/pixari/opentodo, later ones are published as ghcr.io/opentodoapp/opentodo.
image=ghcr.io/opentodoapp/opentodo
if [ "$(printf '%s\n%s\n' "${version}" 0.14.2 | sort -V | tail -1)" = 0.14.2 ]; then
    image=ghcr.io/pixari/opentodo
fi

sed -i -E "s/^ARG OPENTODO_VERSION=.*/ARG OPENTODO_VERSION=${version}/" Dockerfile
sed -i -E 's#^FROM ghcr\.io/[a-z]+/opentodo:(\$\{OPENTODO_VERSION\}) AS opentodo$#FROM '"${image}"':\1 AS opentodo#' Dockerfile
sed -i -E "s/^version: .*/version: \"${version}\"/" config.yaml

if ! grep -q "^## ${version}\$" CHANGELOG.md; then
    entry="## ${version}\n\n- OpenTodo [${version}](https://github.com/OpenTodoApp/OpenTodo/releases/tag/v${version}).\n"
    awk -v entry="${entry}" '!done && /^## / { printf "%s\n", entry; done = 1 } { print }' CHANGELOG.md > CHANGELOG.md.new
    mv CHANGELOG.md.new CHANGELOG.md
fi
