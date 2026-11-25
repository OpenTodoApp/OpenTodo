# Tasks

## 1. Client

- [x] 1.1 `scheduleTone` in `web/src/lib/focus/tone.ts`: tones on the audio clock of a running context only, a cancel that silences the ones not started, `started()`, and a callback on the first note's end; the Long constants moved from `alert.ts` (re-exported); verify `tone.test.ts`
- [x] 1.2 The engine schedules the sound while the tab is hidden and the device owns a running timed run (D1), wakes on the tone (D2), claims each end once across tabs and keeps no tone for the return when the background one started (D3), gives a closed or discarded tab's claim back (D3), and stops background Long when shown, when the sound is turned off, or at input in another tab (D4); verify `useFocusTimer.test.tsx` (a closed tab leaves the end to the other, a stop from another tab, sound off while waiting or ringing, pause and resume while hidden, shown before the end, on time with throttled timers, no replay on return, Long stops when shown, a pause cancels, two tabs ring once, a remote session and a tab without woken audio keep the old behaviour)

## 2. Documentation and release

- [x] 2.1 The sound paragraph of `docs/focus-options.md` and `changelog.d/Changed/focus-alert-hidden-tab.md`; verify `make docs` and `make docs-check`
- [x] 2.2 `cd web && npm run typecheck && npm run lint`, the focus tests, `make web && make bundle-budget`, `make openspec-validate`
