# Tasks

## 1. Server

- [x] 1.1 Migration `0064_routine_email_stops.sql` (`routine_email_links`, `routine_email_stops`) and the store: mint a link (hash only, prune after 365 days), resolve a link, record a stop, list a routine's stopped members; verify `go test ./internal/rules/... ./internal/store/...`
- [x] 1.2 `ruleval.Available`: no `not_yet` for `email_members` in a shared routine; verify `go test ./internal/ruleval/...`
- [x] 1.3 The engine's Email project members step: recipients at plan and at send (D1), the daily counts per message (D2), the side effect; verify the rules tests (recipients, member who left, over the limit, stopped member)
- [x] 1.4 Mail: the `routine_members` template in seven languages with `Stop`; verify `go test ./internal/mail/...`
- [x] 1.5 HTTP: the mailer's recipients and member send (language, stop link), the two public routes with the limiter, audit and headers, the demo deny list, the route matrix, log redaction of `ots_`; verify `go test ./internal/httpapi/...`

## 2. Web

- [x] 2.1 `sharedCatalogue` offers the step when the only reason is `not_shared`; verify `shared.test.ts`
- [x] 2.2 The stop page behind `/routine-emails/<secret>`, in the task page document (`t.html`) and its strings in every catalogue; verify its test, `make i18n-check` and `make bundle-budget`

## 3. Documentation and release

- [x] 3.1 `docs/routines.md`, `docs/api.md`, the changelog fragment `changelog.d/Added/routines-shared-email.md`; verify `make docs-check` and `make repo-check`
- [x] 3.2 `make openspec-validate`, `cd web && npm run typecheck && npm run lint`
