# Tasks

## 1. Clients

- [x] 1.1 `outbound.OperatorTransport` and `outbound.SameHostRedirects`; verify `go test ./internal/outbound -run 'TestOperatorTransport|TestSameHostRedirects'`
- [x] 1.2 Backup client without an environment proxy, same-host redirects (at most 3); verify `go test ./internal/backup -run 'TestBackupClientIgnoresEnvironmentProxy|TestBackupDestinationRedirectsStayOnHost'`
- [x] 1.3 Sign-on client without an environment proxy, no redirects; verify `go test ./internal/oidc -run 'TestProviderClient'`

## 2. Docs and checks

- [x] 2.1 `docs/backups.md`, `docs/self-hosting/sso.md`, the threat model and how-we-verify; CHANGELOG `### Security`; tick 6.6 in `external-security-review`; verify `make docs-check`
- [x] 2.2 `go test ./...`, `make openspec-validate`
