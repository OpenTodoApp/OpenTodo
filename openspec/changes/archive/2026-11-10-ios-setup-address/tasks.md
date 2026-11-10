# Tasks

## 1. Address

- [x] 1.1 `ServerAddress.parse`: no scheme is https, explicit http kept (local, marked insecure), uppercase scheme, trailing slash and dot, a path refused, a Unicode host in its ASCII form (design D4); verify with `ServerAddressTests` in the iOS CI job (`make ios`)

## 2. First-run screen

- [x] 2.1 Connect is a filled button enabled only for a well-formed address (design D1); verify with `FirstRunTests.testConnectIsActiveOnceTheAddressIsWellFormed` and the accessibility audit in `make ios`
- [x] 2.2 The field shows `https://` for an address typed without a scheme (design D2); verify with `FirstRunTests.testAnAddressWithoutASchemeShowsHttps`
- [x] 2.3 Local http shows "This connection is not encrypted." (design D3), translated into every shipped language; verify with `FirstRunTests.testPlainHttpToALocalAddressWarns` and `make i18n-check`

## 3. After connecting

- [x] 3.1 Settings → About shows the server address under the shell row (design D5); verify with `aboutShell.test.tsx` (`npm test` and `npm run build` in `web/`)
- [x] 3.2 `docs/ios-app.md`, `mobile/README.md` and the changelog fragment `changelog.d/Changed/ios-setup-address.md`; verify with `make docs-check` and `make repo-check`
