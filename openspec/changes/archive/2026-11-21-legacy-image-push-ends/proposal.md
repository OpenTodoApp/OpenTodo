# Stop pushing the legacy image name

## Why

After the move to the OpenTodoApp organization, CI also published every image and chart under the old names `ghcr.io/pixari/opentodo` and `oci://ghcr.io/pixari/charts/opentodo`, through the 0.16 releases (change `org-move`). That window ended with 0.16.0: every release since then reaches only the new name, and the legacy steps in `ci.yml`, `helm.yml` and `Promote stable` exit early on every run. They still name a credential for the old packages, which the owner is deleting.

## What Changes

- CI and the Helm publish no longer contain a step for the legacy names, and `Promote stable` no longer moves the legacy `stable`. `scripts/legacy-image.sh` goes.
- `Promote stable` still copies a release published only under the legacy name (0.14.2 and earlier) to the new name first, digest and signatures unchanged.
- `deploy/deploy.json` keeps `legacy` (the old name, the last release published only there, and the window, now in the past), which the digest pins of the platform templates still read.
- RELEASING.md and the self-hosting guide say the legacy name received releases through 0.16.0.

No new mandatory environment variable, no change to the op log, routes or data.

## Out of scope

- Deleting the repository credential for the old packages (the owner does it in the repository settings).
- The packages under `ghcr.io/pixari` themselves: they stay as they are, with `stable` where the window left it.
- Re-pinning the platform templates that still name a release from before the move.

## Capabilities

### Modified Capabilities

- `self-hosting`: the legacy publishing window is over.

ROADMAP.md: no item; this is release upkeep.
