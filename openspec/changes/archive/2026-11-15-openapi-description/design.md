# Design

## Context

- Every route is registered through `routes.handle(pattern, policy, handler)`; the route table (`routeTableOf`) lists pattern and policy for both the normal and the demo server.
- `surface_static_test.go` loads the httpapi packages with `go list -export` and walks the handlers' AST: it finds each route's request fields (from the decoded struct and `body` helpers), response fields (from `writeJSON` values and their types, as JSON paths such as `tasks[].title`), and success statuses. `errorStatuses` maps every error code to its status. The collection routes (`/api/v1/{collection}`) are expanded per collection with the op schema's fields.
- `testdata/v1_surface.json` stores that result as the 1.x promise. Its field types are a small vocabulary: `string`, `number`, `bool`/`boolean`, `object`, `array`, the op kinds (`date`, `due`, `id_list`, `string_list`, `location`, `origin`, `doc`, `day_part`, `energy`, `positive_int`, `nullable_*`, …), unions such as `string|null`, and a trailing `?` for optional request fields.
- Today: 420 routes; 308 with response fields, 129 with request fields, 159 error codes.

## Goals / Non-Goals

**Goals:** one description, generated, always current, valid OpenAPI 3.1, good enough to generate a working client for tasks, projects, labels, notes and sync with a standard generator.

**Non-Goals:** a hand-curated reference, SDKs, describing non-REST protocols, changing any route.

## Decisions

### D1. Generated from the surface analysis, in a test

The generator is test code in `internal/httpapi` next to the surface test and reuses `loadStatic`, `staticRoutes`, `routeTableOf` and `errorStatuses`. `TestOpenAPIDescription` builds the document and compares it with the committed `openapi.json`; `UPDATE_OPENAPI=1 go test ./internal/httpapi -run TestOpenAPIDescription` writes it, as `UPDATE_OP_SCHEMA` does for the op schema. Rejected: annotations on handlers (a second source of truth that drifts), a third-party generator (a dependency and a different model of the code).

### D2. Types

The surface vocabulary maps to JSON Schema once, in one table: scalars to their types; op kinds to named schemas under `components/schemas` (`Due`, `Location`, `Origin`, `IdList`, …) built from the op schema's kinds and documented with its field comments; `nullable_x` and `x|null` to `type: [x, "null"]`; JSON paths (`a.b`, `a[].b`) to nested objects and arrays; a request field with `?` is optional, every other request field required. The entity schemas (`Task`, `Project`, …) come from the collection expansion and are shared by every route that returns them. A field whose type the analysis cannot see stays `{}` (any), and the test lists how many such fields remain so the number only goes down.

### D3. Auth and errors

Two security schemes: `bearer` (an API token) and `session` (the cookie). A route's policy becomes its `security`: session-only routes list only `session`; `.fullTokens()` routes state in an `x-opentodo-scopes` extension that `read` and `agent` tokens are refused; `ownerOnly` and `adminsOnly` are stated in the description text, since OpenAPI has no role model; `public` routes have empty security. Every route documents the shared error envelope `{error:{code,message}}` for 400, 401, 403, 404, 409, 413, 422 and 429 as it can answer them, with the codes the analysis attributes to the route in an `x-opentodo-error-codes` list. A deprecated route carries `deprecated: true` and its sunset date and replacement.

### D4. Served and published

`openapi.json` is embedded in the server and served by `GET /api/v1/openapi.json` with policy `public("the API description of this release: routes only, no account data")`, `Cache-Control: public, max-age=3600`, an `ETag` from its hash, and gzip when the client accepts it. To keep the binary small the file is embedded already compressed (`openapi.json.gz`, written by the same update command) and decompressed only for the rare client that refuses gzip. `info.version` is the release version, set at build time like the server's version. The release workflow attaches `openapi.json` as an asset, and `make site-bundle` adds it as `api/openapi.json`. It is not on the demo deny list: it has no data and no outbound effect.

### D5. Descriptions

Each operation gets a `summary` from its route group (the `docs/api.md` heading the route is documented under, found by a test that already pairs routes with the API doc) and `externalDocs` linking that section. No other prose is generated.

## Risks / Trade-offs

- **The analysis misses a field.** The description is then incomplete, never wrong in what it states; D2's count makes the gap visible, and fixing the analysis improves the v1 surface too.
- **A description larger than the code it describes.** Mitigated by D4 (compressed embed, about 40 KB).
- **Clients over-trusting `x-` extensions.** They are informative; the stability promise stays `docs/stability.md`.

## Data model impact

None. No op, field or migration.

## Size and memory

No dependency. About 40 KB in the binary (compressed), decompressed per request only for clients without gzip. The test adds a few seconds to `go test ./internal/httpapi`, sharing the surface test's package load.

## Interface budget

No screen changes.
