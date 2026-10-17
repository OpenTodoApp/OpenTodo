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
COPY internal/sync/testdata/schema_fixture.json /src/internal/sync/testdata/schema_fixture.json
# vite writes to ../internal/web/dist (see web/vite.config.ts)
RUN mkdir -p /src/internal/web && npm run build

# ---- 2. server --------------------------------------------------------------
FROM --platform=$BUILDPLATFORM golang:1.27.2-alpine@sha256:f92b6ef800e499660581efdabdf25d9d817a9d124eaf900924f0504e7e27e12d AS build
ARG VERSION=dev
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY cmd/ cmd/
COPY internal/ internal/
COPY --from=web /src/internal/web/dist internal/web/dist
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
      org.opencontainers.image.source="https://github.com/pixari/opentodo" \
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
