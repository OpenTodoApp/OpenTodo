# Tasks

## 1. iOS shell

- [x] 1.1 `ShellDataTests.testTheDefaultPortAsWebKitReportsItIsTheConfiguredOrigin`: a frame on port 0 is the configured `https://host`, `https://host:443` and `http://host`; never `:8443`, `:80` over https, another scheme or a sub-frame. Verify: fails on the iOS job before 1.2.
- [x] 1.2 `Origin.signature(scheme:host:port:)` reads port 0 as the scheme's own default. Verify: `make ios` passes on the iOS job.

## 2. Release

- [x] 2.1 Changelog fragment `changelog.d/Fixed/ios-bridge-default-port.md`. Verify: `make repo-check`.
- [ ] 2.2 On an iPhone with a TestFlight build of this change, connected to a server on `https://` with no port: an attached link opens Safari, the widget fills after opening the app, and Settings → Notifications → Send a test notification shows one.
