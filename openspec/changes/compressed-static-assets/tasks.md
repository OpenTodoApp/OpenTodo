## 1. Build

- [x] 1.1 `web/scripts/compress-dist.mjs` replaces compressible files under `dist/assets/` by their `.gz` form (types, 1 KiB, 90 %), run by `npm run build`; verified by its unit test (`npm test` in web/) and by `.gz` files in `internal/web/dist/assets` after `npm run build`
- [x] 1.2 `app-manifest.mjs` leaves `.gz` out of the signed list; verified by its unit test (`npm test` in web/)
- [x] 1.3 `scripts/bundle-budget.mjs` reads a chunk through its `.gz` form; verified by `node --test scripts/bundle-budget.test.mjs` and `make bundle-budget`

## 2. Server

- [x] 2.1 `internal/web` sends the `.gz` form with `Content-Encoding: gzip` and `Vary: Accept-Encoding` when gzip is accepted and no Range is asked, and the decoded file otherwise; a request for the `.gz` name is a 404; verified by `go test ./internal/web` (gzip, no gzip, `q=0`, `*`, Range, HEAD)
- [x] 2.2 `websign.CheckFS` checks a `.gz` form as the file it decodes to; verified by `go test ./internal/websign` and `go run ./cmd/websign verify internal/web/dist`
- [x] 2.3 Both decoders stop at the signed size (a decompression bomb is a 500 to a client without gzip, a changed file to websign); verified by `go test ./internal/web ./internal/websign` (`TestCompressedAssetDecodeCap`, `TestCheckFSDecodeCap`)

## 3. Check

- [ ] 3.1 `make check`, and the browser end-to-end checks including the signed web app's (`make e2e`, `make e2e-signed`); the transfer of everything the worker precaches measured before and after with `curl`, and every asset fetched without gzip matching its signed hash
