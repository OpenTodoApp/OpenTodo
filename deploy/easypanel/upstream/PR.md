# Pull request to easypanel-io/templates

Submitted on 2026-10-24 as [easypanel-io/templates#1702](https://github.com/easypanel-io/templates/pull/1702). The title and body below are what was submitted, kept as the record of it; later updates to the app are separate pull requests (see ../README.md).

## Title

Add OpenTodo template

## Body

Adds [OpenTodo](https://open-todo.app), an open-source (AGPL-3.0), self-hosted, local-first task manager. It is one container with SQLite built in: no database service is needed. I am its maintainer.

- Image: `ghcr.io/pixari/opentodo:0.11.0`, the official image built by the project's release workflow (amd64 and arm64).
- One app service: domain on port 8080, volume `data` on `/data`.
- `OPENTODO_BASE_URL=https://$(PRIMARY_DOMAIN)` so passkeys, secure cookies and links use the service's domain.
- `OPENTODO_SETUP_TOKEN` is generated (`randomString(32)`): the first visitor needs it to create the owner account, so a fresh deployment cannot be claimed by a stranger. The instructions say where to find it.

Checklist

- [x] Logo: the logo mark, square (SVG)
- [x] Screenshot: the board view with tasks
- [x] meta.yaml: specific version, website/docs/GitHub links, instructions, official image
- [x] index.ts: no unused variables, no hardcoded secrets, volume for the data
- [x] Tested in the templates playground
- [x] Tested on an Easypanel instance
- [x] `npm run build` and `npx prettier --check templates/opentodo` pass

How it was tested: in the playground (`npm run build`, then the OpenTodo page, **Generate**) the output is one app service as above. That JSON was created on a fresh Easypanel v2.38.0 instance with **Templates → Custom → Create From Schema**. The service deployed and turned healthy, `OPENTODO_BASE_URL` resolved to the service's `https://…easypanel.host` domain, and on that domain the owner setup asked for the token from the Environment tab. After creating the owner and adding a task, **Deploy** and **Restart** both kept the account and the task, and sign-up was closed.

![OpenTodo on Easypanel after a restart](https://raw.githubusercontent.com/pixari/templates-1/pr-assets/opentodo/easypanel-after-restart.png)
