# syntax=docker/dockerfile:1.7
# Single-container build: static Go binary with the compiled web app embedded.
# Final image is distroless (no shell, non-root) and well under 50 MB.

# Base images are pinned by digest next to their tag (OpenSpec ci-release-gates), so a
# rebuild of the same commit uses the same bases; Dependabot proposes new digests. The
# golang tag names the go.mod toolchain (scripts/repo-checks.test.mjs keeps them equal).

# ---- 1. web app -------------------------------------------------------------
# Build stages run on the builder's native platform; Go cross-compiles for the
# target, so a multi-arch build never emulates a compiler under QEMU.
FROM --platform=$BUILDPLATFORM node:26-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
# Shared test fixtures the web type check imports (Go and TS activity rules and
# statistics definitions, synced and encrypted fields must agree).
COPY internal/activity/testdata/activity_fixture.json /src/internal/activity/testdata/activity_fixture.json
COPY internal/digest/testdata/stats_fixture.json /src/internal/digest/testdata/stats_fixture.json
COPY internal/digest/testdata/next_action_fixture.json /src/internal/digest/testdata/next_action_fixture.json
COPY internal/flow/testdata/flow_fixture.json /src/internal/flow/testdata/flow_fixture.json
COPY internal/sync/testdata/schema_fixture.json /src/internal/sync/testdata/schema_fixture.json
COPY internal/origin/testdata/origin_vectors.json /src/internal/origin/testdata/origin_vectors.json
COPY internal/sync/testdata/workspaces_fixture.json /src/internal/sync/testdata/workspaces_fixture.json
COPY internal/filter/testdata/limits.json /src/internal/filter/testdata/limits.json
COPY internal/notesearch/testdata/vectors.json /src/internal/notesearch/testdata/vectors.json
# The signed web app (signed-web-app): the official keys built into the service worker,
# and the page policy the worker writes (equal to the server's cspBase).
COPY internal/websign/release-keys.json /src/internal/websign/release-keys.json
COPY internal/httpapi/testdata/csp_fixture.json /src/internal/httpapi/testdata/csp_fixture.json
# The in-app help is built from the guides (`npm run help`, run by `npm run build`): the
# Markdown pages and CHANGELOG.md (the release they describe), without their images.
COPY docs/ /src/docs/
COPY CHANGELOG.md /src/CHANGELOG.md
# vite writes to ../internal/web/dist (see web/vite.config.ts). The signed file list
# (signed-web-app): a v* VERSION is the list's version, OPENTODO_BUILD=preview labels a
# build of main, and the optional BuildKit secret web_signing_key (an operator's own
# key, D11) makes the build trust that key; the server stage signs with it.
ARG VERSION=dev
ARG OPENTODO_BUILD=
RUN --mount=type=secret,id=web_signing_key,target=/run/secrets/web_signing_key \
    mkdir -p /src/internal/web \
    && case "$VERSION" in v[0-9]*) export OPENTODO_VERSION="$VERSION" ;; esac \
    && if [ -s /run/secrets/web_signing_key ]; then export WEB_SIGNING_KEY=/run/secrets/web_signing_key; fi \
    && OPENTODO_BUILD="$OPENTODO_BUILD" npm run build

# ---- 1b. the web app the binary embeds --------------------------------------
# A release replaces this stage with the build its web-sign job signed:
# docker build --build-context web-dist=<signed dist> (signed-web-app D4).
FROM scratch AS web-dist
COPY --from=web /src/internal/web/dist /

# ---- 2. server --------------------------------------------------------------
FROM --platform=$BUILDPLATFORM golang:1.27.3-alpine@sha256:f2c872bcee949b7be9c490efd02b48a8a2fbf947cdf533f1c58525ec9d8170fd AS build
ARG VERSION=dev
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY cmd/ cmd/
COPY internal/ internal/
COPY --from=web-dist / internal/web/dist/
# An own key (docker build --secret id=web_signing_key,src=key.pem) signs the list here,
# on the build machine; the image never holds the key.
RUN --mount=type=secret,id=web_signing_key,target=/run/secrets/web_signing_key \
    --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    if [ -s /run/secrets/web_signing_key ]; then WEB_SIGNING_KEY=/run/secrets/web_signing_key go run ./cmd/websign sign internal/web/dist; fi
# Coolify passes the git commit when the application's "Source commit availability" is
# "Available during build"; a build without VERSION then reports dev+<commit> instead of dev.
ARG SOURCE_COMMIT=
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    v="${VERSION}"; if [ "$v" = dev ] && [ -n "${SOURCE_COMMIT}" ]; then v="dev+$(printf '%.7s' "${SOURCE_COMMIT}")"; fi \
    && CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} \
    go build -trimpath -ldflags="-s -w -X main.version=${v}" -o /out/opentodo ./cmd/opentodo \
    && mkdir -p /out/data && chown 65532:65532 /out/data

# ---- 3. runtime -------------------------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot@sha256:afa5c872c891853ca7fcf1f12c3edb23f7eeef36189728842dd51042ff57f7ab
LABEL org.opencontainers.image.title="OpenTodo" \
      org.opencontainers.image.description="Your tasks, your server. Open-source, local-first task manager." \
      org.opencontainers.image.source="https://github.com/OpenTodoApp/OpenTodo" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
COPY --from=build /out/opentodo /opentodo
COPY --from=build --chown=65532:65532 /out/data /data
ENV OPENTODO_ADDR=:8080 \
    OPENTODO_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8080
USER nonroot:nonroot
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD ["/opentodo", "healthcheck"]
ENTRYPOINT ["/opentodo"]
