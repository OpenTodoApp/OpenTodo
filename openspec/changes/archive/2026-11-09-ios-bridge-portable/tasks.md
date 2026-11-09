# Tasks

## 1. Prove the cause

- [x] 1.1 `BridgeOnAServerTests` (`mobile/ios/OpenTodoTests/ShellTests.swift`): a page served on `127.0.0.1` from the test process, loaded in the real `ShellController`, reports `typeof window.opentodoShell` and the message handler to its server; fails with the placeholder `WKAppBoundDomains` key; verify with the iOS CI job (`make ios`)
- [x] 1.2 `OriginTests`: every accepted address gives the origin `location.origin` prints, including `https://…:80` and `http://…:443`; verify with `make ios`

## 2. Fix

- [x] 2.1 Remove `WKAppBoundDomains` from `mobile/ios/OpenTodo/Info.plist` and `project.yml`, default `OPENTODO_APP_BOUND_HOST` to empty, and add the "App-bound domains" build phase that writes the key only for a one-server build (design D2); `AppBoundDomainsTests` checks the portable bundle has no key; verify with `make ios` and `make ios-archive` in the iOS CI job
- [x] 2.2 `Origin.pageOrigin` leaves out only the scheme's own default port (design D3); verify with `OriginTests`
- [x] 2.3 Update ios-shell design D2, `mobile/README.md`, `docs/ios-app.md` and the changelog fragment `changelog.d/Fixed/ios-bridge.md`; verify with `make docs-check` and `make repo-check`
