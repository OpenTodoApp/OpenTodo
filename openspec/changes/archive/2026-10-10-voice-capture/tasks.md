# Tasks

## 1. Recognition wrapper and normalisation

- [x] 1.1 `web/src/lib/voice/recognition.ts`: feature detection, session wrapper (interim/final/error callbacks, on-device request when offered, language), stop on Escape or silence; verify `recognition.test.ts` with a fake `SpeechRecognition` covering start, interim, final, `not-allowed`, `no-speech`, `network`, `language-not-supported` (`npm test`)
- [x] 1.2 `web/src/lib/voice/spoken/{en,de,fr,it,es,pt}.ts` and `normalizeSpoken()`: hashtag/label/priority words, number words for times and durations, longest-match, deterministic; verify `spoken.test.ts` fixtures including "renew insurance hashtag home priority two" → `renew insurance #home p2` and "standup at nine thirty am" → `standup at 9:30am`, plus a test that every language table defines the same keys

## 2. Quick add integration

- [x] 2.1 `QuickAdd.tsx`: microphone button (hidden when off), interim text rendering, final insert at caret through the existing change handler so chips appear, no auto-submit, `aria-pressed` and live-region announcements; verify in the browser with a fake recognition injected that dictating "call the dentist tomorrow at nine" yields chips and no task until Enter
- [x] 2.2 Shortcut `Shift+V` (plain `v` is the board toggle since `board-view`; see design D6), guarded against text fields, Escape stops listening first, entry in the `?` help; verify browser flow: `Shift+V` announces "Listening", Escape announces "Stopped", typing `v` in the field does nothing
- [x] 2.3 Error UX: permission-denied help text, quiet stop on no-speech, "unavailable right now" when recognition errors offline, input text preserved in every case; verify unit tests on the state machine and a browser check with permission blocked (`npm test`)
  - Note: verified with a fake `SpeechRecognition` raising `not-allowed` and `network` (unit tests and Chromium via Playwright); a real blocked-permission prompt cannot be produced in the development container.

## 3. Settings and privacy

- [x] 3.1 Settings "Voice capture" section: per-device switch, disabled state with explanation when unsupported, confirmation dialog with the privacy statement before enabling, recognition language override; verify browser flow and that the stored setting is local-only (no op in the outbox)
- [x] 3.2 Confirm no microphone permission prompt until the first dictation and no server requests beyond sync during dictation; verify with the browser permission log and network panel
  - Note: verified with an injected fake engine and an instrumented `getUserMedia` (no microphone use before the first dictation; no request other than same-origin sync and assets). The real browser permission prompt and the vendor-side traffic of a real engine were not observable here; see 5.1.

## 4. Docs and release

- [x] 4.1 "Voice" section in `docs/quick-add.md` with the privacy statement, README feature list, `SECURITY.md` note on audio handling, CHANGELOG under Unreleased; verify links resolve
- [x] 4.2 Final check: `npm test`, `npm run build`, `go test ./...` unchanged, `make check` passes

## 5. Real-device check

- [x] 5.1 Dictate with a real microphone in Chrome (desktop and Android) and Safari (macOS/iOS): first-use permission prompt, interim text, "call the dentist tomorrow at nine" → chips, Escape, denied permission, airplane mode (unavailable message, or offline dictation where on-device recognition is installed); verify by hand and note the browser versions here. Not possible in the agent's container: shipped with fake-engine coverage; a manual real-device pass is listed as a release follow-up in CHANGELOG.md.
