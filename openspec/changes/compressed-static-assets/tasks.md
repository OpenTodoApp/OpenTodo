## 1. Build

- [x] 1.1 `web/scripts/compress-dist.mjs` writes `.gz` copies under `dist/assets/` (types, 1 KiB, 90 %), run by `npm run build`; verified by its unit test (`npm test` in web/) and by `.gz` files in `internal/web/dist/assets` after `npm run build`
- [x] 1.2 `app-manifest.mjs` leaves `.gz` out of the signed list; verified by its unit test (`npm test` in web/)

## 2. Server

- [x] 2.1 `internal/web` sends the copy with `Content-Encoding: gzip` and `Vary: Accept-Encoding` when gzip is accepted and no Range is asked; verified by `go test ./internal/web` (gzip, no gzip, `q=0`, Range, HEAD)

## 3. Check

- [ ] 3.1 `make check`, and the browser end-to-end checks including the signed web app's (`make e2e`, `make e2e-signed`); the first install's transfer measured before and after with `curl` on every precached file
