# Stable image tag for every platform template

## Why

The platform templates (Unraid, Coolify) name a release line such as `ghcr.io/pixari/opentodo:0.6`. Patch releases reach their users by themselves, but every minor release needs a template change, a republish of the Unraid template repository and, for existing installs, a manual edit of the tag. The maintainer wants one tag that always means "the latest release", used by every template present and future (Unraid, Coolify, and the CasaOS, Umbrel and TrueNAS templates to come), so that a release reaches every install through the platform's normal update button and no template ever needs a version bump.

`latest` cannot serve: it follows `main`, which carries unreleased work.

## What Changes

- The release job also publishes `ghcr.io/pixari/opentodo:stable`, moved on every release tag that is not a pre-release (`v0.7.0` yes, `v0.8.0-rc.1` no). The existing tags (`0.6.1`, `0.6`, `latest`) stay.
- A manual workflow, **Promote stable**, points `stable` at an already published version: to create the tag for the current release once, and to roll `stable` back if a release goes wrong.
- `deploy/deploy.json` gains `"tag": "stable"`. The shared template rule changes from "names the latest release line" to "names `stable`"; the Coolify check follows it. A check also fails if the CI's image job stops publishing `stable`.
- The Unraid and Coolify templates (and their upstream copies), the repository's `docker-compose.yml` and the README's `docker run` examples use `:stable`.
- Docs (Unraid, Coolify, Docker, deploy READMEs) say that `stable` follows releases, that every update arrives from the platform's update button with migrations applied on start, and how to pin a line (`:0.6`) or a version (`:0.6.1`) instead.

Not **BREAKING**: no new environment variable, no op log change. Existing installs keep the tag they have until their owner changes it.

## Out of scope

- Changing what `latest` means (it keeps following `main`).
- Templates for new platforms (CasaOS, Umbrel, TrueNAS): each is its own change and will use `stable`.
- Automatic publishing of the Unraid template repository from CI.

ROADMAP: advances self-hosting / easy deployment. No ROADMAP item names this change.

## Impact

- Changed: `.github/workflows/ci.yml`, new `.github/workflows/promote-stable.yml`, `deploy/deploy.json`, `scripts/deploy/common.mjs`, `scripts/coolify-template-check.mjs` and their tests, `deploy/unraid/`, `deploy/coolify/`, `docker-compose.yml`, `README.md`, `docs/self-hosting/{unraid,coolify,docker}.md`, `deploy/README.md`, `CHANGELOG.md`.
- No server, client, image content or data change.
