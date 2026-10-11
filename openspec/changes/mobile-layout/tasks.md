# Tasks

## 1. Overlay module

- [ ] 1.1 `web/src/app/overlay/`: `Popover` (bottom sheet below 640 px, anchored and kept in the viewport above), `Dialog` (card or full-screen sheet with pinned header), toast region; portal, Escape, outside tap, focus in and back, scroll lock, safe areas, ARIA; verify unit tests for positioning (flip/shift), focus return and scroll lock (`npm test`)

## 2. Migrate every overlay

- [ ] 2.1 Notifications panel and mention picker to `Popover`; verify layout check passes for them
- [ ] 2.2 Section, project, label, view, webhook and assistants menus from `<details>` to `Popover` with button triggers; remove `keepInViewport`; verify the existing menu tests and the layout check
- [ ] 2.3 Name prompt, share, re-auth, user-admin dialogs, voice consent, label and assignee pickers and keyboard help to `Dialog`; remove the per-dialog overflow patches; verify the layout check
- [ ] 2.4 Reminder toasts to the toast region; verify the layout check

## 3. Layout rules

- [ ] 3.1 CSS: `dvh` heights, safe-area insets (header, sheets, toasts, quick add), `touch-target` utility on icon buttons, hover-only controls visible under `(hover: none)`, `overflow-wrap: anywhere` on user text, designated scroll regions for board, week grid and tables; on-screen keyboard keeps the focused field visible; verify the layout check at 360 px

## 4. Layout check in CI

- [ ] 4.1 `scripts/e2e-layout.mjs`: seed, visit every route, open every overlay, assert no horizontal overflow, overlays and close controls inside the viewport and clickable, Escape and close button work, touch targets ≥ 44 px; screenshots on failure; viewports 360/390/768, light and dark, Chromium and WebKit; verify it passes locally
- [ ] 4.2 CI job `layout` installing Chromium and WebKit; verify the job is green on the PR

## 5. Docs

- [ ] 5.1 `CONTRIBUTING.md`: use the overlay module for any new overlay; run the layout check; CHANGELOG (Fixed); verify `make check`
