# Tasks

## 1. Server

- [x] 1.1 Migration `0028_assistant_member_provider.sql` (`assistant_member_provider`, `assistant_usage_own_key`, idempotent, cascades); verify `TestMigrationAssistantMemberProvider` (`go test ./internal/store/`)
- [x] 1.2 Member choice, validation (no compatible, Anthropic list, 100-char charset) and per-turn resolution in `internal/assistant/member.go`; verify `TestValidateMemberChoice`, `TestResolveMatrix`, `TestRouteNeverPrintsKey`, `TestMemberChoiceAudited` (`go test ./internal/assistant/`)
- [x] 1.3 `cap_member_keys` setting, own-key usage and `Usage.Counted`; verify `TestUsageOwnKeyCounted` and `TestMemberKeyCap` (`go test ./...`)
- [x] 1.4 `GET/PUT /api/v1/me/assistant` fields, turn route on the resolved route (consent, cap, provider, usage event, own-key auth message), owner view count; verify `TestMemberProviderResolution`, `TestMemberProviderValidation`, `TestLegacyOwnKeyStillWorks` (`go test ./internal/httpapi/`)
- [x] 1.5 `POST /api/v1/me/assistant/test` (session only, rate limited, own provider only); verify `TestMemberConnectionTest`
- [x] 1.6 Keys never in responses, database, logs, export or backups; verify `TestMemberKeysNotInExport`, the log check in `TestMemberProviderResolution`, `TestBackupExcludesAssistantSecrets` with a member key

## 2. Web

- [x] 2.1 Types and API client (`assistantStatus.ts`, `assistantTypes.ts`, `api.ts`), usage line "your key"; verify `npm test` (`src/lib/assistant.test.ts`)
- [x] 2.2 "Which assistant you use" in Settings → AI → Assistant, kept-choice note, owner cap switch and count; verify `src/app/assistantSettings.test.tsx` (`npm test`, `npm run build` in web/)
- [x] 2.3 Consent names the member's provider and key; verify `src/app/assistantConsent.test.tsx`

## 3. Docs

- [x] 3.1 `docs/assistant.md`, `docs/api.md`; `make docs` twice with no diff; verify `make docs-check`
- [x] 3.2 CHANGELOG entry under Unreleased

## 4. Verify

- [x] 4.1 `make check` passes
- [x] 4.2 `npx @fission-ai/openspec validate --all --strict` passes
- [x] 4.3 Layout check on port 18082 (chromium) passes; main chunk size unchanged
