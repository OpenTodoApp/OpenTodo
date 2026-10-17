# OpenTodo

[OpenTodo](https://open-todo.app) is an open-source, local-first task manager. It works offline and syncs every device from one small container. This chart runs it on Kubernetes 1.23+.

```bash
helm install opentodo oci://ghcr.io/pixari/charts/opentodo --namespace opentodo --create-namespace
kubectl --namespace opentodo port-forward svc/opentodo 8080:8080
```

Open <http://localhost:8080>. The first visitor creates the owner account and is asked for the setup token the chart generated:

```bash
kubectl --namespace opentodo get secret opentodo-setup-token -o jsonpath='{.data.setup-token}' | base64 -d; echo
```

## What it runs

- One pod, always: the data is in SQLite, which has one writer, so the Deployment has one replica and the `Recreate` strategy.
- A PersistentVolumeClaim on `/data` (`persistence.*`, 2Gi by default), kept when the release is uninstalled.
- A Service on port 8080 and, with `ingress.enabled`, an Ingress for `ingress.host`. With `ingress.tls`, `OPENTODO_BASE_URL` becomes `https://<host>`.
- User 65532 with `fsGroup`, a read-only root filesystem, no capabilities and the default seccomp profile (Pod Security `restricted`).
- The image `ghcr.io/pixari/opentodo` at the chart's `appVersion`: each chart version is one OpenTodo release, and `helm upgrade` moves to the next one.

## Values

| Value | Default | |
| --- | --- | --- |
| `env.OPENTODO_BASE_URL` | `""` | The https address people open; empty on plain http. |
| `env.OPENTODO_ALLOW_SIGNUP` | `"false"` | `"true"` opens sign-up to anyone who can reach the server. |
| `env.OPENTODO_TRUSTED_PROXIES` | `""` | Proxies in front of the ingress controller, or `cloudflare`. |
| `env.*`, `extraEnv` | | Any variable from the [configuration table](https://github.com/pixari/opentodo#configuration). |
| `setupToken.generate` / `existingSecret` / `secretKey` | `true` / `""` / `setup-token` | Where `OPENTODO_SETUP_TOKEN` comes from. |
| `persistence.size` / `storageClass` / `existingClaim` | `2Gi` / `""` / `""` | The data volume. |
| `ingress.enabled` / `className` / `host` / `annotations` / `tls` | `false` | The Ingress. |
| `image.tag` | `""` | Empty: the chart's release. |

The full guide, with https, updates and backups: <https://open-todo.app/docs/self-hosting/kubernetes/>. Source and issues: <https://github.com/pixari/opentodo>. License: AGPL-3.0.
