# Design

## D1 — Operator transport, not the outbound dialer

Backup destinations and the issuer are set only by the operator and are often on the operator's network, so the `outbound.Dialer` deny list does not apply. The two clients take the rest of the policy: `outbound.OperatorTransport()` clones `http.DefaultTransport` (timeouts, HTTP/2, idle pool unchanged) and sets `Proxy` to nil.

## D2 — Redirects

The backup client follows up to 3 redirects, each to the scheme and host (with port) of the first request (`outbound.SameHostRedirects`). Some WebDAV servers redirect a collection without its trailing slash, which a same-host hop covers. Anything else fails with `cross_host_redirect` before a request is sent to the other host; Go would drop the `Authorization` header there, but not an archive body or a pre-signed S3 query. The sign-on client keeps returning a redirect as the answer (`http.ErrUseLastResponse`), which the discovery, key and token calls already treat as a failure.

## Data model and size

No data model change. Standard library only; no measurable effect on image size or memory.
