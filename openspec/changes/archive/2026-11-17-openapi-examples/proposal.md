## Why

The OpenAPI description (`api-description`) gives every route its schemas but not one example, so API explorers show empty request bodies and client authors still read `docs/api.md` to learn what an answer looks like. The tests already run a real server; the examples can come from it.

## What Changes

- Every request body and JSON success response in the description carries an example. The core resources (tasks, projects, sections, labels, reminders, comments, notes, sync, the owner switches, habits and a repeating task's occurrences) show what a test server really answered, with a frozen clock and stable placeholder ids; every other body gets an example built from its schema.
- The shared error responses show the error envelope for `unauthorized`, `not_found` and `invalid_input`.
- A ratchet in the description test fails on a body without an example and on more operations without any response example than recorded (those answer no JSON the description knows of: 204, redirects, files, event streams, or a body the analysis cannot see yet).

## Capabilities

### Modified Capabilities

- `api-description`: the description carries examples.

## Impact

- Test code only in `internal/httpapi`; `docs/openapi.json` and the embedded `openapi.json.gz` grow (about +290 KB raw, +23 KB gzip in the binary). No dependency, no route, op, schema or data change, no environment variable, nothing **BREAKING**.

## Out of scope

- Describing the bodies of the operations the analysis cannot see (they keep counting in the ratchet), and correcting their statuses.
- Examples for CalDAV, MCP, webhook payloads and the op payloads of sync beyond one op.
- ROADMAP.md: no milestone item; this rounds off `openapi-description`.
