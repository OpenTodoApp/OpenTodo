# Proposal

## Why

GitHub issue #1959: the Helm chart can only expose OpenTodo through an `Ingress`. The Ingress API is feature-frozen in favour of the Gateway API and ingress-nginx is retired, so clusters on Envoy Gateway, Cilium, Istio, Traefik or NGINX Gateway Fabric have to write their own `HTTPRoute` beside the chart.

## What Changes

- An optional `HTTPRoute` (`gateway.networking.k8s.io/v1`) in the chart: `httpRoute.enabled` (default `false`), `httpRoute.parentRefs` (the Gateway, required when enabled), `httpRoute.hostnames` and `httpRoute.annotations`. It sends every path to the Service. It can be enabled instead of, or beside, the Ingress.
- The Ingress, its values and its `OPENTODO_BASE_URL` default are unchanged, so existing installs render the same manifests.
- The install notes name the route's address; the guide (`docs/self-hosting/kubernetes.md`) gets a Gateway API section.

No new mandatory environment variable, no op log change, no API route.

## Out of scope

- Creating a `Gateway` or its TLS certificate: both belong to the cluster's operator.
- Deriving `OPENTODO_BASE_URL` from the route: TLS ends at the Gateway's listener, which the chart cannot see.
- Other route kinds (`GRPCRoute`, `TLSRoute`) and the older `v1beta1` API.

ROADMAP.md: none (an improvement from an issue).

## Capabilities

### Modified Capabilities

- `self-hosting`: the Helm chart offers a Gateway API `HTTPRoute` beside the Ingress.

## Impact

`deploy/helm/opentodo` (values, schema, a new template, notes), `scripts/deploy/helm.mjs` and its tests, the Kubernetes guide. No change to the image or its size.
