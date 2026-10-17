# Pull request to Dokploy/templates

Base branch: `canary`. Branch in the fork: `add-opentodo-template`.

## Title

feat: add OpenTodo template

## Body

## What is this PR about?

New PR of OpenTodo

[OpenTodo](https://github.com/pixari/opentodo) is an open-source (AGPL-3.0), self-hosted, local-first task manager: one Go binary with SQLite and an embedded web app that works offline and syncs every device. The template adds `blueprints/opentodo/`:

- `docker-compose.yml`: one `opentodo` service from `ghcr.io/pixari/opentodo:stable` (amd64 and arm64; `stable` is the tag every OpenTodo release moves, and `pull_policy: always` makes **Deploy** pick up new releases), `expose: 8080`, one named volume on `/data` (works with Volume Backups), and the image's own health check (`/opentodo healthcheck`; the image has no shell).
- `template.toml`: the generated domain on port 8080, and a generated setup token (`${password:32}`) that OpenTodo asks for when the first account (the owner) is created, so a freshly deployed instance cannot be claimed by a stranger. `OPENTODO_BASE_URL` starts empty because the generated domain is plain http; the comment says when to set it.
- `meta.json` and `opentodo.svg`.

No database or other service is needed, and no variable is required.

## Checklist

Before submitting this PR, please make sure that:

- [x] I have read the suggestions in the README.md file https://github.com/Dokploy/templates?tab=readme-ov-file#general-requirements-when-creating-a-template
- [ ] I have tested the template in my instance, so the maintainers don't spend time trying to figure out what's wrong.
- [x] I have added tests that demonstrate that my correction works or that my new feature works.

Tested: `node build-scripts/generate-meta.js --check`, `validate-docker-compose.ts` and `validate-template.ts` pass. The compose file was started with `docker compose up` and an `.env` like the one Dokploy writes: it turns healthy, creating the owner account needs the generated token, sign-up is closed afterwards, and the data survives `down` and `up`. OpenTodo checks the template in its own CI.

## Issues related (if applicable)

None.

## Screenshots or Videos

<!-- Add a screenshot of OpenTodo deployed from the PR preview in your Dokploy instance, then tick "tested" above. -->
