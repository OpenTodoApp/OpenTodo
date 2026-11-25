# Tasks

## 1. Server

- [x] 1.1 `web.TaskPageID`, `web.AppBannerArgument` and `web.InjectAppBanner` (`internal/web/appbanner.go`); `appBannerWeb` wraps the web app in `registerWebAppRoutes`, for GET and HEAD of `/task/<id>` only, naming `cfg.Origin()`. Verified by `internal/web/appbanner_test.go` and `internal/httpapi/appbanner_test.go` (the shared vectors `web/src/lib/appBanner.vectors.json`, Content-Length, HEAD, the same CSP as `/today`, no base URL) in `go test ./...`.

## 2. Service worker

- [x] 2.1 `web/src/lib/appBanner.ts`; `navigation()` in `web/src/sw.ts` adds the tag to a cached `/task/<id>` page, naming the worker's origin; `signed-web-app` D7 names the addition. Verified by `web/src/lib/appBanner.test.ts` (the same vectors) and `web/src/swAppBanner.test.ts` (the tag, Content-Length dropped, Content-Type kept, the CSP of other pages) in `npm test`, and `npm run build` in `web/`.

## 3. iOS app

- [x] 3.1 `AppModel.taskID(webLink:server:)` and its check at the top of `handle(url:)`; `onContinueUserActivity(NSUserActivityTypeBrowsingWeb)` in `OpenTodoApp.swift` takes the same path. Verified by `AppModelTests.testABannerLinkOpensTheTaskOnTheServerOnly` and `testABannerLinkOnAnotherSchemeIsIgnored` in `make ios` (the iOS job).

## 4. Checks

- [ ] 4.1 On an iPhone with the App Store app connected to an https server with a base URL: subscribe to the calendar feed, tap an event's link (Safari shows the banner, Open shows the task in the app); repeat in a Safari that has run the web app (the service worker's copy); close the banner (it stays away); a link to another server opens nothing in the app; note whether Open arrives through `onOpenURL` or as a browsing activity (both are handled). Left open: it needs a real iPhone and a release in the App Store; the steps are in the pull request for the owner.

## 5. Docs and release

- [x] 5.1 `docs/ios-app.md` "Links to tasks". Verified by `make docs`, `make docs-check`.
- [x] 5.2 Changelog fragment `changelog.d/Added/ios-app-banner.md`.
