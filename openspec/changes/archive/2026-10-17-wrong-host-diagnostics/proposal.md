## Why

Since `trusted-client-identity`, a server with `OPENTODO_BASE_URL` refuses browser requests addressed to any other host (DNS rebinding protection). After the public demo moved from `opentodo-demo.pixari.dev` to `demo.open-todo.app` with the old base URL left in place, every "Try the demo" failed with "cross-site request rejected" (issue #125). Nothing told the visitor or the operator why: the screen suggested a reload, and the log was silent.

## What Changes

- The server logs one warning per host it refuses for this reason, naming the host and the base URL. At most 32 hosts are reported, so made-up `Host` headers cannot flood the log.
- The sign-in screen (sign-in, setup, "Try the demo") answers such a refusal with the address the server is set up for, instead of "reload".
- Docs: the reverse-proxy and demo pages say to update `OPENTODO_BASE_URL` after a domain move.

The rule itself does not change.

## Impact

- `internal/httpapi/server.go` (`originAllowed`, `hostWarnings`), `web/src/lib/origin.ts`, `web/src/app/AuthScreen.tsx`, one translated string.
- No API, schema or configuration change.
