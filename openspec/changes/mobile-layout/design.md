# Design: mobile layout guarantees

## Inventory (what exists today)

| Kind | Where | Problem pattern |
| --- | --- | --- |
| `<details>` menus, absolutely positioned with fixed widths | Sections, ProjectHeader, LabelsView, ViewsView (view menu), WebhooksPanel, AssistantsPanel | anchored to one side of the trigger; a wrapped header puts the trigger anywhere, the panel overflows (patched with `keepInViewport`) |
| Absolute popovers | NotificationBell (`w-80`, right-anchored), TaskConversation mention list | same, plus the bell is not at the screen edge on phones |
| `fixed inset-0` dialogs | NamePrompt, ShareDialog, ReauthDialog, UsersPanel dialogs, VoiceSettings, label and assignee pickers (TaskListView, SavedViewView, FilterView), ShortcutHelp | each with its own padding and scroll behaviour; help needed a one-off fix for iOS |
| Toasts | ReminderToasts (`w-[22rem]` capped) | fixed width, no safe-area padding |
| Tables | ShortcutHelp, AuditPanel, ImportScreen | can force horizontal scroll |
| Hover-only controls | sidebar view menu, label menu (`opacity-0 group-hover:opacity-100`) | invisible on touch screens |

## D1 One overlay module

`web/src/app/overlay/`:

- `Popover` (menus, pickers, the notifications panel, the mention list): below 640 px it renders as a **bottom sheet**: full width, rounded top, max height 80 dvh with its own scroll, a grab handle and a close button. From 640 px up it is positioned next to its anchor: preferred side and alignment, flipped and shifted so the whole panel stays 8 px inside the viewport, re-measured on resize and scroll (a small `position()` helper, no library). It replaces `keepInViewport`.
- `Dialog` (prompts, share, re-auth, confirmations, help): centred card from 640 px up; below 640 px, or whenever its content is taller than the viewport, a full-screen sheet whose overlay scrolls, with a sticky header holding the title and a close button.
- `Toasts` region: bottom-centred on phones with safe-area padding, bottom-right from 640 px up.

All three: Escape closes, a tap outside closes (popover, non-destructive dialogs), focus moves into the overlay and back to the trigger on close, the page behind does not scroll (`overflow: hidden` on `body` while open, restored on close), `role`/`aria-modal`/labels set, and `padding-bottom: env(safe-area-inset-bottom)`. Rendered in a portal at the end of `body` so no ancestor's `overflow` or `transform` clips them.

`<details>` stays usable for disclosure (expand/collapse) but no longer for menus; menus use `Popover` with a button trigger (`aria-haspopup`, `aria-expanded`).

## D2 Layout rules

- Global CSS: `html, body { overflow-x: clip }` is **not** used to hide bugs; instead the layout check fails on overflow. Long words and URLs: `overflow-wrap: anywhere` on task titles, comments, notes, names.
- Heights: `min-h-dvh`/`h-dvh` instead of `100vh` (iOS toolbars); safe-area insets on the header, the bottom sheet, toasts and the quick-add bar.
- Touch targets: a `touch-target` utility (`min-height/min-width: 44px` under `@media (pointer: coarse)`) on icon buttons (bell, help, row menus, chips' remove buttons, sidebar `+`).
- Hover-only controls: under `@media (hover: none)` they are always visible.
- Designated horizontal scroll regions: the board column strip, the week grid and wide tables (`overflow-x: auto` on their own container). Everything else must fit 360 px.
- On-screen keyboard: inputs inside sheets scroll into view on focus (`scrollIntoView({block: 'nearest'})` after the `visualViewport` resize).

## D3 The layout check

`scripts/e2e-layout.mjs` seeds a fresh server through the API (reusing the screenshot script's demo data), then for each viewport (360×740, 390×844, 768×1024) × theme (light, dark) × engine (Chromium, WebKit):

1. visits every route (Inbox, Today, Upcoming, Assigned, Day, Week, Completed, Filter, Trash, Activity, a project in list and board view, a saved view, a dashboard, Labels, Views, Settings, Import, sign-in) and asserts `document.documentElement.scrollWidth <= innerWidth` (designated scroll regions are excluded because their overflow is inside their own box);
2. opens every overlay reachable from that route (each `[aria-haspopup]` trigger, the detail panel, the bell, help, the share dialog, pickers, the rename prompt) and asserts the overlay's bounding box is inside the viewport, its close control is inside the viewport and hit-testable, and that it closes with Escape and with its close button;
3. asserts every interactive element visible on a coarse-pointer viewport is at least 44×44 px (with a short allow list for inline text links);
4. saves a screenshot per failure.

It runs in a new CI job `layout` (after `server`), installing Chromium and WebKit with `npx playwright install --with-deps chromium webkit` in that job only. Locally: `node scripts/e2e-layout.mjs` against a running binary.

## D4 Rollout

1. Overlay module with unit tests; 2. migrate overlays one call site at a time (the inventory above is the checklist); 3. layout rules in CSS; 4. the layout check, first reporting, then failing CI once green. `keepInViewport` and the per-dialog `overflow-y-auto` patches are removed when their call sites move.

## Size impact

Estimated +3 KB gzipped for the overlay module and CSS, partly offset by removing per-call-site overlay markup. No runtime dependency. CI time: about +3 minutes for the layout job.

## Alternatives considered

- **A UI library (Radix, Headless UI, Floating UI).** Solid, but a runtime dependency for something we need in a small subset; AGENTS.md asks to justify every dependency, and the positioning we need fits in a few dozen lines.
- **Fix each overlay as reported.** That is what we did three times; without a shared primitive and a test, it keeps recurring.
- **Hide horizontal overflow globally.** Masks bugs (content becomes unreachable) instead of fixing them.
