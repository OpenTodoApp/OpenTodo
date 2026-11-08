## Context

GitHub issue 998. Every list row, board card and Today row draws its title through one component, `RowTitle` in `web/src/app/TaskRow.tsx`: `line-clamp-2`, and on the phone row (under 768 px of screen and 40 rem of row) a one-line clamp from `web/src/index.css`. `useOverflowing` measures each title so a cut one gets a tooltip. Long lists skip rows and blocks of rows far from the viewport (`list-rendering-at-scale`, `incremental-list-updates`): a row not drawn yet stands at `--row-estimate`, the average height of the first 40 rows drawn, and a block at that estimate times `--block-rows`.

Display settings of this kind are synced personal preferences: density (`density`) and the task row layout (`row_layout`) are `user_prefs` fields, so this one is too.

## Decisions

### D1. A synced preference, applied as an attribute
`user_prefs.full_titles`: `"on"` shows full titles; empty or any other value reads as off and is kept. It is written with `mutate` like the density (offline, last writer wins, follows the user to every device) and applied like the density: `AppearanceProvider` sets `data-titles="full"` on `<html>`, so turning it on or off re-renders no row. A per-list choice was rejected: the need is the person's way of writing titles, not a list's.

### D2. The stylesheet lifts the clamp
`:root[data-titles="full"] [data-row-title] { -webkit-line-clamp: none; line-clamp: none; }`, outside the layers and more specific than the phone row's one-line rule, so it wins at every width and in both row layouts and on cards. On the phone row the end cell (the date, else the deadline, the avatar or the dot) aligns to the title's first line instead of the middle of a tall title. While the preference is on, `RowTitle` does not measure its title: nothing is cut, so there is no tooltip to decide, and a 2,000-row list saves the measuring.

### D3. Row height estimates
The estimate is still the average of the first rows drawn, so with full titles it follows the real, taller rows. `RowEstimate` measures again when the preference changes, a frame later, once the provider (which runs its effect after the list's) has set the attribute. Blocks keep `contain-intrinsic-size: auto`, so a block that was drawn keeps its last height until it is drawn again.

## Data model

One additive field on `user_prefs`, a string with the empty default. Older clients ignore it. Settings, never content: not encrypted, no activity event.

## Interface budget

One switch in Settings → Appearance. No chrome above a list, no task property, sidebar destination, scroll region or shortcut is added. With the preference on, a row is taller; it shows no more properties.

## Size

A small module, a few CSS rules and one settings row: about 0.2 KB gzip on the first load (685.5 of 686 KB), no dependency, no change to the binary beyond the schema entry.
