# syntax=docker/dockerfile:1.7
# Single-container build: static Go binary with the compiled web app embedded.
# Final image is distroless (no shell, non-root) and well under 50 MB.

ARG GO_VERSION=1.26
ARG NODE_VERSION=22

# ---- 1. web app -------------------------------------------------------------
# Build stages run on the builder's native platform; Go cross-compiles for the
# target, so a multi-arch build never emulates a compiler under QEMU.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
# Shared test fixture the web type check imports (Go and TS activity rules must agree).
COPY internal/activity/testdata/activity_fixture.json /src/internal/activity/testdata/activity_fixture.json
# vite writes to ../internal/web/dist (see web/vite.config.ts)
RUN mkdir -p /src/internal/web && npm run build

# ---- 2. server --------------------------------------------------------------
FROM --platform=$BUILDPLATFORM golang:${GO_VERSION}-alpine AS build
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
FROM gcr.io/distroless/static-debian12:nonroot
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
# --start-interval probes every 2 s while starting, so rolling updates (Coolify's Dockerfile and
# Docker Image build packs read these flags) see a healthy container within seconds. Keep it after
# --interval: Coolify finds the interval with the pattern "--interval=".
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --start-interval=2s --retries=3 CMD ["/opentodo", "healthcheck"]
ENTRYPOINT ["/opentodo"]
