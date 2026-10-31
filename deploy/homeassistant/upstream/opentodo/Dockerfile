# https://contributors.home-assistant.io/apps/guides/dockerfile/
# OpenTodo is a static Go binary; its own image is distroless (no shell). The add-on copies the
# binary from the released image onto the Home Assistant base image, whose s6 init and bashio
# turn the add-on options into OPENTODO_* variables (run.sh). Releases up to 0.14.2 come from
# ghcr.io/pixari/opentodo, later ones from ghcr.io/opentodoapp/opentodo (scripts/bump.sh).
ARG OPENTODO_VERSION=0.18.1
FROM ghcr.io/opentodoapp/opentodo:${OPENTODO_VERSION} AS opentodo

FROM ghcr.io/home-assistant/base:3.24

COPY --from=opentodo /opentodo /usr/bin/opentodo
COPY run.sh /run.sh

ENV OPENTODO_ADDR=:8080 \
    OPENTODO_DATA_DIR=/data

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["/usr/bin/opentodo", "healthcheck"]
CMD ["/run.sh"]

LABEL \
    org.opencontainers.image.title="Home Assistant App: OpenTodo" \
    org.opencontainers.image.description="Open-source, local-first task manager." \
    org.opencontainers.image.source="https://github.com/OpenTodoApp/opentodo-homeassistant-addons" \
    org.opencontainers.image.licenses="AGPL-3.0-only"
