# Tasks

Backend tasks are verified with `go test ./...`; frontend tasks with `npm test` and `npm run build` in `web/`, plus `make i18n-check`.

## 1. Email inbox

- [x] 1.1 `Store.Find`, a side-effect free `GET`, and `fullTokens()` on the three routes; verify with `email_test.go` "TestEmailInboxRoutes" and "TestEmailInboxNeedsFullAccess" and the `TestSecurityRoutePolicies` table.
- [x] 1.2 Settings shows only the switch until the inbox exists; verify with `emailInbox.test.tsx` "without an inbox yet, offers only the switch that creates it".

## 2. Security settings

- [x] 2.1 `.credential()` on the webhook, maps, MCP and audit settings writes; verify with `TestCredentialRoutesNeedAdminToken` and `TestSecurityRoutePolicies`.

## 3. Member adds

- [x] 3.1 Shared per-account limit on adds by email and the `project.member_added` event; verify with `sharing_test.go` "TestAddMemberByEmailIsLimitedAndAudited" and `internal/audit` tests.

## 4. Documentation

- [x] 4.1 docs/api.md, docs/email.md and CHANGELOG `### Security`; verify with `make docs-check`.
