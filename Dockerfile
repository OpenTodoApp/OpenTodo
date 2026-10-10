# syntax=docker/dockerfile:1.7
# Single-container build: static Go binary with the compiled web app embedded.
# Final image is distroless (no shell, non-root) and well under 50 MB.

ARG GO_VERSION=1.26
ARG NODE_VERSION=22

# ---- 1. web app -------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
# vite writes to ../internal/web/dist (see web/vite.config.ts)
RUN mkdir -p /src/internal/web && npm run build

# ---- 2. server --------------------------------------------------------------
FROM golang:${GO_VERSION}-alpine AS build
ARG VERSION=dev
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY cmd/ cmd/
COPY internal/ internal/
COPY --from=web /src/internal/web/dist internal/web/dist
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} \
    go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /out/opentodo ./cmd/opentodo \
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
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD ["/opentodo", "healthcheck"]
ENTRYPOINT ["/opentodo"]
