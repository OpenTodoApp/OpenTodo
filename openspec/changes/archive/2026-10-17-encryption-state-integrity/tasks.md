# Tasks

## 1. Encryption is turned off only on the device (DATA-4)

- [x] 1.1 `refreshFromServer` marks "record missing" instead of disabling; `syncBlocked` gates `runOnce`, `reconcileMode`, `prepareOutgoing` and `reseedAfterRestore`; the re-seed after a server restore re-reads the key record first. Verify: `npx vitest run src/lib/e2ee.test.ts` (404 keeps encryption on and locks; pre-encryption backup restore uploads no plaintext; explicit disable still works).
- [x] 1.2 `restoreKeyRecord` and `turnOffAfterMissingRecord`; record-missing screen in `UnlockScreen.tsx`, shown by `App.tsx`; messages in every shipped catalog. Verify: `npx vitest run src/app/encryptionPanel.test.tsx`; `node scripts/i18n-check.mjs`.

## 2. Iteration bounds (DATA-20)

- [x] 2.1 `checkRecordParams` in `unlockWithPassphrase` and `refreshFromServer`; `unlock` reports `KeyRecordParamsError`. Verify: `npx vitest run src/lib/crypto.test.ts src/lib/e2ee.test.ts`.

## 3. Share target (DATA-22)

- [x] 3.1 `shareRequestAllowed` and `entrySize` used by the `/share` route in `sw.ts`. Verify: `npx vitest run src/lib/shareInbox.test.ts`; `npx tsc --noEmit -p tsconfig.sw.json`.

## 4. Docs and checks (DATA-19)

- [x] 4.1 `docs/e2ee.md` (rollback, bounds, record missing), `docs/capture.md`, CHANGELOG. Verify: `make docs-check`; `npx tsc --noEmit`; `npx vitest run src/lib src/app`.
