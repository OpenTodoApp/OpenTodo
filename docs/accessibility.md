---
title: Accessibility
summary: OpenTodo's accessibility statement: WCAG 2.2 Level AA, what is covered and how it is tested, the result for every criterion and screen, and how to report a barrier.
audience: user
section: Reference
specs: [accessibility]
screens: []
order: 85
---
# Accessibility

OpenTodo is used every day, often for hours, by people who use a keyboard only, a screen reader, a switch, voice control, a magnifier or large text. It should work for all of them. This page says how far it does today, honestly, and how it is kept that way.

## Conformance status

**Standard:** [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/), Level AA.

**Status:** <!-- accessibility:claim -->**Partially conforms**<!-- /accessibility:claim -->. Every screen passes the automated checks below on every change, and no failure is known. OpenTodo 1.0 claims partial conformance: the keyboard-only and 200% zoom passes of the [audit record](accessibility/audit-1.0.0.md) are done on every core screen, and no screen-reader pass (NVDA, VoiceOver, TalkBack) is recorded yet. Screen-reader passes are recorded when someone runs them and do not hold a release back; the record has the steps, and you can contribute one through [issue #9](https://github.com/OpenTodoApp/OpenTodo/issues/9).

**Applies to:** OpenTodo 0.23 and later (the web app on every server, and the app inside the Android and iOS shells), as of 3 November 2026.

## What is covered

- Every screen and overlay of the app: the 107 entries of the screen inventory (`scripts/ux-audit/screens.json`), from the Inbox to the settings pages, the signed-out screens and the shared pages. 59 of them are core (used daily or weekly).
- This documentation, the docs website and the help inside the app.
- The native screens of the Android and iOS shells (connecting to a server, settings, widgets).
- The browser extension's popup.

Not covered: what people write themselves (an image without a description in a note), and pages of other services the app links to (a sign-in provider, a calendar).

## How it is tested

- **Every change, every screen.** Each pull request that touches the app opens every inventory entry against a fresh server at 360 and 1280 px wide, light and dark, and fails on any serious or critical [axe-core](https://github.com/dequelabs/axe-core) finding of the WCAG 2.0, 2.1 and 2.2 A and AA rules, and on the criteria axe cannot see: a focused element without a visible ring (2.4.7) or hidden under a header, bar, toast or sheet (2.4.11), a target smaller than 24 px without space around it (2.5.8), sideways scrolling at 320 px wide, which is 1280 px at 400% zoom (1.4.10), text cut off with wider text spacing (1.4.12), and a password or code field without autocomplete or that refuses a paste (3.3.8).
- **Every night, more.** The same checks at 360, 768 and 1280 px, in English and German, with the browser's text size at 20 px.
- **Every component.** Each component of the design workbench is checked with axe in light and dark, and its screen stories with a focus walk.
- **Long lists.** A 2,000-task project is checked as a screen reader gets it: every row in the accessibility tree with its controls, in one named list per section, although the browser skips drawing rows far off screen.
- **No dragging needed.** A test fails when a drag, resize or swipe has no way to do the same with one click or tap (2.5.7, 2.5.1).
- **The native shells.** Android's accessibility lint checks are errors; the iOS app's UI tests run the system's accessibility audit.
- **The docs website** is checked with axe-core on every change to the docs, at phone and computer widths. **The browser extension's** popup and settings page were checked with axe-core in light and dark for this statement (no finding after one fix: the settings page's Save button contrast).
- **By people, at least once a year.** A keyboard-only pass, NVDA with Firefox, VoiceOver with Safari, VoiceOver and TalkBack in the phone apps, and 200% zoom with large text, on every core screen, recorded in the [audit record](accessibility/audit-1.0.0.md). A release is refused when the latest record is more than 12 months old, or from 1.0.0 on while a keyboard or zoom pass of a core screen is pending; pending screen-reader passes are named in the release instead.

## Results by criterion

| Criterion | Level | Result | How it is known |
|---|---|---|---|
| 1.1.1 Non-text content | A | Supports | axe on every screen; icons are named or hidden, images have descriptions |
| 1.2.1 to 1.2.5 Time-based media | A, AA | Not applicable | OpenTodo has no audio or video content |
| 1.3.1 Info and relationships | A | Supports | axe; lists, headings, landmarks and form labels in every screen; screen-reader pass pending |
| 1.3.2 Meaningful sequence | A | Supports | reading order follows the layout; screen-reader pass pending |
| 1.3.3 Sensory characteristics | A | Supports | instructions name controls, never only a shape or a place |
| 1.3.4 Orientation | AA | Supports | every screen works in both orientations |
| 1.3.5 Identify input purpose | AA | Supports | name, email and password fields carry `autocomplete` |
| 1.4.1 Use of color | A | Supports | priority, state and errors are also shown with text, icons or shape |
| 1.4.2 Audio control | A | Not applicable | nothing plays sound on its own |
| 1.4.3 Contrast (minimum) | AA | Supports | axe on every screen in light and dark; token contrast tests |
| 1.4.4 Resize text | AA | Supports | the nightly check at text size 20; 200% zoom in the manual audit |
| 1.4.5 Images of text | AA | Supports | no images of text |
| 1.4.10 Reflow | AA | Supports | every screen at 320 px; the calendar grids, the timeline, boards and tables scroll inside themselves only |
| 1.4.11 Non-text contrast | AA | Supports | axe; focus rings and control borders use contrast-checked tokens |
| 1.4.12 Text spacing | AA | Supports | every screen with the WCAG text-spacing styles |
| 1.4.13 Content on hover or focus | AA | Supports | tooltips stay while pointed at and close with Escape |
| 2.1.1 Keyboard | A | Supports | every action has a key or a focusable control; focus walk on every screen; keyboard pass in the audit |
| 2.1.2 No keyboard trap | A | Supports | dialogs keep focus inside and return it on Escape |
| 2.1.4 Character key shortcuts | A | Supports | single-key shortcuts can be turned off (**Settings → General → Keyboard**) and never fire while typing |
| 2.2.1 Timing adjustable | A | Supports | toasts pause while pointed at or focused; nothing else has a time limit |
| 2.2.2 Pause, stop, hide | A | Supports | no moving content; motion follows the system's reduced-motion setting |
| 2.3.1 Three flashes | A | Supports | nothing flashes |
| 2.4.1 Bypass blocks | A | Supports | a skip link and landmarks on every screen |
| 2.4.2 Page titled | A | Supports | the tab title names the screen |
| 2.4.3 Focus order | A | Supports | focus walk on every screen; dialogs and the phone drawer make the page behind inert |
| 2.4.4 Link purpose (in context) | A | Supports | axe; links say where they go |
| 2.4.5 Multiple ways | AA | Supports | sidebar, search and the command bar |
| 2.4.6 Headings and labels | AA | Supports | every screen has a heading; every field a label |
| 2.4.7 Focus visible | AA | Supports | the gate's focus walk on every screen and overlay |
| 2.4.11 Focus not obscured (minimum) | AA | Supports | the gate's focus walk; toasts and sticky bars keep clear of the focus |
| 2.5.1 Pointer gestures | A | Supports | every swipe has a menu item |
| 2.5.2 Pointer cancellation | A | Supports | actions run on release |
| 2.5.3 Label in name | A | Supports | axe; visible words are part of every name |
| 2.5.4 Motion actuation | A | Not applicable | nothing reacts to shaking or tilting |
| 2.5.7 Dragging movements | AA | Supports | every drag has a one-pointer way, checked by a test |
| 2.5.8 Target size (minimum) | AA | Supports | the gate's measure on every screen |
| 3.1.1 Language of page | A | Supports | the page's language follows the interface language |
| 3.1.2 Language of parts | AA | Supports | the interface is one language at a time; what people write is theirs |
| 3.2.1 On focus | A | Supports | focus never changes the screen |
| 3.2.2 On input | A | Supports | a setting changes only what it says |
| 3.2.3 Consistent navigation | AA | Supports | one sidebar and tab bar everywhere |
| 3.2.4 Consistent identification | AA | Supports | one component library |
| 3.2.6 Consistent help | A | Supports | Help is in the same place on every screen |
| 3.3.1 Error identification | A | Supports | fields name their error in text |
| 3.3.2 Labels or instructions | A | Supports | axe; every field has a label |
| 3.3.3 Error suggestion | AA | Supports | errors say how to fix them |
| 3.3.4 Error prevention (legal, financial, data) | AA | Supports | deleting is undoable or confirmed; the Trash keeps tasks |
| 3.3.7 Redundant entry | A | Supports | forms keep what you typed |
| 3.3.8 Accessible authentication (minimum) | AA | Supports | paste and password managers work; passkeys where the server allows them; no puzzle |
| 4.1.2 Name, role, value | A | Supports | axe on every screen; screen-reader pass pending |
| 4.1.3 Status messages | AA | Supports | sync, saves, undo and errors are announced in live regions; screen-reader pass pending |

## Results by screen

The automated gate runs on every pull request; "not toured" screens are only reachable on a new server or in the first run and are checked through their workbench stories. The manual columns summarise the [audit record](accessibility/audit-1.0.0.md).

<!-- accessibility:results -->
| Screen | Use | Automated gate | Manual audit |
|---|---|---|---|
| `inbox` | core | pass | 2 of 6 passes done, 4 pending |
| `today` | core | pass | 2 of 6 passes done, 4 pending |
| `upcoming` | core | pass | 2 of 6 passes done, 4 pending |
| `project` | core | pass | 2 of 6 passes done, 4 pending |
| `board` | core | pass | 2 of 6 passes done, 4 pending |
| `task` | core | pass | 2 of 6 passes done, 4 pending |
| `task-panel` | core | pass | 2 of 6 passes done, 4 pending |
| `panel-comments` | core | pass | 2 of 6 passes done, 4 pending |
| `panel-activity` | core | pass | 2 of 6 passes done, 4 pending |
| `panel-history` | core | pass | 2 of 6 passes done, 4 pending |
| `panel-time` | core | pass | 2 of 6 passes done, 4 pending |
| `when-popover` | core | pass | 2 of 6 passes done, 4 pending |
| `label-picker` | core | pass | 2 of 6 passes done, 4 pending |
| `command-palette` | core | pass | 2 of 6 passes done, 4 pending |
| `sidebar` | core | pass | 2 of 6 passes done, 4 pending |
| `quick-add` | core | pass | 2 of 6 passes done, 4 pending |
| `add-menu` | core | pass | 2 of 6 passes done, 4 pending |
| `sidebar-new-project-appearance` | rare | pass | not in the manual audit |
| `sidebar-new-label-colour` | rare | pass | not in the manual audit |
| `notifications` | core | pass | 2 of 6 passes done, 4 pending |
| `bulk-actions` | core | pass | 2 of 6 passes done, 4 pending |
| `undo-toast` | core | pass | 2 of 6 passes done, 4 pending |
| `triage` | core | pass | 2 of 6 passes done, 4 pending |
| `day` | core | pass | 2 of 6 passes done, 4 pending |
| `week` | core | pass | 2 of 6 passes done, 4 pending |
| `month` | core | pass | 2 of 6 passes done, 4 pending |
| `year` | core | pass | 2 of 6 passes done, 4 pending |
| `plan` | core | pass | 2 of 6 passes done, 4 pending |
| `timeline` | core | pass | 2 of 6 passes done, 4 pending |
| `columns` | core | pass | 2 of 6 passes done, 4 pending |
| `assigned` | core | pass | 2 of 6 passes done, 4 pending |
| `someday` | core | pass | 2 of 6 passes done, 4 pending |
| `anytime` | core | pass | 2 of 6 passes done, 4 pending |
| `next` | core | pass | 2 of 6 passes done, 4 pending |
| `waiting` | core | pass | 2 of 6 passes done, 4 pending |
| `loop` | core | pass | 2 of 6 passes done, 4 pending |
| `focus` | core | pass | 2 of 6 passes done, 4 pending |
| `review` | core | pass | 2 of 6 passes done, 4 pending |
| `stats` | core | pass | 2 of 6 passes done, 4 pending |
| `completed` | core | pass | 2 of 6 passes done, 4 pending |
| `notes` | core | pass | 2 of 6 passes done, 4 pending |
| `trash` | core | pass | 2 of 6 passes done, 4 pending |
| `feed` | core | pass | 2 of 6 passes done, 4 pending |
| `ask` | core | pass | 2 of 6 passes done, 4 pending |
| `filter` | core | pass | 2 of 6 passes done, 4 pending |
| `views` | core | pass | 2 of 6 passes done, 4 pending |
| `view` | core | pass | 2 of 6 passes done, 4 pending |
| `dashboard` | core | pass | 2 of 6 passes done, 4 pending |
| `labels` | core | pass | 2 of 6 passes done, 4 pending |
| `label` | core | pass | 2 of 6 passes done, 4 pending |
| `projects` | core | pass | 2 of 6 passes done, 4 pending |
| `settings` | core | pass | 2 of 6 passes done, 4 pending |
| `settings-account` | core | pass | 2 of 6 passes done, 4 pending |
| `settings-appearance` | core | pass | 2 of 6 passes done, 4 pending |
| `share` | core | pass | 2 of 6 passes done, 4 pending |
| `project-menu` | core | pass | 2 of 6 passes done, 4 pending |
| `section-menu` | core | pass | 2 of 6 passes done, 4 pending |
| `assistant` | core | pass | 2 of 6 passes done, 4 pending |
| `help-panel` | core | pass | 2 of 6 passes done, 4 pending |
| `label-menu` | core | pass | 2 of 6 passes done, 4 pending |
| `view-menu` | core | pass | 2 of 6 passes done, 4 pending |
| `workspaces` | rare | pass | not in the manual audit |
| `settings-general` | rare | pass | not in the manual audit |
| `settings-notifications` | rare | pass | not in the manual audit |
| `settings-capture` | rare | pass | not in the manual audit |
| `settings-about` | rare | pass | not in the manual audit |
| `settings-integrations` | rare | pass | not in the manual audit |
| `settings-data` | rare | pass | not in the manual audit |
| `settings-people` | rare | pass | not in the manual audit |
| `settings-server` | rare | pass | not in the manual audit |
| `import` | rare | pass | not in the manual audit |
| `places` | rare | pass | not in the manual audit |
| `place` | rare | pass | not in the manual audit |
| `rules` | rare | pass | not in the manual audit |
| `routine-page` | rare | pass | not in the manual audit |
| `routine-new` | rare | pass | not in the manual audit |
| `theme-editor` | rare | pass | not in the manual audit |
| `routine-word-list` | rare | pass | not in the manual audit |
| `routine-trigger-list` | rare | pass | not in the manual audit |
| `routine-add-step` | rare | pass | not in the manual audit |
| `projects-archived` | rare | pass | not in the manual audit |
| `help` | rare | pass | not in the manual audit |
| `help-guide` | rare | pass | not in the manual audit |
| `capture` | rare | pass | not in the manual audit |
| `display-today` | rare | pass | not in the manual audit |
| `display-today-high-xl` | rare | pass | not in the manual audit |
| `display-upcoming` | rare | pass | not in the manual audit |
| `display-project` | rare | pass | not in the manual audit |
| `display-view` | rare | pass | not in the manual audit |
| `public` | rare | pass | not in the manual audit |
| `public-display` | rare | pass | not in the manual audit |
| `task-page` | rare | pass | not in the manual audit |
| `sign-in` | rare | pass | not in the manual audit |
| `forgot` | rare | pass | not in the manual audit |
| `routine-email` | rare | pass | not in the manual audit |
| `reset` | rare | pass | not in the manual audit |
| `verify` | rare | pass | not in the manual audit |
| `confirm-email` | rare | pass | not in the manual audit |
| `invite` | rare | pass | not in the manual audit |
| `project-invite` | rare | pass | not in the manual audit |
| `project-invite-member` | rare | pass | not in the manual audit |
| `workspace-invite` | rare | pass | not in the manual audit |
| `owner-setup` | rare | not toured (see note) | not in the manual audit |
| `start-guide` | rare | not toured (see note) | not in the manual audit |
| `spotlight` | rare | pass | not in the manual audit |
| `template-dialog` | rare | pass | not in the manual audit |
| `fields-dialog` | rare | pass | not in the manual audit |
| `duplicate-project` | rare | pass | not in the manual audit |
| `location-editor` | rare | pass | not in the manual audit |
| `voice-consent` | rare | pass | not in the manual audit |
<!-- /accessibility:results -->

## Known exceptions

None known. A failure found later is listed here with the criterion, the screen, a workaround, its issue and the version that fixes it.

## Report a barrier

If something in OpenTodo stops you or slows you down, please [open an issue](https://github.com/OpenTodoApp/OpenTodo/issues/new?labels=accessibility) with the label `accessibility`, or use any of the ways in [Feedback and support](feedback-and-support.md). Say what you tried, with which browser, assistive technology and device. Every accessibility report gets an answer within 10 business days, and a barrier on a screen used every day is fixed before anything else.
