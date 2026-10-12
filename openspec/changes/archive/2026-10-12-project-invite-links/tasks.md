# Tasks

## 1. Server

- [x] 1.1 Migration `0029_project_invites.sql`; verify `go test ./internal/store/...`
- [x] 1.2 `internal/audit`: `project_invite.*` events and detail keys; verify `go test ./internal/audit/...`
- [x] 1.3 `internal/sync`: `AddMemberTx` and `ProjectStatus`; verify `go test ./internal/sync/...`
- [x] 1.4 `internal/auth/projectinvites.go`: create, list, revoke, lookup, accept, register in one transaction; deactivation revokes links; verify `go test ./internal/auth/...`
- [x] 1.5 `internal/httpapi/projectinvites.go`: routes, owner switch, register field, demo deny list; verify `TestProjectInvite*` (`go test ./internal/httpapi/...`) covering routes, concurrent accept, email binding, role rules, owner switch, creator lost rights, revocation, rate limit, demo refusal and token scope

## 2. Web

- [x] 2.1 API client, types, router `/invite/p/<token>`; verify `npm test`
- [x] 2.2 Share dialog "Invite with a link" section; verify vitest `inviteLinks.test.tsx`
- [x] 2.3 Acceptance screen and App wiring (return after sign-in); verify vitest `ProjectInviteScreen.test.ts`, `npm run build`
- [x] 2.4 Settings → Administration switch and audit labels; verify `npm test`

## 3. Docs and checks

- [x] 3.1 `docs/sharing.md`, `docs/api.md`, `docs/settings.md`, CHANGELOG, ROADMAP; verify `make docs` (twice, no diff) and `make docs-check`
- [x] 3.2 Layout check covers the acceptance screen and share dialog section; verify the layout script on port 18081 with Chromium
- [x] 3.3 `make check`
