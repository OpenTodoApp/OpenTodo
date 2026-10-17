# Design: more platform catalogs

## Decisions

### D1. Same contract as the platform catalogs

Each platform follows the structure of `platform-catalogs`: native format, strict checker, shared rules, an upstream copy where a catalog repository receives it. Platforms without a catalog (Podman, Fly.io, Render, Synology) have no `upstream/`; their template is used straight from this repository.

### D2. Image policy

`stable` wherever a redeploy or auto-update pulls the tag again: Podman's `AutoUpdate=registry`, Fly.io, Render and Synology projects. The Helm chart and the CapRover app follow their catalog's conventions, recorded in each folder's README with the evidence.

### D3. One writer

SQLite allows one writer. Templates run one instance and stop it before starting its replacement (Kubernetes `Recreate`, a single Fly machine, no autoscaling on Render).

### D4. The chart is released with the app

The chart lives in `deploy/helm/` and is published by a release workflow, so a chart version always exists for each release and no separate chart repository is needed.

## Size and data

No image, binary, runtime or data model change.

## Interface budget

No screen changes.
