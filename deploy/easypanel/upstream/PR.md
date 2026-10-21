# Pull request to easypanel-io/templates

Title:

```
Add OpenTodo template
```

Body:

```markdown
Adds [OpenTodo](https://open-todo.app), an open-source (AGPL-3.0), self-hosted, local-first task manager. It is one container with SQLite built in: no database service is needed. I am its maintainer.

- Image: `ghcr.io/pixari/opentodo:0.9.0`, the official image built by the project's release workflow (amd64 and arm64).
- One app service: domain on port 8080, volume `data` on `/data`.
- `OPENTODO_BASE_URL=https://$(PRIMARY_DOMAIN)` so passkeys, secure cookies and links use the service's domain.
- `OPENTODO_SETUP_TOKEN` is generated (`randomString(32)`): the first visitor needs it to create the owner account, so a fresh deployment cannot be claimed by a stranger. The instructions say where to find it.

Checklist

- [x] Logo: the logo mark, square (SVG)
- [x] Screenshot: the board view with tasks
- [x] meta.yaml: specific version, website/docs/GitHub links, instructions, official image
- [x] index.ts: no unused variables, no hardcoded secrets, volume for the data
- [ ] Tested in the templates playground
- [ ] Tested on an Easypanel instance
- [x] `npm run build` and `npx prettier --check templates/opentodo` pass
```
