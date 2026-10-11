# Mobile layout guarantees

## Why

Phone users keep hitting the same class of bug: an overlay that opens partly off screen or cannot be closed. The keyboard help could not be scrolled or closed on iOS, the view menu opened 122 px past the left edge, and the notifications panel is cut off on the left (it is anchored to the bell's right edge with a fixed 20 rem width). Each overlay positions itself its own way (eleven absolutely positioned `<details>` menus and popovers, ten `fixed inset-0` dialogs, a fixed-width toast stack), and nothing tests the app at phone width, so every fix is one-off and new screens regress. The existing requirement ("works from 360 px phones") is not enforced.

## What Changes

- **One overlay primitive** for every menu, popover, picker, dialog and toast: on phones a menu or popover opens as a bottom sheet across the screen width; on larger screens it is positioned next to its trigger and kept inside the viewport. Dialogs taller than the screen become full-screen sheets with a pinned header and close button. All overlays share Escape, outside tap, focus handling, background scroll lock and safe-area padding.
- **Layout rules for phones:** no horizontal page scroll (only designated regions such as board columns, the week grid and wide tables scroll inside themselves); touch targets at least 44×44 px on touch screens; controls that only appear on hover (row and sidebar menus) are always visible on touch screens; long words and URLs wrap; the on-screen keyboard never hides the focused field; `dvh` units and safe-area insets instead of `100vh`.
- **An automated layout check in CI** that opens every screen and every overlay at 360, 390 and 768 px wide, in light and dark, in Chromium **and WebKit** (Safari's engine), and fails on horizontal overflow, an overlay outside the viewport, an unreachable close control or a too-small touch target.
- The notifications panel, the mention picker, the section, project, label, view and webhook menus, the reminder toasts, the share, rename, label, assignee, voice and re-authentication dialogs and the keyboard help move to the primitive.

## Impact

- **Spec:** `web-app` (requirements added).
- **Code:** a new `web/src/app/overlay/` module (popover, sheet, dialog), every overlay call site listed above, `index.css` (safe areas, `dvh`, touch-target utilities), a new `scripts/e2e-layout.mjs` and a CI job.
- **No server or data change.** No new runtime dependency (positioning is a few dozen lines; no positioning library). CI installs Playwright's WebKit build in the layout job only.
