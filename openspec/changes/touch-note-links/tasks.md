# Tasks

## 1. Web app

- [x] 1.1 `linkTaps` in `web/src/lib/linkTap.ts`: the link of a short, still, one-finger tap, or null. Verify: `npx vitest run src/app/task-detail/noteLinkTap.test.tsx` (a tap inside a link answers it; two fingers, a 30 px move, an 800 ms press and a touch outside a link answer nothing).
- [x] 1.2 The editor's `touchstart` and `touchend` handlers in `web/src/app/NotesEditor.tsx`: a tap on a link opens it (`refOf` in the app, `safeHref` in a new tab) and cancels the touch, so no caret and no keyboard. Verify: the same test file (a tap on two web links opens each in a new tab and leaves the focus out of the editor, a tap on a project link opens the project, a move, a long press and a mouse click open nothing; both tap tests fail without the handlers), `npx vitest run src/app/task-detail/noteLinks.test.tsx src/app/task-detail/notesEditing.test.tsx`, `npx tsc -b --noEmit`, `npx eslint` on the changed files.

## 2. Checks in a browser

- [x] 2.1 Built app, Chromium at 390 × 844 with touch: a tap on a web link in a task's notes opens it in a new tab with the focus outside the editor; a tap on a link to a project opens the project; a tap on the text of the notes still starts editing.
- [ ] 2.2 On an iPhone, in the iOS app and in the home-screen web app, and on Android: a tap on a link in a task's notes opens it (the system browser in the apps), a scroll that starts on a link does not, and a tap on text still edits.

## 3. Docs and release

- [x] 3.1 `docs/note-links.md`: tap to open on a phone or tablet. Verify: `make docs`, `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Fixed/touch-note-links.md`. Verify: `node --test scripts/repo-checks.test.mjs`.
