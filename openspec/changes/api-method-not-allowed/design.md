# Design

## Context

See proposal.md, "Why". Every API route is registered through `routes.handler` on one `http.ServeMux`, including the route packages (speech, maps, CalDAV) through `routes.Handle`. The last API pattern is the method-less catch-all `/api/`. ServeMux reports a method mismatch as 405 only when no other pattern matches the path. A method-less pattern matches every method, so the catch-all always wins and answers 404 "unknown API route".

Three generic collection patterns also match broadly: `GET`/`POST /api/v1/{collection}`, and `GET`/`PATCH`/`DELETE /api/v1/{collection}/{id}`. They take every one- or two-segment path, and their handlers answer "unknown collection" themselves.

## Goals / Non-Goals

**Goals:**
- A wrong method on a served path becomes a 405 with `Allow`.
- A 404 says what the server received.
- The assistant's Test buttons explain a refused request in plain words.
- Policies stay exactly as they are.

**Non-Goals:**
- 405s outside `/api/`.
- Reworking the generic collection routes.
- Telling the reporter what their proxy does.

## Decisions

### D1. The catch-all asks the mux which methods the path serves

For a request that reached the catch-all, the handler clones the request once per method in a fixed list: GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS. It asks `mux.Handler` for the pattern each clone would match. Every match other than the catch-all itself is an allowed method. None means a 404; some means a 405 with `Allow` in that order.

Only the matcher runs: no handler, no policy, no side effect. It costs seven map lookups, and only on requests that would have failed anyway. A `GET` pattern also matches `HEAD` in ServeMux, so `HEAD` is listed with `GET`, as ServeMux's own 405 does.

**Alternatives considered:**
- **Removing the catch-all and letting ServeMux answer.** Rejected: ServeMux's 405 and 404 are plain text, not the JSON envelope, and unknown paths would fall through to the web app's `/` handler and return HTML.
- **A second table of method sets built at registration.** Rejected: it duplicates what the mux already knows, and would drift from it as soon as a route is registered another way.

### D2. Generic collection matches count only for a real collection

`/api/v1/{collection}/{id}` matches any two-segment path. Without a filter, `POST /api/v1/push/subscriptions` on a server with push off would read "use GET, HEAD, PATCH, DELETE", which is false: the push routes are absent, and the spec says that's a 404. So a match on a pattern containing `{collection}` counts only when the first segment after `/api/v1/` is a key of `sync.Plural`, the same map the collection handlers use.

### D3. Policy and information

The catch-all keeps its `public` policy. A 405 reveals that a path exists, and which methods it takes, to a caller without a session. That's standard HTTP, and the same fact is already visible from the 401 the right method returns. No handler runs, so nothing about data or settings leaks. The message repeats `URL.Path` and the method only:
- never the raw query, which can hold a token or a public link's secret;
- control characters are removed;
- the path is cut at 200 bytes on a character boundary (`textutil.Truncate`).

`/dav/`, `/mcp` and the web app are not under `/api/`, so they keep their own 405 handling. The demo deny list and the multi-tenant host wrap the same handler and are unaffected.

### D4. The web reads the 405 or 404 of a test request

`testRequestError(err, fallback)` turns an `ApiError` with code `method_not_allowed`, or a 404 `not_found`, into one sentence. The sentence shows the status and the server's untranslated message, which names the method and path. Everything else goes to the screen's existing `errorText` wording. The owner's and the member's Test buttons both use it. The test routes never answer 404 or 405 themselves, so these codes on a test request always mean the request was changed on the way.

### Interface budget

The interface budget in docs/interface-guide.md is untouched: no new control, row, scroll region or shortcut. Only the text of an existing result line changes.

### Size

Under 100 lines of Go and about 20 of TypeScript; one string in each of six catalogs. No dependency, and no measurable bundle or binary change.

## Risks / Trade-offs

- **[A client relied on 404 for a wrong method]** → Only a method that never worked on that path changes status. The error envelope and code field stay the same shape, and the API doc states the change.
- **[A future method-less pattern under `/api/`]** → It would match every method, so the catch-all would never see its paths, exactly as today. The test table covers the registered shapes.
