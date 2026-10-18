# Tasks

Frontend tasks are verified with `npm test` and `npm run build` in `web/`; backend with `go test ./...`.

## 1. Sync sessions and deadlines

- [x] 1.1 Local data epoch, `alive()` checks after every await in the exchange, aborted request on stop, `stopSyncAndWait` before clearing, device id per epoch; verify with `sync.test.ts` "an exchange still waiting for the server writes nothing after sign-out" and "the device id is read again after the local data was cleared".
- [x] 1.2 Request deadlines in `lib/http.ts` for every api call, uploads and downloads; timeouts and network failures are offline with backoff; verify with `http.test.ts` ("a hung sync request does not block the next exchange", "every api call carries a deadline") and `sync.test.ts` "a network failure is offline and the exchange is retried with backoff", "a timed-out request does not block the next exchange".

## 2. Upgrades

- [x] 2.1 Only network failures are offline; verify with `sync.test.ts` "a TypeError from our own code is an error, not offline".
- [x] 2.2 `vite:preloadError` reload with a loop guard, `controllerchange` and `versionchange` banner; verify with `appUpdate.test.ts`.
- [x] 2.3 Error boundaries per screen and panel; verify with `panelBoundary.test.tsx` "shows the message with Reload in place of the failed part…".
- [x] 2.4 `internal/web` answers 404 for missing assets and paths with an extension; verify with `go test ./internal/web` `TestMissingFilesAreNotFound`.

## 3. Actions and storage

- [x] 3.1 `act()` for user actions in `web/src/app`, toasts for refused `setTaskParent`, `moveTaskToSection` and drops; verify with `panelBoundary.test.tsx` "a refused change shows its translated message as a toast".
- [x] 3.2 `navigator.storage.persist()` after sign-in and the `unhandledrejection` logger; verify with `appUpdate.test.ts` "persistent storage" and "unhandled rejections".

## 4. Tabs and lifecycle

- [x] 4.1 Web Lock leader with BroadcastChannel followers and a sign-out broadcast; verify with `syncLeader.test.ts`.
- [x] 4.2 Sync depends on one boolean; listeners removed on stop; verify with `appSync.test.tsx` and `sync.test.ts` "stopSync removes the window and document listeners…".
- [x] 4.3 Held ops read-modify-write in a transaction; verify with `limits.test.ts` "a hold that runs while held ops are requeued is not lost".
- [x] 4.4 Title draft kept while typing; verify with `titleDraft.test.tsx`.

## 5. Strings and docs

- [x] 5.1 New strings in every shipped catalog; verify with `make i18n-check`.
- [x] 5.2 CHANGELOG and docs; verify with `make docs-check`.
