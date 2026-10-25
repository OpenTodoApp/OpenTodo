#!/usr/bin/with-contenv bashio
# shellcheck shell=bash
# Turns the add-on options into OpenTodo's OPENTODO_* variables and starts OpenTodo.
# The options are read from /data/options.json, which the Supervisor writes before every
# start. OpenTodo keeps its database, attachments and secrets in /data, the add-on's own
# folder, which Home Assistant includes in the add-on's backup.
set -euo pipefail

OPTIONS=/data/options.json

# option <key>: the option's value, or nothing when it is unset or empty.
option() {
    jq -r --arg k "$1" '.[$k] // empty | tostring' "${OPTIONS}"
}

value="$(option base_url)"
if [ -n "${value}" ]; then export OPENTODO_BASE_URL="${value}"; fi
value="$(option setup_token)"
if [ -n "${value}" ]; then export OPENTODO_SETUP_TOKEN="${value}"; fi
value="$(option trusted_proxies)"
if [ -n "${value}" ]; then export OPENTODO_TRUSTED_PROXIES="${value}"; fi
if [ "$(option allow_signup)" = "true" ]; then
    export OPENTODO_ALLOW_SIGNUP=true
else
    export OPENTODO_ALLOW_SIGNUP=false
fi
value="$(option log_level)"
export OPENTODO_LOG_LEVEL="${value:-info}"

bashio::log.info "Starting $(/usr/bin/opentodo version)"
exec /usr/bin/opentodo
