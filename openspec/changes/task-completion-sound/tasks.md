# Tasks

## 1. Preference

- [x] 1.1 Add the additive preference through the op schema and generate the shared fixtures. Add the independent Appearance switch and user-guide entry. Test default-off, keyboard access, offline writes, sync convergence, and unknown values. Run `go test ./...`, `make i18n-check` and `make docs-check`.

## 2. Web cue

- [x] 2.1 Wire foreground completion outcomes to a shared cue without changing the current writes or Undo. Test the first click or keyboard gesture, list and Saved View completion, recurring and nested tasks, one cue per successful bulk action, and silence on reopen, Undo, sync, no-op, failure, or a hidden tab. Verify existing Focus tone tests, `npm test` and `npm run build` in `web/`.

## 3. Mobile shells

- [x] 3.1 Add the optional foreground-only bridge capability and the same two-note cue to both shells. Check shared waveform samples in web and Android, bridge fixtures, and compatibility with older shells. Run the Android unit tests, lint, metadata checks and APK builds. Document the shell and browser behavior.
- [ ] 3.2 Run `make ios` on Xcode, including the shared waveform test and iOS size measurement. Verify playback in Normal and Silent on iOS, Normal/Silent/Vibrate on Android, and coexistence with ongoing media on real phones.

## 4. Integration

- [x] 4.1 Run `make openspec-validate`, `make docs`, `make docs-check`, `make check` and `make bundle-budget`. Record the web, server and Android sizes against the base. Capture the Appearance setting for the eventual review.
