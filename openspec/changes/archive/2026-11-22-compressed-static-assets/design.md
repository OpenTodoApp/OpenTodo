# Design: compressed-static-assets

## D1. Compressed once, at build time, one form embedded

`web/scripts/compress-dist.mjs` runs at the end of `npm run build`, after the signed
list (`app-manifest.mjs`) is written from the files as built. Each file under
`dist/assets/` ending in `.js`, `.css`, `.svg` or `.md`, of at least 1 KiB, is replaced
by `<file>.gz` (Node's zlib, level 9) when that is at most 90 % of it. The binary embeds
that one form, so it gets smaller (about 11 MB today) instead of carrying a copy beside
each file, and nothing is compressed per request. `rmSync` of `dist/assets` at the
start of the build removes old forms; the precache glob in `vite.config.ts` never
matches `.gz`, and the signed list never names it.

Only `assets/` is compressed: its names are hashed and immutable, and the files at the
root (the page, the service worker, the signed list) are small or must stay exact for
WebKit's navigation preload (`index.html`).

A `.gz` form beside its file (as a developer may leave) is served the same way; the
build itself never leaves both.

## D2. Chosen per request

For a GET or HEAD of `assets/<file>` kept as `<file>.gz`, `internal/web` sends the
compressed form when the request accepts gzip (`Accept-Encoding` names `gzip` or `*`
with a q above 0) and has no `Range` header, with `Content-Encoding: gzip`, the file's
own `Content-Type` and `Content-Length`, and the file's `Cache-Control`. Otherwise it
decodes the form and answers through `http.ServeContent`, which handles a Range and a
HEAD on the decoded bytes. Each path is decoded at most once per server and kept
(`sync.Once` per path, at most the embedded app, about 14 MB, filled only by clients
that need it): decoding per request let parallel Range requests for the biggest chunk
push a small instance into memory trouble. The decoder (`websign.DecodeGzip`, shared
with D3) reads exactly one gzip member, refuses bytes after it, and stops at the file's
size in the embedded signed list (64 MiB for a file it does not name), so a form that is
not one file, or decodes to more, a decompression bomb among them, is a 500. Every answer for such a file carries `Vary: Accept-Encoding`, so a shared
cache keeps the two apart. A request that names `<file>.gz` itself is a 404: the form is
how a file travels, not a file.

## D3. The signature, websign and no-transform

`Content-Encoding` is a coding of the transfer: the browser decodes it before the page,
the service worker or the signed-list check see the body, so the bytes and their
SHA-256 are the file's. `websign` checks a build the same way (`CheckFS`): a `.gz` file
counts as the file it decodes to, in place of it or beside it (where it must decode to
the same bytes), and a form that does not decode, or decodes to other bytes, is a
changed file named by its own path. It decodes through `websign.DecodeGzip`, as a
browser does: one gzip member (Go's reader would otherwise join several, which a
browser may not), no bytes after it, and no more than one byte past the listed size, so
a bomb is a changed file, not an exhausted machine. Only forms under `assets/` count,
since only those are compressed by the build and sent by the server; a `.gz` elsewhere
is an unlisted file. `websign verify <url>` fetches through Go's client,
which asks for and decodes gzip itself. `no-transform` stays: it tells intermediaries not
to change what the origin sent.

The other readers of the build go through the same rule: `scripts/bundle-budget.mjs`
reads a chunk through its `.gz` form.

## D4. Validators

`http.FileServer` over the embedded files sends no `ETag` or `Last-Modified` (embedded
files have no modification time), and `http.ServeContent` is given no time, so there is
no validator to keep apart per encoding today. Should one be added, the compressed
answer needs its own (`W/` or a suffix).

## D5. Tests

Go: a handler test over an in-memory file system answers a file kept only as `.gz`, and
one with both forms, for gzip, no gzip, `gzip;q=0`, `*`, a Range and a HEAD, and a
request for the `.gz` name with 404, refuses a 64 MiB bomb listed at 200 bytes and a
two-member form to a client without gzip, and decodes a file once for 51 requests (50
parallel Range requests, run with `-race`); a websign test checks a form in place of its
file, beside it, of other bytes, not gzip at all, of an unlisted file, of two members,
with trailing bytes, outside `assets/`, and a bomb (read only to the cap). Node:
`compress-dist` replaces only the listed types above the threshold, `app-manifest`
leaves `.gz` out, and `bundle-budget` reads through `.gz`. The browser end-to-end checks
(including the signed web app's) run against the built server as before.

## Data model, size and budget

- Data model: none. No op field, no synced preference, no route.
- Binary and container image: about 11 MB smaller (47.0 MB to 36.1 MB measured), no new
  dependency; runtime memory grows only by the files decoded for clients without gzip,
  each once, at most the embedded app (about 14 MB).
- First load: 4.59 MB instead of 14.27 MB on the wire for everything the worker
  precaches; the entry chunk is unchanged in content.
