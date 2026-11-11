# Proposal

## Why

`OPENTODO_BASE_URL` is the public address people open. A value with a path, such as `https://example.test/absproxy/18082/`, is accepted at startup, but OpenTodo can't run below a path: the page loads its assets from `/assets/…`, the client calls `/api/v1/…` and the server routes nothing under a prefix. The instance starts and then doesn't work behind that proxy, with no hint why (issue #1207).

Serving OpenTodo below a path would touch every absolute URL in the web app, the service worker, the manifest, CalDAV and the API, so it isn't proposed here. Refusing the value at startup turns a silent failure into a clear message.

## What Changes

- **Startup check:** `OPENTODO_BASE_URL` must be an origin: scheme and host, an optional port, and an empty path or `/`. A path, a query or a fragment stops startup with a message that names the variable, says OpenTodo needs its own origin (a subdomain or a port), and links the reverse proxy guide.
- **Docs:** `docs/self-hosting/` says the same where the base URL and reverse proxies are described.

**BREAKING:** an instance started with a base URL that has a path refuses to start after the upgrade. Such an instance couldn't be used anyway; the message says what to change.

## Capabilities

### Modified Capabilities

- `self-hosting`: "Optional configuration only" gains the origin rule for `OPENTODO_BASE_URL`.

## Out of scope

Serving OpenTodo below a path prefix.

## Roadmap

A fix outside the roadmap's milestones (issue #1207).
