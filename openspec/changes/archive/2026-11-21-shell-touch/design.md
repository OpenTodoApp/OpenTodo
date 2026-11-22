# Design

## Context

`web/src/index.css` already treats touch screens apart with `@media (pointer: coarse)`: 44 px targets, 16 px fields, and `user-select: none` on task rows so a held row opens its menu instead of selecting words. Nothing sets `-webkit-tap-highlight-color`, `-webkit-touch-callout` or an `overscroll-behavior` on the page; inner scrollers (sheets, the drawer, menus, the sidebar) use `overscroll-contain`. The document itself does not scroll: `#root` is `100dvh` and `#content` is the list's scroller. The iOS shell (`ShellView.swift`) leaves `allowsLinkPreview` at its default.

## Goals / Non-Goals

**Goals:** the four giveaways gone on touch, in CSS alone, with a precise and checked boundary between chrome and content.

**Non-Goals:** pull to sync, a pressed colour per component, any change with a mouse, any limit on zoom.

## Decisions

### D1. "Touch" is `pointer: coarse`

The same condition the file already uses for targets, fields and rows. It covers the shells, the installed app and a phone's browser alike; the app is an app in all three, and a browser keeps its reload button. Alternative: only in the shells or `display-mode: standalone`. Rejected: a second idiom, and the shells' web views report `display-mode: browser`.

The tap highlight is the exception: `-webkit-tap-highlight-color: transparent` sits on `html` without a media query. It is inherited, only ever painted for touch, and a laptop with a touch screen (fine main pointer) should not flash either.

### D2. Chrome by role, content by default

One rule in the base layer, at zero specificity (`:where`), sets `user-select: none` and `-webkit-touch-callout: none` on:

`button, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="switch"], summary, nav, a.ui-btn, [data-phone-bar], [data-sidebar], [data-page-header]`

Everything inside these follows (a `user-select: auto` child of an unselectable parent is unselectable; the callout property is inherited). A second rule gives `input`, `textarea` and editable areas `user-select: text` and the default callout wherever they sit, because a field inside chrome otherwise takes the chrome's rule (measured: an `input` in an unselectable `nav` computes `none`).

Why this list:

- Controls are named by element and role, which the components already carry, so a new button is covered without thought. Chips that act are buttons; labels that only show are content.
- `nav` covers the tab bar, the sidebar's lists, breadcrumbs, the settings list and progress steps. `[data-phone-bar]`, `[data-sidebar]` and `[data-page-header]` (the shared `PageHeader`) are the three chrome containers that are not `nav`.
- `header` and `a[href]` are deliberately absent. The public task and note pages use `<header>` around a title that is content, and a link in a note must keep its selection and callout. Links that are chrome are inside `nav`, the sidebar or are `a.ui-btn`.
- The title in the task view is a `textarea`, notes are an editable area, comments are `article` text: all content by default, none matched.

In the base layer a `select-text` utility on any element still wins; the existing unlayered row rule (rows unselectable, `[data-row-details]` selectable) is untouched and still wins inside rows.

Alternative: `user-select: none` on `body` and an allow-list of content. Rejected: content is the open set (every new text surface would be unselectable until someone remembered), and the failure is silent. With chrome as the closed set, forgetting costs a selectable label, not lost copy.

### D3. The root ends the overscroll chain

`html, body { overscroll-behavior: none }` under `pointer: coarse`. The document does not scroll, so the only overscroll that reaches it is chained from an inner scroller at its edge: that chain now ends without a bounce, a glow or the browser's reload. Inner scrollers keep `auto` (or their own `contain`), so they scroll, and still show their own edge effect, as before. No `touch-action` and no `preventDefault` is involved, so touch events reach `#content` unchanged: `pull-to-sync` can listen there.

With a mouse or trackpad the rule does not apply: on a Mac it would also remove the two-finger swipe back in history.

Consequence for the iOS shell: its `UIRefreshControl` hangs on the web view's own scroll view, which this rule stops from bouncing, so the pull that reloaded the app is expected to stop triggering. That is the wanted behaviour (the audit lists the reload as a giveaway); the control and its handler stay in `ShellView.swift` for `pull-to-sync` to remove or replace.

### D4. Link previews off in the iOS shell

`webView.allowsLinkPreview = false` next to the other gesture settings in `ShellController.init`. A held link then gets the system's plain link menu instead of a lifted preview. Android's web view has no such preview.

### D5. Zoom is checked, not only left alone

Nothing here touches the viewport tag or `touch-action`. The new measure also fails when the viewport turns zoom off or `html`/`body` carry a `touch-action` other than `auto` or `manipulation`, so a later change cannot trade zoom for feel unnoticed.

### D6. Checked in the layout check

`touchFeel` in `scripts/ux-audit/measure.mjs` runs on every screen and overlay of `scripts/e2e-layout.mjs` (touch emulation, Chromium and WebKit): the page's overscroll, zoom, every visible control and navigation unselectable, every visible field, editable area, comment paragraph and expanded-row detail selectable. `measure.test.mjs` has its passing and failing fixtures.

## Finding: pressed states on touch

Removing the browser's highlight leaves the app's own pressed state as the only feedback, so the audit looked for one (an `:active` rule that applies under touch emulation at 390 px; Tailwind's `hover:` does not apply without a hover-capable pointer):

- **Have one:** every `.ui-btn` (primary, secondary, ghost, danger), which includes icon buttons.
- **Have none:** the tab bar's tabs, the floating add button, task rows and the controls inside them (the check circle, chips), the drawer's sidebar items, and menu items (hover and focus styles only).

### D7. Every control answers a tap

Shipping without the browser's flash and without a pressed state would make the app feel slower than before, so one rule closes the gap: on a coarse pointer, a button, tab, menu item, option, disclosure or link that is not a `.ui-btn` dims to 60% while pressed. It has zero specificity, so a component that later gets its own pressed colour simply wins. A task row is not dimmed as a whole: its body is a gesture surface (hold, swipe, drag), and its checkbox and controls are buttons, which dim.

## Data model, size

No op field, no table, no route, no string. No dependency. The CSS grows by about 0.3 KB before compression; the entry chunk is unchanged at 145.8 KB gzip (budget 146) and the entry with its static imports at 703.1 KB (budget 704).

## Interface budget

No screen gains chrome, properties, destinations or scroll regions, and no scroller is added or removed. No new shortcut.

## Risks / Trade-offs

- **Not verified on a device.** Chromium's touch emulation gives the computed styles and the selection API, not the long-press gesture, the callout, the bounce or the reload; WebKit was not available here. `-webkit-touch-callout` exists only in WebKit. The tasks end with a device checklist.
- **Swift is not compiled here.** One assignment of a public `WKWebView` property; CI is the first compiler.
- **A label someone wanted to copy** (a project's name in a page header) is no longer selectable on a phone. It stays selectable with a mouse, and names are content in the views that edit them.
- **The dim is generic.** It is feedback, not a designed pressed state; components can replace it one by one.
