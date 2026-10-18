# Templates for six more ways to run OpenTodo

## Why

After the platform catalogs (Unraid, CasaOS, Umbrel, TrueNAS, Runtipi, Dokploy, Easypanel, Portainer, Cosmos), the common ways people still run a single container are Kubernetes, Podman with systemd, CapRover, Fly.io, Render and Synology's Container Manager. Each gets the same treatment: a checked template and a guide, so a user of that platform starts from a file that works instead of translating the Docker instructions.

## What Changes

| Platform | Where it goes | Image |
| --- | --- | --- |
| Kubernetes (Helm) | chart published as an OCI artifact on GHCR by a release workflow, listed on Artifact Hub | decided in design |
| Podman Quadlet | a unit file users copy into their systemd directory; `podman auto-update` follows the tag | `stable` |
| CapRover | PR to caprover/one-click-apps | decided in design |
| Fly.io | `fly.toml` used with `fly launch` or `fly deploy` | `stable` |
| Render | a Blueprint (`render.yaml`) | `stable` |
| Synology Container Manager | a compose project | `stable` |

Each platform has `deploy/<platform>/`, a checker `scripts/deploy/<platform>.mjs` with tests, a guide in `docs/self-hosting/`, and submission notes where a catalog exists.

Not **BREAKING**: no server, client, image, environment variable or op log change. The Helm chart adds a release workflow that publishes the chart; the image is unchanged.

## Out of scope

- Railway, Zeabur and other hosted catalogs whose templates are created from an account in their dashboard; revisit with the maintainer.
- Proxmox VE community scripts and YunoHost, as before.
- Submitting to the catalogs: the maintainer does it from their account.

## Impact

- New: `deploy/{helm,podman,caprover,fly,render,synology}/`, their checkers and tests, `docs/self-hosting/{kubernetes,podman,caprover,fly,render,synology}.md`, `.github/workflows/helm.yml`.
- Changed: `deploy/README.md`, `docs/README.md`, `README.md`, `CHANGELOG.md`.
