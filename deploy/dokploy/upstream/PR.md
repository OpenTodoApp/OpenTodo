# Pull request to Dokploy/templates

Submitted on 2026-10-24 as [Dokploy/templates#1265](https://github.com/Dokploy/templates/pull/1265). The title and body below are what was submitted, kept as the record of it; later updates to the app are separate pull requests (see ../README.md).

## Title

feat: add OpenTodo template

## Body

## What is this PR about?

New PR of OpenTodo

[OpenTodo](https://github.com/pixari/opentodo) is an open-source (AGPL-3.0), self-hosted, local-first task manager: one Go binary with SQLite and an embedded web app that works offline and syncs every device. The template adds `blueprints/opentodo/`:

- `docker-compose.yml`: one `opentodo` service from `ghcr.io/pixari/opentodo:0.11.0` (public, multi-arch amd64/arm64, pinned; `meta.json` version matches), `expose: 8080`, one named volume on `/data`, and the image's own health check (`/opentodo healthcheck`; the image has no shell). No `ports`, `container_name` or networks.
- `template.toml`: the generated domain on port 8080, and a generated setup token (`${password:32}`) that OpenTodo asks for when the first account (the owner) is created, so a freshly deployed instance cannot be claimed by a stranger. Sign-up is closed after that. `OPENTODO_BASE_URL` starts empty because the generated domain is plain http (OpenTodo then takes the address from the request); the comment says to set it once the domain has HTTPS.
- `meta.json` and `opentodo.svg`.

No database or other service is needed.

## Checklist

Before submitting this PR, please make sure that:

- [x] I have read the suggestions in the README.md file https://github.com/Dokploy/templates?tab=readme-ov-file#general-requirements-when-creating-a-template
- [x] I have tested the template in my instance, so the maintainers don't spend time trying to figure out what's wrong.
- [x] I have added tests that demonstrate that my correction works or that my new feature works.

How it was tested: `node build-scripts/generate-meta.js --check`, `validate-docker-compose.ts` and `validate-template.ts` pass. Then on a Dokploy v0.30.10 instance (installed inside a Docker-in-Docker host with the official install script, minus its check that refuses to run in a container), the template was created through the template flow with these exact files served as the templates base URL, and deployed:

- the container turns healthy and answers through Traefik on the generated domain;
- the owner setup refuses a wrong setup token, accepts the generated one, and sign-up is closed afterwards;
- after creating the owner and adding a task in the web app, **Stop** and **Start** in Dokploy, and a redeploy, keep the account and the task (named volume).

Then the same again from this PR's preview (https://pixari-add-opentodo.templates-70k.pages.dev as the templates base URL): created, deployed, opened on the generated `*.sslip.io` domain through Traefik, owner created with the generated token, a task added, **Stop** and **Start**, and the task was still there.

## Issues related (if applicable)

None.

## Screenshots or Videos

OpenTodo deployed from this PR's preview, after Stop and Start in Dokploy, signed in again in a fresh browser, with the task created before the restart:

![OpenTodo from the PR preview after Stop and Start in Dokploy](https://raw.githubusercontent.com/pixari/templates/pr-assets/opentodo/dokploy-preview-after-restart.png)
