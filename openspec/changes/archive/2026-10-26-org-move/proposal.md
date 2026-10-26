# Move to the OpenTodoApp organization

## Why

The repositories moved from the GitHub user `pixari` to the organization `OpenTodoApp` (`github.com/OpenTodoApp/OpenTodo`, plus the website, the Home Assistant integration and add-on repositories, the Runtipi and Unraid stores, the n8n nodes and the Claude Code marketplace). GitHub redirects web and git addresses, but the container registry does not: CI now publishes `ghcr.io/opentodoapp/opentodo`, while every existing install pulls `ghcr.io/pixari/opentodo`. Without a transition those installs would silently stop getting updates.

## What Changes

- The Go module becomes `github.com/OpenTodoApp/opentodo` (the repository segment stays lower case, as the module always used `opentodo`).
- The image is `ghcr.io/opentodoapp/opentodo` and the Helm chart `oci://ghcr.io/opentodoapp/charts/opentodo`. Every template, upstream copy, guide and link names the new home.
- Through the 0.16 releases CI also publishes every image (signed) and chart under the old names, and `Promote stable` moves the old `stable` too, with the optional secret `GHCR_LEGACY_TOKEN` and a warning, never a failed release, when the old packages refuse the push (`scripts/legacy-image.sh`, window in `deploy/deploy.json` `legacy`).
- `Promote stable` copies a release published only under the old name (0.14.2 and earlier) to the new one first, digest and signatures unchanged, so `stable` and the pinned templates exist under the new name before the next release.
- Digest-pinned references to a release from before the move keep the old name (Umbrel's `0.14.2@sha256:…`, the Home Assistant add-on's `FROM` for 0.14.2); `scripts/deploy/pin.mjs` and the add-on's `bump.sh` write the new name from the next release on.
- The signature check in the docs accepts both workflow identities.

No new mandatory environment variable, no change to the op log, routes or data.

## Out of scope

- Update pull requests to the stores that list OpenTodo (Umbrel, CasaOS, TrueNAS, Runtipi, Unraid, Coolify, Dokploy, Easypanel, Portainer, Cosmos, Artifact Hub, the Home Assistant add-on): sent by the owner after the first release under the new name.
- Removing the legacy publishing after 0.16.

## Capabilities

### Modified Capabilities

- `self-hosting`: new image and chart names, the legacy publishing window, digest pins from before the move.
- `claude-plugin`: the marketplace repository is `OpenTodoApp/opentodo-claude`.
- `rich-text-editing`: the issue chip example uses the new repository.
