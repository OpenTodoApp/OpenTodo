# Tasks

## 1. Recognition wrapper and normalisation

- [ ] 1.1 `web/src/lib/voice/recognition.ts`: feature detection, session wrapper (interim/final/error callbacks, on-device request when offered, language), stop on Escape or silence; verify `recognition.test.ts` with a fake `SpeechRecognition` covering start, interim, final, `not-allowed`, `no-speech`, `network`, `language-not-supported` (`npm test`)
- [ ] 1.2 `web/src/lib/voice/spoken/{en,de,fr,it,es,pt}.ts` and `normalizeSpoken()`: hashtag/label/priority words, number words for times and durations, longest-match, deterministic; verify `spoken.test.ts` fixtures including "renew insurance hashtag home priority two" → `renew insurance #home p2` and "standup at nine thirty am" → `standup at 9:30am`, plus a test that every language table defines the same keys

## 2. Quick add integration

- [ ] 2.1 `QuickAdd.tsx`: microphone button (hidden when off), interim text rendering, final insert at caret through the existing change handler so chips appear, no auto-submit, `aria-pressed` and live-region announcements; verify in the browser with a fake recognition injected that dictating "call the dentist tomorrow at nine" yields chips and no task until Enter
- [ ] 2.2 Shell shortcut `v` (guarded against text fields), Escape stops listening first, entry in the `?` help; verify browser flow: `v` announces "Listening", Escape announces "Stopped", typing `v` in the field does nothing
- [ ] 2.3 Error UX: permission-denied help text, quiet stop on no-speech, "unavailable right now" when recognition errors offline, input text preserved in every case; verify unit tests on the state machine and a browser check with permission blocked (`npm test`)

## 3. Settings and privacy

- [ ] 3.1 Settings "Voice capture" section: per-device switch, disabled state with explanation when unsupported, confirmation dialog with the privacy statement before enabling, recognition language override; verify browser flow and that the stored setting is local-only (no op in the outbox)
- [ ] 3.2 Confirm no microphone permission prompt until the first dictation and no server requests beyond sync during dictation; verify with the browser permission log and network panel

## 4. Docs and release

- [ ] 4.1 "Voice" section in `docs/quick-add.md` with the privacy statement, README feature list, `SECURITY.md` note on audio handling, CHANGELOG under Unreleased; verify links resolve
- [ ] 4.2 Final check: `npm test`, `npm run build`, `go test ./...` unchanged, `make check` passes
