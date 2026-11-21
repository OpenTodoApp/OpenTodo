# Proposal

## Why

The audit of the phone apps (`mobile/AUDIT.md`, "Web giveaways") found that touch still behaves like a web page (GitHub issue OpenTodoApp/OpenTodo#1338):

- **A tap flashes.** The browser paints its own highlight over every control that is tapped.
- **A long press on a button selects its label** or lifts a callout, as if a tab or a menu item were a word in an article.
- **The page bounces.** Pulling a list past its top drags the whole app, shows the pull glow and, in a browser and in the iOS app, reloads everything.
- **A long press on a link in the iOS app** lifts a browser preview of it.

None of this happens in an app made for a phone.

## What Changes

On a touch screen (the Android and iOS apps, the installed web app and a phone's browser):

- **No browser tap highlight.** A control shows only the app's own pressed state.
- **Chrome is not text.** Buttons, tabs, the tab bar, navigation, the phone bar, page headers, the sidebar, menu items and options cannot be text-selected or called out by a long press. Content keeps selection and copy: the title in the task view, notes, comments, descriptions, links inside them and every field.
- **The page does not bounce, glow or reload on a pull.** Lists, sheets, menus and the drawer scroll as before.
- **The iOS app shows no link previews.**

Pinch zoom and text scaling stay as they are. With a mouse or trackpad nothing changes except the tap highlight, which a mouse never shows.

Out of scope: pull to sync in place of the reload (`pull-to-sync`), drag to dismiss sheets (`sheet-drag-dismiss`), larger list text (`phone-row-titles`), keyboard hints (`touch-keyboard-hints`), first paint (`shell-first-paint`), transitions (`shell-motion`), and new pressed states for controls that have none (listed in the design, not designed here). The iOS shell's pull-to-reload control stays in the code for `pull-to-sync` to replace.

Advances the ROADMAP item "Shells that feel native" (step 5 of the plan in `mobile/AUDIT.md`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: a new requirement, "Touch behaves like an app": tap highlight, the boundary between chrome and content for selection and callouts, the page's overscroll, zoom kept.
- `native-shells`: a new requirement, "No link previews in the iOS shell".

## Impact

- `web/src/index.css`: about twenty lines in the base layer. No component changes, no new string, no dependency.
- `mobile/ios/OpenTodo/ShellView.swift`: one property.
- `scripts/ux-audit/measure.mjs`, `scripts/e2e-layout.mjs`: the layout check reads the new rules on every screen and overlay.
- No server change, no op field, no environment variable. Nothing is stored, so there is nothing to sync and the behaviour is the same offline. The first-load budget is unaffected (the entry chunk stays at 145.8 KB gzip of 146).
