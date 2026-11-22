# The server sends the web app compressed

## Why

The server sends the embedded web app byte for byte with no compression, and every
answer carries `no-transform`, so a proxy or CDN that honours it does not compress them
either. A first install therefore downloads the whole precache, 14.3 MB, where gzip
would move about 4.6 MB (issue #1746, analysis in its comments). That is three times
the data and the wait on a phone on mobile data, for every self-hosted server.

## What Changes

- The build writes a gzip copy next to each compressible file under `assets/` (scripts,
  styles, SVG, Markdown) when it is smaller than the file.
- The server answers a request for such a file with the gzip copy, `Content-Encoding:
  gzip` and `Vary: Accept-Encoding`, when the client accepts gzip and asks for the whole
  file. A client without gzip, or a Range request, gets the file as before.
- The decoded bytes are the file the signed list names, so the signature, the service
  worker's precache and `no-transform` are unchanged.

No new mandatory environment variable, no new Go dependency, no change to the op log,
routes or data. The binary grows by the gzip copies (about 4.5 MB).

## Out of scope

- Brotli. It can be produced at build time with no Go dependency and saves a little
  more, but browsers send it only over HTTPS and it would add its own copies to the
  binary; a later change if the saving is worth the size.
- What the service worker precaches (issue #1746, options 2 and 3).
- Compressing API answers.

ROADMAP.md: advances `performance-10k` (budgets on phones too) for the first install; it follows issue #1746.

## Capabilities

### Modified Capabilities

- `web-app`: the installable client is sent compressed when the client accepts it.
