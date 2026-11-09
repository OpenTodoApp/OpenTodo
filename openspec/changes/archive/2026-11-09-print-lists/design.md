# Design

## Context

The app shell is a full-height flex layout whose content `#content` scrolls; rows use `content-visibility: auto` (`.row-offscreen`, `.row-block`) so the browser skips rows far from the viewport. Colours are `--ot-*` tokens, set by the stylesheet's light and dark blocks, the high-contrast blocks and a custom theme's generated `<style id="ot-theme">`. Printing today inherits all of that.

## Decisions

### D1. A stylesheet, not a print view
The browser already prints, paginates and saves as PDF; the list on screen already has the grouping, order, subtasks and folds the person chose. One `@media print` block in `index.css` turns that page into paper, so there is no second rendering of a list to keep in step, no dialog and no setting. The menu item only calls `window.print()`, one frame after the menu closed.

### D2. Tokens, not element colours
Black on white in every theme is done by overriding the colour tokens under `@media print` with `!important`: important declarations beat the unlayered theme rule and the high-contrast blocks whatever their specificity. Surfaces, soft fills and tints become white, text black, muted and faint dark greys, borders light greys; the priority colours take their light values so the checkbox ring and the mark keep their meaning in a dark theme. Shadows are removed. No element is coloured on its own.

### D3. What is hidden
By the shell's structure, not a list of components: everything in `<body>` but the app root (portalled overlays, toasts, the assistant), every sibling of the content frame (sidebar, panels, tab bar, add button), everything in the frame but the content and the phone bar's title; then the page's actions, Back, the quick add, a row's revealed actions, grip and expand control, a group's actions, the add-task and add-section controls and Close the day.

### D4. Paper width
An A4 or Letter page leaves about 700 px. Two things follow:
- The phone row's rules (one line, 44 px, a single cell) were keyed to `(width < 48rem)`, which a printed page also matches; they now read `screen and (width < 48rem)`, so paper keeps the property column. Screens are unchanged.
- The print root font is 87.5 % (14 px), so a row on the page is at least 48 rem wide and keeps its date, project and labels cells (under 48 rem the column drops its third cell). The estimate and assignee cells need 56 rem and are left to the task page, as on a narrow window.

### D5. Every row, whole
The scrolling ancestors become `display: block; height: auto; overflow: visible`, the sticky header static, and `.row-offscreen` and `.row-block` `content-visibility: visible`, so every row is laid out and flows onto the pages. A row has `break-inside: avoid`; a group header `break-after: avoid`. A title's two-line clamp is lifted: paper has no tooltip.

### D6. Where Print… is offered
At the end of the menu each list page already has: the page header's "…" for the built-in views (now always present, also where it held only Print…), the Inbox menu (always present for the same reason), the label menu, and in the list layout the project menu and a saved view's menu. The view menu in the sidebar and in Favourites does not get it: it would print the page that is open, not that view. The item is one shared builder, so the word, icon and behaviour cannot drift. In a native shell (`shell()` present) the item is left out, and a menu that held only it is not shown: Android's WebView and iOS's WKWebView ignore `window.print()`. A shell capability for printing can bring it back later.

## Data model and sync

None.

## Interface budget

No new row of chrome, property, destination, scroll region or shortcut: one menu item at the end of existing menus. Print is the browser's own Ctrl+P / Cmd+P.

## Size

About 0.3 KB gzip of first load (the print block, the item, the `printer` icon). No dependency, no server change.
