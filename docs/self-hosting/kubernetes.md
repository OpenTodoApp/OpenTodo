---
title: Running on Kubernetes
summary: Install the Helm chart, the first account and its setup token, Ingress and https, storage, security, updates and backups.
audience: admin
specs: [self-hosting]
screens: []
order: 32
---
# Running OpenTodo on Kubernetes

OpenTodo is one container with one volume. The Helm chart runs it as a single pod with a PersistentVolumeClaim on `/data`, a Service on port 8080 and, if you want one, an Ingress. You need Kubernetes 1.23 or later, Helm 3.8 or later, and a StorageClass that provides `ReadWriteOnce` volumes (most clusters have a default one).

## Install

From 0.7.0, the first release that ships it, the chart is published as an OCI artifact on GitHub's registry:

```bash
helm install opentodo oci://ghcr.io/pixari/charts/opentodo \
  --namespace opentodo --create-namespace
```

Until then, install it from a clone of the repository: `helm install opentodo ./deploy/helm/opentodo --namespace opentodo --create-namespace`.

The chart's version is the OpenTodo release it installs: chart `0.7.0` runs `ghcr.io/pixari/opentodo:0.7.0`. Pick a version with `--version`.

## First visit

Without an Ingress, open OpenTodo through a port-forward:

```bash
kubectl --namespace opentodo port-forward svc/opentodo 8080:8080
```

and visit <http://localhost:8080>. The first visitor creates the owner account. The chart generates a setup token and the setup screen asks for it, so nobody who reaches the server first can claim it. Read it with:

```bash
kubectl --namespace opentodo get secret opentodo-setup-token \
  -o jsonpath='{.data.setup-token}' | base64 -d; echo
```

The token only matters until the owner exists. After that, sign-up is closed and the owner invites people from **Settings → People → Members**.

## Settings

Put your settings in a values file and pass it with `-f my-values.yaml` on install and upgrade. The chart validates it against its schema, so a mistyped key fails the install instead of being ignored.

| Value | Default | What it does |
| --- | --- | --- |
| `env.OPENTODO_BASE_URL` | empty | The https address people open, for example `https://todo.example.com`. Leave it empty on plain http. With an Ingress that has `tls`, an empty value becomes `https://<ingress.host>`. |
| `env.OPENTODO_ALLOW_SIGNUP` | `"false"` | `"true"` lets anyone who can reach the server create an account. |
| `env.OPENTODO_TRUSTED_PROXIES` | empty | The ingress controller's hop is trusted without it. Set it when more proxies sit in front of the controller, for example `cloudflare`. |
| `env.*` | | Any other variable from the [configuration table](https://github.com/pixari/opentodo#configuration), as a string. |
| `extraEnv` | `[]` | More variables in Kubernetes form, for example a password from your own Secret with `valueFrom.secretKeyRef`. |
| `setupToken.generate` | `true` | Generates the setup token into a Secret, kept across upgrades. |
| `setupToken.existingSecret` | empty | Use your own Secret instead (key `setupToken.secretKey`, default `setup-token`). Use this with Argo CD or Flux: they cannot read the old Secret, so a generated token would change on every sync. |
| `persistence.size` | `2Gi` | The size of the volume for the database, attachments and backups. |
| `persistence.storageClass` | empty | Empty uses the cluster's default StorageClass. |
| `persistence.existingClaim` | empty | Use a PersistentVolumeClaim you created. |
| `ingress.enabled`, `ingress.host`, `ingress.className`, `ingress.annotations`, `ingress.tls` | off | An Ingress for one host, see below. |
| `image.tag` | empty | Empty runs the chart's own release. Set it only to pin a different version. |

## https and the Ingress

On plain http (a port-forward, or a Service of type `NodePort`), tasks, projects, sync, sharing and attachments work. Installing the app on a phone, working offline, push notifications, passkeys and end-to-end encryption need https, because browsers only allow them there.

With an ingress controller and cert-manager, for example:

```yaml
ingress:
  enabled: true
  className: nginx
  host: todo.example.com
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
  tls:
    - secretName: opentodo-tls
      hosts:
        - todo.example.com
```

The chart then sets `OPENTODO_BASE_URL` to `https://todo.example.com`. If TLS ends somewhere else (a cloud load balancer, a tunnel), leave `tls` empty and set `env.OPENTODO_BASE_URL` to the https address yourself. Never set an `https://` address while you open OpenTodo over plain http: the session cookie becomes secure-only and sign-in fails. More on proxies and forwarded addresses in [Running with Docker](docker.md#behind-a-reverse-proxy).

## One pod, by design

OpenTodo keeps its data in SQLite, which has one writer. The chart therefore always runs exactly one replica and updates with the `Recreate` strategy: the old pod stops before the new one starts, so an upgrade has a few seconds of downtime. Do not scale the Deployment. Over https, the app keeps working offline meanwhile and syncs when the server is back.

## Security

The pod runs as user and group 65532, with `fsGroup: 65532` so the volume is writable, a read-only root filesystem (an `emptyDir` on `/tmp`), no capabilities, no privilege escalation, the runtime's default seccomp profile and no service account token. It meets the Pod Security Standard `restricted`.

## Updates and backups

Each OpenTodo release publishes a chart of the same version. To update:

```bash
helm upgrade opentodo oci://ghcr.io/pixari/charts/opentodo \
  --namespace opentodo -f my-values.yaml
```

The image tag follows the chart, so a pod only changes when you upgrade: nothing moves under you. Migrations run when the new pod starts. There are no down-migrations, so back up first. `helm rollback` returns to the previous chart, but not to the previous database.

Everything OpenTodo stores is on the PersistentVolumeClaim (`opentodo` unless you set `existingClaim`). The image has no shell, so `kubectl exec` and `kubectl cp` do not work. Back up with scheduled backups in OpenTodo's **Settings → Server**, ideally to S3 or WebDAV, outside the cluster (see [Backups](../backups.md)), or with snapshots of the volume if your storage supports them.

`helm uninstall` keeps the PersistentVolumeClaim and your data. Delete it with `kubectl --namespace opentodo delete pvc opentodo` when you mean it.

## Troubleshooting

- **The pod stays Pending**: the claim found no volume. Check `kubectl --namespace opentodo get pvc` and set `persistence.storageClass` if the cluster has no default StorageClass.
- **The pod restarts with "permission denied" or "readonly database"**: the storage ignores `fsGroup` (some NFS and hostPath provisioners do). Give the volume's directory to user 65532 on the storage side.
- **Sign-in does not stick**: `OPENTODO_BASE_URL` is https but you open OpenTodo over plain http. Clear it, or open the https address.
