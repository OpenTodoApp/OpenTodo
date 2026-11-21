# Tasks

## 1. iOS shell

- [x] 1.1 `ShellDataTests.testTheDefaultPortAsWebKitReportsItIsTheConfiguredOrigin`: a frame on port 0 is the configured `https://host`, `https://host:443` and `http://host`; never `:8443`, `:80` over https, another scheme or a sub-frame. Verify: before 1.2 `signature` gives `https://todo.example.com:0` for the frame and `:443` for the server, so the first assertion fails (drafts skip the iOS job and this machine has no Swift, so this was read, not run).
- [x] 1.2 `Origin.signature(scheme:host:port:)` reads port 0 as the scheme's own default. Verify: `make ios` passes on the iOS job.

## 2. Release

- [x] 2.1 Changelog fragment `changelog.d/Fixed/ios-bridge-default-port.md`. Verify: `make repo-check`.
- [ ] 2.2 On an iPhone with a TestFlight build of this change, connected to a server on `https://` with no port: an attached link opens Safari, the widget fills after opening the app, and Settings → Notifications → Send a test notification shows one.

---

Shipped in 1.6.0; device check moved to the owner's list (the board task "Owner: device checks from shipped changes").
