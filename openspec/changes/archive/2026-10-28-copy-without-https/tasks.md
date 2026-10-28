## 1. Client

- [x] 1.1 `copyText` in `web/src/lib/clipboard.ts` (API, then the copy command on a hidden field inside the open dialog, focus restored); the 15 Copy call sites use it; the recovery key is marked copied only on success; tests in `clipboard.test.ts` and a browser run over plain http at a LAN address (`npm test`, `npm run build`)

## 2. Checks

- [x] 2.1 `make check`
