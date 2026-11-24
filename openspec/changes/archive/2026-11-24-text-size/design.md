# Design

## D1. One scale on the root
The app's type, spacing and breakpoints are in rem, so one number on the root scales everything together. `html` gets `font-size: calc(100% * var(--ot-text-scale, 1))`: a percentage, so a browser's own font-size setting still multiplies it (WCAG 1.4.4), and in the base layer, so the print rule still wins. Steps: Default 1 (or the system scale in the apps), Large 1.125, Larger 1.25, Largest 1.5. A system scale is clamped to 0.85–2 (200 %, what the accessibility audit checks).

## D2. Device-local, applied before the first frame
The choice is stored under the device key `opentodo.textSize` (only `large`, `larger` and `largest` are stored; anything else reads as Default), never synced, exported or cleared at sign-out: a reading need belongs to the device and the eyes in front of it. `public/appearance.js` applies it before the first paint, as it does for the theme; `web/src/lib/textSize.ts` keeps it in step afterwards and across tabs.

## D3. Following the phone
- **iPhone and iPad**: WebKit resolves `font: -apple-system-body` to the Dynamic Type body size of the app (17 px at the default size). Inside the iOS shell the page measures a hidden probe with that font and divides by 17. A ResizeObserver on the probe and the page becoming visible again pick up a change made in Settings or Control Center. No native change. `-webkit-text-size-adjust: 100%` stops WebKit's own text inflation on rotation.
- **Android**: the shell keeps the web view's own `textZoom` on each page until the page calls `opentodoShell.textScaleApplied()` (the boot script, and the hook again), then sets it to 100, so WebView does not scale text a second time (its zoom enlarges text without reflowing the rem layout) while an older server's web app keeps the system size. It hands `Configuration.fontScale` to the page as `opentodoShell.textScale`. A font-scale change recreates the activity, so the page reloads with the new value.
- **Browser**: no system scale (1); the browser's own text size and zoom keep working.

## D4. Fields
The touch-field rule keeps fields at 16 px or more so Safari never zooms on focus; its 16 px becomes `max(16px, <token in rem>)`, the list step read from the root's own list size (OpenTodo's or a theme's) through `--ot-field-list`, so a field grows with the text size like the text around it.

## D5. Interface budget
One Settings row (a native select, which fits at 360 px at every step); no chrome above lists, no new property, destination, scroller or shortcut. At Largest at 360 px rows, sheets and the tab bar keep their controls inside the viewport (checked by `scripts/ui-check/text-size.spec.ts`).

## D6. Breakpoints
Media queries measure rem against the browser's initial size, not the root's, so the app's breakpoints stay where they are and a phone stays in the phone layout at every step; only the browser's own text size moves them. The one narrow-width rule that exists for large text (the phone bar's Process button dropping to its icon) becomes a container query on the phone bar, whose rem is the root's, so it follows this setting as well as the browser's.

## Data model and size
No op, field or API change. No dependency; well under 1 KB of first-load JavaScript. No effect on image size or memory.

## D7. Display mode
Display mode has its own type scale (M, L, XL), so `--display-scale` is divided by the text scale: the device's text size does not multiply it.
