# Design

## Context

GitHub issue 1349, the follow-up `shell-touch` D7 left open ("components can replace it one by one"). What the code does today:

- **The fallback.** `web/src/index.css`, base layer, `@media (pointer: coarse)`: a button, tab, menu item, option, `summary` or link that is not a `.ui-btn` and not disabled gets `opacity: 0.6` while `:active`. Zero specificity.
- **`.ui-btn`** has its own: `active:bg-selected` (secondary, ghost), `active:bg-danger-soft` (danger), a 1 px shift (primary).
- **No pressed state of their own:** the tabs and the add button (`TabBar.tsx`), `SidebarItem` (`ui/patterns/Sidebar.tsx`), `MenuItem` (`ui/Menu.tsx`, the same item in an anchored menu and in a phone's sheet), and in `TaskRow.tsx` the checkbox, Show details, the subtask chevron and the grip. The row's revealed action cluster is `.ui-btn` and shows on a fine pointer only.
- **The row's body is a button** (`[data-row-open]`: title, marks, metadata), so today the title dims to 60% on touch-down, including at the start of a scroll.
- **Hover does not apply on touch** (Tailwind gates `hover:` behind `hover: hover`), so none of the hover colours show.

## Finding: why the tabs are 44 px

Measured in Chromium, 360 x 740, touch emulation, the layout check's seeded account: each tab 44 px, the bar 45 px with its hairline; with a mouse at the same width 56 and 57 px. The cause is not a height on the bar. `min-h-14` is a utility, inside `@layer utilities`. The touch rule `:where(button, …) { min-height: 44px; min-width: 44px }` at the end of `index.css` is outside every layer, and an unlayered declaration beats a layered one whatever its specificity. So on touch the tab's minimum is 44 px and its content (a 20 px icon, a 2 px gap, a 16 px label) fits inside it.

The spec (`app-shell` "Phone navigation") says at least 48 px. The component says 56 px, and so does everything around it: `TAB_BAR_HEIGHT_REM = 3.5` pads the content column, places the add button 12 px above the bar and lifts toasts. On touch the bar therefore sat 11 px lower than the room kept for it. The component is within the spec; the browser was not giving it what it asked.

## Goals / Non-Goals

**Goals:** the named controls answer a finger in the app's own colours; no stacking with the dim; the tab bar as tall as designed; nothing changes with a mouse; tokens only.

**Non-Goals:** a pressed state for every control, new tokens, transitions, ripples, haptics.

## Decisions

### D1. One utility: `press-<colour>`

`@utility press-*` in `index.css`: under `pointer: coarse`, while `:active` and not disabled, `background-color` is the named colour token, `opacity` is 1 and `transition-duration` is 0. A component names its pressed colour with one class: `press-selected`, `press-danger-soft`, `press-accent-hover`. `--value(--color-*)` accepts theme colours only, so a raw colour cannot be written.

- **No stacking.** The utility sets `opacity: 1` itself, in the utilities layer, above the base layer's dim. The fallback's selector is unchanged and has no list of exceptions to keep.
- **It wins over resting colours without `!important`.** `.press-x:active:not(…)` is more specific than `.bg-accent`.
- **At once.** `MenuItem` has `transition`; a tap is shorter than the fade, so the colour would never be seen. Duration 0 while pressed makes the press instant; the control's own transition still eases the release. Nothing to turn off for reduced motion.
- **Selected, not hover.** `--color-selected` is what `.ui-btn--ghost` shows pressed, and it is visible on canvas, surface and popover in both themes. `--color-hover` is nearly the canvas in light.

Rejected: a selector list in CSS (`[data-tab], [data-sidebar-item], [role^="menuitem"] …`): the danger item and the accent button need their own colours, and a component's pressed state would live away from its other states. A custom variant (`pressed:bg-selected pressed:opacity-100`): two classes that must always travel together.

### D2. The add button darkens

`press-accent-hover`: the accent mixed with black, the token the primary button already uses for hover, so a custom accent gets its own darker shade and the plus keeps its contrast. No scale: the button already moves when the bar minimises.

### D3. A row's small controls: 28 px

The checkbox, the chevrons and the grip are 20 px glyphs with a 44 px target that overlaps their neighbours by design (`-m-3`). Filling the target covered the title's first letter. `press-inset` gives the target 8 px of padding and clips the background to the content box, on touch only: the size and the hit area stay 44 px, the colour is a 28 px circle (`rounded-full` on touch for the three square ones).

### D4. The row tints while its body is pressed

Two declarations beside the hold's tint:

```css
li[data-task-id]:where(:has(> [data-row-open]:active)) { background-color: var(--color-selected-row); }
li[data-task-id] > [data-row-open]:active { opacity: 1; }
```

Why the row and not only its controls: a tap on the title is the most common tap in the app, and its feedback was a dimmed title. Native lists tint the row. `--color-selected-row` is the surface a selected row already has.

Why `:has(> [data-row-open]:active)` and not `li:active`: `:active` reaches every ancestor, so `li:active` would also tint the row under a pressed checkbox or grip. The body is the part that opens the task; the few pixels of row padding around it show nothing.

Gestures. A hold sets `data-touch-hold` after its delay; that rule is later and more specific, so the accent tint replaces the pressed one. A scroll or swipe that starts on a row: the browser sets `:active` on touch-down and clears it when it takes the touch for a scroll, so a tint can show for a moment at the start of a drag. This is not new: the same press dimmed the title until now, and a surface tint is quieter than a 60% title. It could not be measured here (see Risks). If it flashes on a device, deleting the first line returns the row to "controls only" without touching anything else.

Rejected: tinting through a pointer handler with a delay (state, timers and re-renders in the hottest component for a colour).

### D5. Tabs get their height with `!`

`TAB_HEIGHT = 'min-h-14!'` in `phoneFrame.tsx`, used by the tab bar and the cold-start skeleton. An important declaration beats the unlayered 44 px rule; the minimised `min-h-10` stays plain, so on touch a minimised tab is 44 px (the touch minimum) and 40 px with a mouse, as before. The bar's look is otherwise unchanged: same hairline, colours, icons and labels.

Rejected: an exception inside the 44 px rule, or an unlayered `[data-tab]` rule (the skeleton's tabs have no such attribute and would drift from the bar). 48 px exactly: the room under the content, the add button and the toast are all placed for 56.

`touchFeel` (the layout check's touch measure) now fails on a tab under 48 px, the spec's number, so the check does not have to change if the design moves between 48 and 56.

## Data model, size

No op field, no table, no route, no string. No dependency. After the change the entry chunk is 144.6 KB gzip (budget 146) and the entry with its static imports 703.8 KB (budget 704): the stylesheet grows by about 0.5 KB before compression.

## Interface budget

No screen gains chrome, properties, destinations or scroll regions. The tab bar is 12 px taller on touch and fills room the shell already reserved, so no list loses a row. No new shortcut.

## Measured

Chromium, 360 x 740, touch emulation, light and dark, `:active` forced through CDP (`CSS.forcePseudoState`) on the control and its ancestors, computed style read with no wait:

| Control | Before | After (light / dark) |
|---|---|---|
| Tab | opacity 0.6 | `--ot-selected` (oklch 0.9333 / 0.2728), opacity 1 |
| Add button | accent at opacity 0.6 | `--ot-accent-hover`, opacity 1 |
| Menu item | opacity fading to 0.6 | `--ot-selected`, opacity 1 |
| Drawer row | opacity 0.6 | `--ot-selected`, opacity 1 |
| Checkbox, Show details, grip | opacity 0.6 | `--ot-selected` in 28 px, opacity 1; the row untinted |
| Row body | title at opacity 0.6 | title at 1, row `--ot-selected-row` (0.9632 / 0.2389) |
| Tab height | 44 px, bar 45 px | 56 px, bar 57 px |

Without touch (a mouse at 360 px) a forced `:active` changes nothing on a tab or the add button, and the tab is 56 px before and after.

## Risks / Trade-offs

- **Not verified with a finger.** Headless Chromium's emulated touch does not set `:active`, so the states were forced. Whether the row's tint flashes when a scroll starts on a row, and how the states feel in WKWebView (which sets `:active` only with touch listeners present, as the app has), is a device check for the owner.
- **The current drawer row** already has the selected surface, so pressing it shows no change. It is the page the person is on.
- **Baselines.** Every touch-emulated phone screenshot with the tab bar changes by 12 px at the bottom.
