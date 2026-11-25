# Tasks

## 1. Chart

- [x] 1.1 `templates/httproute.yaml`, `httpRoute.*` in `values.yaml` (off by default) and `values.schema.json`, the route's address in `NOTES.txt`. Verified by `helm lint --strict` and `helm template` with and without `httpRoute.enabled`.
- [x] 1.2 `scripts/deploy/helm.mjs`: the template is required, `httpRoute.enabled` defaults to false, `helm template` renders one `HTTPRoute` only when enabled and fails without `parentRefs`. Verified by `HELM=helm node --test scripts/deploy/helm.test.mjs` and `node scripts/deploy-check.mjs`.

## 2. Docs and release

- [x] 2.1 "Gateway API" in `docs/self-hosting/kubernetes.md`, the chart's `README.md` and `deploy/helm/README.md`. Verified by `make docs-check`.
- [x] 2.2 Changelog fragment `changelog.d/Added/helm-httproute.md`.

## 3. Checks

- [ ] 3.1 On a cluster with a Gateway API implementation (for example Envoy Gateway on kind): install with `httpRoute.enabled=true` and the Gateway in `parentRefs`, then open OpenTodo through the Gateway's hostname and sign in.
