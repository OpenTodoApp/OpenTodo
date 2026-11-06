# Design

## Context

`QuickAdd` (`web/src/app/QuickAdd.tsx`) has three presentations. In `line`, its input is `bg-transparent` with no border or ring, inside a bare flex row with a `+`. The list pages wrap it in `data-quick-add-row` (`TaskListView.tsx`) with `border-b border-default pb-2` and the sticky classes in `task-list/stickyQuickAdd.ts`. Raised, surface and sunken differ by about 0.02 to 0.04 lightness in dark, so no existing token alone makes a strong difference; the issue asks for subtle.

## Decisions

1. **One component class, `.quick-add-field`, in `@layer components` of `index.css`**, applied to the row in `line` only: `rounded-control border border-transparent bg-sunken px-3 py-1.5 focus-within:border-focus focus-within:ring-2 focus-within:ring-focus/30`. No hover or focus fill: the hover token is almost the raised one, so it would not read. The fill is sunken, not raised, so the field does not look like the raised group headers below it. The border pairs with the ring as `.ui-input` does, because a 30% ring alone is under 3:1 (WCAG 1.4.11). `focus-within` because the real input is nested and transparent. Tokens only, so the token lint passes and themes follow. Alternative rejected: styling the `<input>` itself, which would break the tint layer that mirrors its text.
2. **Dark contrast.** If `sunken` against `surface` is too faint in a theme, the fix is a `--color-field` token set per theme in `index.css`, not a per-screen colour. Decide while checking the stories; start with `sunken`.
3. **The high-contrast presentation** (surface, raised and sunken identical): the class's transparent border becomes `border-default` (until focus).
4. **Divider removed** from the list row (`border-b border-default pb-2`); `mb-3` and the sticky classes stay, and the opaque `bg-surface` pseudo-element keeps rows from showing through.
5. **Chips alignment:** the preview row's `pl-6` becomes the field's left padding plus the `+` width, so chips line up under the text.
6. **Read-only:** `ReadOnlyQuickAdd` gets the same class with disabled, dimmed styling.
7. **All `line` uses** inherit the style because it lives in `QuickAdd`; the palette and sheet branches do not receive the class.

## Interface budget (docs/interface-guide.md)

No row, banner or region is added; the divider goes away and the field gains about 12 px of height (padding). Chrome above the first item stays at two rows, properties and sidebar destinations are untouched, no scroll region is added, and no shortcut is added or changed.

## Data model, size

No data model, op or API impact. No dependency; no effect on image size or memory. The bundle gains a few CSS rules, far under the `web/bundle-budget.json` margin.

## Risks

- Subtlety in dark: verified by the story screenshots and the contrast gate, with the `--color-field` fallback above.
- Visual baselines change for list and quick add stories; regenerate on purpose.
- The field's inner padding moves the text right by that amount; check alignment with the rows below.

## Open questions

None.
