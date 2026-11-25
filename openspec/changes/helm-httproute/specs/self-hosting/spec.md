## ADDED Requirements

### Requirement: Helm chart Gateway API route
The Helm chart SHALL offer an optional Gateway API `HTTPRoute` (`gateway.networking.k8s.io/v1`), off by default, that attaches to the Gateways named in `httpRoute.parentRefs` and sends every path of `httpRoute.hostnames` (none by default: every hostname of the Gateway's listener) to the OpenTodo Service. It SHALL need Gateway API v1.0 or later. It SHALL be usable instead of or beside the Ingress, and enabling it SHALL leave the Ingress and every other rendered manifest unchanged. Enabled without a parent Gateway, the chart SHALL refuse to render and name `httpRoute.parentRefs`. The chart SHALL NOT derive `OPENTODO_BASE_URL` from the route, since TLS ends at the Gateway. The route changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: Default install
- **WHEN** the chart is installed with its default values
- **THEN** it renders no `HTTPRoute`, and the same manifests as before the option existed

#### Scenario: Route through a Gateway
- **WHEN** the chart is installed with `httpRoute.enabled=true`, a parent Gateway `my-gateway` and the hostname `todo.example.com`
- **THEN** an `HTTPRoute` attached to `my-gateway` sends `todo.example.com/` and every path below it to the Service on port 8080

#### Scenario: No Gateway named
- **WHEN** `httpRoute.enabled=true` is set without `httpRoute.parentRefs`
- **THEN** `helm install` and `helm template` fail with a message naming `httpRoute.parentRefs`
