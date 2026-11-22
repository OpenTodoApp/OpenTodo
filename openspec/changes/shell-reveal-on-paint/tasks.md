## 1. Web app

- [x] 1.1 `shell.ts`: capability `first-paint`, method `painted`, `announcePainted()`, called at most once and only when the capability is listed; verified by `npx vitest run src/lib/shell` in web/
- [x] 1.2 `main.tsx` calls `announcePainted()` two animation frames after React's first commit (after the frame with the app's content, measured in Chromium); verified by `npm test` and `npm run build` in web/
- [x] 1.3 The shared fixture `bridge/painted.json`, written from the real call; verified by `npx vitest run src/lib/shellBridge.fixture` in web/

## 2. iOS shell

- [ ] 2.1 `Bridge.swift` lists `first-paint` in the visible app only, has `painted` in the page script and dispatches it; `BridgeHost` posts `FirstPaint.painted` when interactive; `ShellController` reveals on it. Verified by `ShellDataTests` (fixture, capability lists, reveal on the call) in CI's iOS job
- [x] 2.2 `mobile/README.md` bridge table and the shell row; verified by `make docs-check`

## 3. Check

- [ ] 3.1 `make check`; CI's iOS job builds the app and passes `ShellDataTests`; a device row on the owner's check list (time from the tap to the app, with and without the change)
