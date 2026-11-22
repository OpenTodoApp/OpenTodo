# Design: compressed-static-assets

## D1. Compressed once, at build time

`web/scripts/compress-dist.mjs` runs at the end of `npm run build`, after the signed
list (`app-manifest.mjs`) is written. For each file under `dist/assets/` ending in
`.js`, `.css`, `.svg` or `.md`, of at least 1 KiB, it writes `<file>.gz` (Node's zlib,
level 9) when that is at most 90 % of the file. Nothing is compressed per request, so
serving costs no CPU, and `rmSync` of `dist/assets` at the start of the build removes
old copies. The signed list leaves `.gz` files out (`app-manifest.mjs` skips them), and
the precache glob in `vite.config.ts` never matched them.

Only `assets/` is compressed: its names are hashed and immutable, and the files at the
root (the page, the service worker, the signed list) are small or must stay exact for
WebKit's navigation preload (`index.html`).

## D2. Chosen per request

For a GET or HEAD of `assets/<file>` that has a `.gz` copy, `internal/web` sends the copy
when the request accepts gzip (`Accept-Encoding` names `gzip` or `*` with a q above 0)
and has no `Range` header, with `Content-Encoding: gzip`, the file's own `Content-Type`
and `Content-Length`, and the same `Cache-Control` as the file. Every answer for a file
that has a copy, compressed or not, carries `Vary: Accept-Encoding`, so a shared cache
keeps the two apart. Otherwise the file is served by `http.FileServer` as today, which
keeps Range requests working on the raw bytes.

## D3. The signature and no-transform

`Content-Encoding` is a coding of the transfer: the browser decodes it before the page,
the service worker or the signed-list check see the body, so the bytes and their
SHA-256 are the file's. `no-transform` stays: it tells intermediaries not to change what
the origin sent, which now may be the compressed copy.

## D4. Validators

`http.FileServer` over the embedded files sends no `ETag` or `Last-Modified` (embedded
files have no modification time), so there is no validator to keep apart per encoding
today. Should one be added, the compressed answer needs its own (`W/` or a suffix).

## D5. Tests

Go: a handler test over an in-memory file system answers a gzip-accepting request with
the copy and the headers, and a client without gzip, `gzip;q=0`, a Range request and a
HEAD request as specified. Node: `compress-dist` writes copies only for the listed types
above the threshold, and `app-manifest` leaves `.gz` out. The browser end-to-end checks
(including the signed web app's) run against the built server as before.

## Data model, size and budget

- Data model: none. No op field, no synced preference, no route.
- Binary and container image: grow by the gzip copies, about 4.5 MB today.
- First load: about 4.6 MB instead of 14.3 MB for the precache; the entry chunk is
  unchanged in content.
