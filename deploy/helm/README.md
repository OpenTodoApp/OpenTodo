# Kubernetes Helm chart

`opentodo/` is a Helm chart (apiVersion v2) for Kubernetes 1.23+: one Deployment with exactly one replica and the `Recreate` strategy (SQLite has one writer, so the old pod stops before the new one opens the database), a PersistentVolumeClaim on `/data` (kept on `helm uninstall`), a Service on 8080, an optional Ingress for one host, probes on `/healthz`, and a pod that runs as 65532:65532 with `fsGroup`, a read-only root filesystem (an `emptyDir` on `/tmp`), no capabilities and the default seccomp profile (Pod Security `restricted`). The four essential variables are `env.*` values, more go in `env` or `extraEnv`, and `OPENTODO_SETUP_TOKEN` comes from a generated Secret (kept across upgrades with `lookup`) or an existing one. `values.schema.json` refuses unknown keys and `image.tag: latest`. The user guide is `docs/self-hosting/kubernetes.md`.

`node scripts/deploy-check.mjs` (part of `make check`) parses `Chart.yaml`, `values.yaml` and `artifacthub-repo.yml` with the strict YAML parser and the schema with `JSON.parse`, checks the rules above in the Deployment template, the Artifact Hub annotations and the publish workflow, and applies the shared rules. When `helm` is installed (or `HELM` names it) it also runs `helm lint --strict` and `helm template`; without it the check works offline. Code in `scripts/deploy/helm.mjs`, tests in `scripts/deploy/helm.test.mjs`.

**Status: not yet published.** The first `v*` release tag after this lands publishes it.

## Image policy: `release`

The chart's `version` and `appVersion` are the OpenTodo release, and `image.tag` defaults to `appVersion`. A moving tag (`stable`) would not reach Kubernetes users: nothing restarts the pod when the tag moves, and with `IfNotPresent` a restarted pod keeps the old image on its node. With Helm, updates arrive as a new chart version through `helm upgrade` (and through Renovate, Argo CD or Flux, which watch chart versions), which is the convention on Artifact Hub (<https://artifacthub.io/docs/topics/repositories/helm-charts/>; Helm's own guidance on `appVersion`: <https://helm.sh/docs/topics/charts/#the-appversion-field>). `make check` fails until `Chart.yaml` names the latest release in `CHANGELOG.md`.

## Install it now

From a clone: `helm install opentodo ./deploy/helm/opentodo --namespace opentodo --create-namespace`. After the first release with the chart: `helm install opentodo oci://ghcr.io/pixari/charts/opentodo --namespace opentodo --create-namespace`.

## Publishing

`.github/workflows/helm.yml` lints and renders the chart on pull requests that touch `deploy/helm`. On a `v*` tag without a `-` (release candidates are skipped) it checks that `Chart.yaml` names that version, waits until the CI workflow has published `ghcr.io/pixari/opentodo:<version>`, packages the chart, pushes it with `helm push` to `oci://ghcr.io/pixari/charts` (package `charts/opentodo`, with `GITHUB_TOKEN` and `packages: write`), and pushes `artifacthub-repo.yml` with `oras` as the `artifacthub.io` tag beside it.

One-time steps for the maintainer after the first publish:

1. On GitHub, open the package **charts/opentodo** (github.com/pixari → Packages), **Package settings → Change visibility → Public** (new GHCR packages are private), and under **Manage Actions access** check that `pixari/opentodo` has write access (it has when the workflow created the package).
2. On <https://artifacthub.io> sign in (GitHub account), **Control Panel → Add repository**: kind **Helm charts**, name `opentodo`, URL `oci://ghcr.io/pixari/charts/opentodo`. Artifact Hub scans it about every 30 minutes.
3. Optional, for the **Verified publisher** badge: copy the repository ID from the Control Panel into `artifacthub-repo.yml` (uncomment `repositoryID`, add `owners` with the Artifact Hub account's email); the next release pushes it, or push it once by hand with the `oras push` command in the workflow.

There is no third-party pull request to open.

## On a release

Bump `version` and `appVersion` in `opentodo/Chart.yaml` and the image in its `artifacthub.io/images` annotation to the new release (`make check` fails until they match `CHANGELOG.md`). The release tag publishes the chart; people update with `helm upgrade`.
