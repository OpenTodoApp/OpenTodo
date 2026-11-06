## 1. Server

- [x] 1.1 `auth.SetupFrom`, `SetSetupHostCheck`, `SetupCodeNeeded`, code generated without a base URL, `ErrSetupHostUnverified`; verify `go test ./internal/auth -run TestSetupHostCheck`
- [x] 1.2 `setupHostVerified` and `setupFrom` in `internal/httpapi/setuphost.go`, status `setupCodeForHost`, start-up warning with the code, wiring in `services.Build`; verify `go test ./internal/httpapi -run 'Setup|Origin|TestNoHostCheckWithBaseURL|TestV1SurfaceIsAdditive'`

## 2. Web

- [x] 2.1 Setup screen hint for `setupCodeForHost` in six languages; verify `npm test` (`AuthScreen.setup.test.ts`) and `make i18n-check`

## 3. Docs and checks

- [x] 3.1 `docs/self-hosting/docker.md`, `docs/api.md`, `docs/security/threat-model.md`, CHANGELOG `### Security`; verify `make docs-check`
- [x] 3.2 `go test ./...`, `make openspec-validate`
