# Tasks

## 1. Data

- [x] 1.1 Add `focus_alert` (string, default `""`) to `user_prefs` in `internal/sync/ops.go` `Schema`; regenerate with `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`; add it to `docs/sync.md` and the API surface fixture; verify `go test ./internal/sync/... ./internal/httpapi/...`
- [x] 1.2 `focusPrefs` reads `alert: 'short' | 'long'` (unknown = short) and `setFocusSound(choice)` writes both fields in one `mutate`; verify `prefs.test.ts`

## 2. Client

- [x] 2.1 `playTone(gain)` and the lazily loaded `web/src/lib/focus/alert.ts` (repeat, stop on pointer/key/hidden/10 s, vibration with haptics on); verify `tone.test.ts` and `alert.test.ts`
- [x] 2.2 The engine plays Short or Long at a session end (Long also when a hidden tab is shown again); verify `useFocusTimer.test.tsx` (Long plays repeats and stops at a key press)
- [x] 2.3 Settings → Focus → Sound as one Select (Off, Short, Long), no description; verify `focusSettings.test.tsx` and `make i18n-check`

## 3. Documentation and release

- [x] 3.1 The focus guide's sound paragraph and a changelog fragment `changelog.d/Added/focus-end-alert.md`; verify `make docs-check` and `make repo-check`
- [x] 3.2 `cd web && npm run typecheck && npm run lint && npm run build`, `make bundle-budget`, `make openspec-validate`
