# Design

## Context

See proposal.md (Why). This change depends on `design-language`, which delivers the Tailwind 4 `@theme` tokens (canvas/surface/raised, accent/accent-soft, priority p1–p4, status, 12-hue palette solid+soft, type, 4 px spacing, radius 6/10/14/full, elevation 0–3, motion), Storybook in `web/.storybook`, and the CI gates: axe on every story, plus Playwright visual regression of the static Storybook in light/dark at 375 and 1280 px.

What already exists and is reused:

- **`web/src/app/overlay/`**: Popover (bottom sheet below 640 px, anchored panel above, viewport-fitted), Menu (trigger plus Popover, `aria-haspopup="dialog"`, items are hand-built `btn-ghost` buttons, no arrow-key navigation), Dialog, the focus/Escape stack (`stack.ts`, `useOverlay.ts`). `web-app` "Consistent overlay behaviour" and "Overlays fit every screen" already cover Escape, focus return and viewport fit; primitives inherit them rather than re-specify them.
- **`AssigneePicker.tsx` / `LabelPicker.tsx`**: two near-identical type-ahead listboxes (substring filter, ↑/↓/Enter/Esc, `inline` absolute list or dialog mode). They do not use Popover and do not announce result counts.
- **Icons**: about 30 emoji or Unicode glyphs (inventory: `› × ✓ ▾ ▸ ✕ ↑ ↓ ↻ ← ⏰ ▦ ↳ ⇧ ⌄ ☰ ○ 💬 ‹ 🔔 ↶ ⋯` plus the sidebar's 📥 📅 🗓 👤 🕘 📆 ✅ 🔎 🗑 📰 ⚙) and 5 inline SVGs (mic, shared, lock×2, QR). `→` and `…` mostly appear in copy text and stay as typography.
- **Dexie**: schema v13; `prefs` is a *synced* entity table. `clearLocalData()` wipes local tables on sign-out.

## Goals / Non-Goals

**Goals:**
- One `web/src/ui/` package that screens import; nothing in it reaches into `src/lib` data except through props, apart from the `pickRank` helper.
- Primitives that are accessible by construction: correct roles, names and keyboard models baked in, so screens cannot easily get them wrong.
- Zero new runtime dependencies.

**Non-Goals:**
- Headless-library parity, theming APIs or a public npm package.
- Migrating screen layouts (owned by the three redesign changes); here, only the icon swap and the two picker rebuilds touch screens.
- A virtual-list library: windowing is implemented inside Combobox only.

## Decisions

### D1. Location and layering
`web/src/ui/` holds the primitives (`Button.tsx`, `Icon.tsx`, `Combobox/`, …), `web/src/ui/icons/` the icon data, and `web/src/ui/patterns/` the composites (SettingsSection, SettingRow, Timeline, EmptyState). Each file has co-located `*.stories.tsx` and `*.test.tsx`. `web/src/ui/index.ts` re-exports the public API. `app/overlay/` stays where it is: it is infrastructure that primitives compose. Its Menu gains item semantics (D5) instead of being forked.
*Alternative*: moving overlay into `ui/`. Rejected: churn across about 40 imports with no behaviour gain. Revisit when screens migrate.

### D2. Icons vendored from Lucide, not imported
`web/src/ui/icons/lucide.ts` holds a typed `Record<IconName, string>` of SVG inner markup (paths) for about 50 Lucide icons at a pinned upstream version, plus `LICENSE-lucide.txt` (ISC). `<Icon name size? label? />` renders a `24×24` viewBox, `stroke="currentColor"`, `stroke-width` 2 (1.75 at 20 px or more), `fill="none"`, `aria-hidden` unless a `label` is given (then `role="img"` and `aria-label`). `scripts/icons-sync.mjs` (dev-only, run by hand) regenerates the file from a list of names, reading a local checkout or npm tarball of `lucide-static`, so there is no network access at build time. A unit test asserts every `IconName` is used or explicitly allow-listed, and that no emoji or glyph icon remains in `web/src/app` (D10).
*Alternatives*: `lucide-react` (simple, tree-shakes, but a runtime dependency for about 50 static paths, which conflicts with AGENTS.md "justify every dependency"); an SVG sprite file (an extra request and awkward with `currentColor` in some browsers). Vendored strings cost about 6–8 KB gzipped for 50 icons.

Initial mapping (screen PRs may add icons through the sync script):

| Today | Icon | Today | Icon |
|---|---|---|---|
| 📥 Inbox | `inbox` | ⋯ menus | `ellipsis` |
| 📅 Today | `calendar-check` (with day number overlay deferred) | ✕ / × clear, close | `x` |
| 🗓 Upcoming | `calendar-days` | ▸ / ▾ disclosure | `chevron-right` (rotates) |
| 📆 Calendar | `calendar-range` | › ‹ ← → nav | `chevron-right/left`, `arrow-left/right` |
| 👤 Assigned to me | `user-check` | ✓ selected | `check` |
| 🕘 Recent / activity | `history` | ↻ recurrence | `repeat` |
| ✅ Completed | `circle-check-big` | ↳ subtask | `corner-down-right` |
| 🔎 Search / filters | `search` / `filter` | ⏰ reminder | `alarm-clock` |
| 🗑 Trash | `trash-2` | 🔔 notifications | `bell` |
| 📰 Feed | `newspaper` | 💬 comments | `message-circle` |
| ⚙ Settings | `settings` | ☰ menu | `menu` |
| ▦ board / ≡ list | `kanban` / `list` | ↶ undo | `undo-2` |
| ↑ ↓ reorder | `arrow-up` / `arrow-down` | ⌄ dropdown | `chevron-down` |
| mic / lock / shared | `mic` / `lock` / `users` | ○ empty | `circle` |

Plus the icons screens will need: `plus`, `pencil`, `copy`, `pin`, `pin-off`, `tag`, `folder`, `flag`, `link`, `key-round`, `shield-check`, `log-out`, `download`, `upload`, `external-link`, `circle-help`, `sun`, `moon`, `grip-vertical`, `eye`, `eye-off`, `clock`, `globe`, `hash`, `at-sign`, `send`, `rotate-ccw`. The QR code SVG is generated content, not an icon, and stays.

### D3. Button API and legacy alias
`<Button variant="primary|secondary|ghost|danger" size="sm|md|lg" icon? iconEnd? busy? />` and `<IconButton icon label variant? size? />`. `label` is required by type, rendered as `aria-label` plus a tooltip via `title` (D2 accessibility). Styles come from token-based classes defined in `@layer components` (`.ui-btn`, `.ui-btn--primary`, …), so Tailwind utilities can still override them (AGENTS.md convention). The legacy `.btn-primary`, `.btn-ghost`, `.btn-danger` and `.input` are re-pointed by `design-language` to the same tokens. This change adds `.btn-secondary` (replacing the copy-pasted `btn-ghost border border-slate-300 …`), so unmigrated screens converge visually. `busy` sets `aria-busy`, disables re-entry (the `onClick` promise is tracked) and shows a spinner icon (`loader-circle`, rotated with CSS; static under `prefers-reduced-motion`).

### D4. Form controls are thin wrappers over native elements
Input, Textarea and Select style the native elements, and a `Field` wrapper wires `id`, `aria-describedby` (description and error) and `aria-invalid`. The native `<select>` stays for small fixed option sets (role, sort, group-by). Choosing an *entity* uses Combobox (D6). `Switch` is a `<button role="switch" aria-checked>`; `Checkbox` is a styled native input with an indeterminate state. TaskDetail's local `Field` is superseded but migrated by `task-detail-redesign`.

### D5. Menu semantics added to the existing overlay Menu
`Menu` gets a `kind="menu"` mode (the default for action menus): the Popover role becomes `menu`, the trigger gets `aria-haspopup="menu"`, and children are `MenuItem` (`role="menuitem"`, `icon`, `shortcut`, `description`, `danger`, `disabled`, `onSelect`), `MenuGroup` (`role="group"` plus an optional label) and `MenuSeparator`. A small `useRovingMenu` hook does focus-first-on-open, ↑/↓ with wrap, Home/End and type-ahead (500 ms buffer), and skips disabled items. The existing `kind="dialog"` behaviour stays for panels that contain forms, such as the current label editor with its swatches, until `labels-and-menus` redesigns them. Select closes via the existing `close()` and the stack returns focus to the trigger.
*Alternative*: a new Menu beside the old one. Rejected: two menu systems is the problem being solved.

### D6. Combobox: one engine, pluggable sources
`useCombobox<T>({ source, getKey, getLabel, getSecondary?, getGroup?, getPath?, multiple?, onPick, onCreate?, rankContext })` plus `<Combobox>` (inline anchored list, via a non-modal Popover from 640 px up) and `<ComboboxSheet>` (Popover sheet with the field on top below 640 px, chosen automatically through `useWide`).

- **Source**: `Array<T>` or `(query, signal) => Promise<{ items: T[]; hasMore?: boolean }>`. Async calls are debounced 120 ms, use `AbortController` per keystroke, and a monotonically increasing request id drops stale responses (spec: "Stale results ignored"). Local entity pickers pass arrays read with `useLiveQuery`; async exists for future task search over large Dexie tables and server-side sources.
- **Matching** (`ui/Combobox/match.ts`): normalise with NFD, strip diacritics, lowercase. The score tier is 3 = exact label, 2 = every query word is a prefix of some word (label or secondary), 1 = fuzzy subsequence on the label (gap-penalised, Sublime-style, capped at 64 chars), 0 = no match. Highlight ranges are returned for rendering `<mark>`. It is pure, so unit tests cover the spec scenarios directly.
- **Ordering**: query empty → `pickRank` order (D7) with groups preserved; query present → tier, then rank score, then natural order.
- **Hierarchy**: `getPath(item)` returns ancestor labels; options render indented when the query is empty (tree) and flattened with a muted path when filtering (spec: "Nested project match shows its path").
- **Create row**: shown last when `onCreate` is set, the query is non-empty and there is no exact match.
- **Folding once**: each option's folded label, folded secondary text and word starts are computed once per source (`prepare`), and the query once per keystroke. Measured in Chromium on the 10,000-option story: 35–43 ms per keystroke before, 2.4–7.0 ms after (budget 16 ms).
- **Windowing**: when there are more than 200 options, fixed-height rows (44 px touch, 36 px fine pointer) are rendered in a window with ±8 overscan, and `aria-setsize`/`aria-posinset` stay correct. This meets the 10,000-option requirement without a library.
- **ARIA**: input `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`; listbox `role="listbox"` (`aria-multiselectable` when multiple); options `role="option"` with `aria-selected`; a polite live region announces "N results" after 300 ms of idle typing.
- `AssigneePicker` and `LabelPicker` become thin adapters (source = members or labels, `onPick` = the existing `updateTask` op) with their current props, so TaskDetail, TaskListView, FilterView and SavedViewView call sites are unchanged.

### D7. Pick ranking stored device-locally
A new Dexie table, `pickHistory: '[context+key], context, lastAt'`, at the next free Dexie version (**v14** unless `date-time-preferences` lands first), with every store redeclared (house style). Rows are `{ context: 'label' | 'assignee:<projectId>' | 'project' | 'parent' | …, key, count, lastAt }`. Score = `count × 0.5^(ageDays / 14)`, ordered descending; at most 200 rows per context, pruned on write. It is *not* in `entityTables()`, so it is never in the outbox or synced (spec: "History is not shared"), and not in export. `clearLocalData()` adds `db.pickHistory.clear()`. Writes are fire-and-forget after `onPick` succeeds.
*Alternatives*: `prefs` (synced, which would leak cross-device and grow the op log); `localStorage` (synchronous and per-origin, with no transactional pruning). Dexie matches the existing device-local tables (`assistantThreads`, `notifications`).

### D8. Avatar colour determinism
`avatarHue(accountId)` = FNV-1a 32-bit hash mod 12 → a palette hue from `design-language` (soft background, solid text in light; inverted in dark, AA-checked by its contrast test). Initials reuse `initials()` from `AssigneePicker.tsx`, moved to `ui/Avatar.tsx`. The existing indigo `AssigneeChip` adopts Avatar.

### D9. Patterns
- `SettingsSection({ title, description?, helpId?, actions?, children })`: a `surface` card with radius 14, elevation 1, a 24 px padding desktop and 16 px phone, and a heading level prop (h2 default) so `settings-navigation`'s single-h1 rule holds. It reuses `HelpHeading`'s link logic.
- `SettingRow({ label, description?, control, status? })`: a CSS grid of `minmax(0,1fr) auto` at sm and up, stacked below.
- `Timeline`: an `<ol>` with items of kind `event` (icon, actor, text, time) or `thread` (Avatar, header, body, actions, nested replies); it is presentational only, and `task-detail-redesign` supplies the data.
- `EmptyState({ icon, title, body?, action? })`.
- `Tabs` uses the WAI-ARIA tabs pattern with automatic activation.
- `ConfirmDialog({ title, consequence, confirmLabel, tone, onConfirm })` on `app/overlay/Dialog`: initial focus on Cancel, Escape cancels, focus returns to the trigger, and `tone="danger"` disables dismissal by outside tap. It is the single replacement for `window.confirm` used by `settings-redesign`, `labels-and-menus` and `task-detail-redesign`.
- `ListRow({ leading?, label, meta?, badges?, menu?, onKeyDown? })`: a focusable row (`tabIndex=0`) that forwards existing key handlers (for example `UsersView.onRowKey`), with a trailing `Menu` of `MenuItem`s. Settings lists, the labels overview and member lists use it.

### D10. Enforcement in CI
`scripts/ui-check.mjs`, added to `make check` and run from `npm run ui:check`:
1. Every `web/src/ui/**/*.tsx` that exports a component, except stories, tests and index files, has a sibling `*.stories.tsx`.
2. No file under `web/src/app` contains characters from the emoji ranges, or from the glyph allow-list above, inside JSX text or `trigger=`/`icon=` props. Copy punctuation (`→`, `…`, `×` in "2 × 3") is excluded by a small allow-list of contexts.

The axe and visual gates come from `design-language` and automatically include the new stories.

### D11. Bundle and size accounting
**Measured (baseline, before this change, `npm run build` on main at 5e41856):** entry `index.js` 940.92 kB (275.02 kB gzipped), CSS 104.39 kB (16.00 kB gzipped); lazy chunks unchanged by this change (NotesEditor 68.86 kB, HelpBundle 131.73 kB, richtext 28.26 kB gzipped and smaller ones).

**Measured (after):** entry `index.js` 963.44 kB (283.39 kB gzipped, **+8.37 kB gzipped**), CSS 111.90 kB (16.88 kB gzipped, +0.88 kB). Net +9.25 kB gzipped against the ≤ +20 kB budget: about 50 vendored icons, the primitives and the Combobox, partly offset by the two hand-built pickers they replace. Lazy chunks are unchanged. The Go binary grows by the same embedded bytes.

Before/after is measured with `npm run build` (the gzipped JS of the entry and lazy chunks), and the delta is written into this design's "Measured" note during apply. The budget is ≤ +20 KB gzipped net. Expected: icons ≈ 7 KB, primitives ≈ 8–10 KB, minus about 3 KB from deleted picker/menu duplication. The Go binary grows only by the same embedded bytes; runtime memory is unchanged, and windowing caps DOM size for large pickers.

## Data model impact

No synced entity, op field or server schema changes. Op schema, `internal/e2ee.ContentFields` and `CONTENT_FIELDS` are untouched (no user-written fields). The only addition is the device-local Dexie table `pickHistory` (next free Dexie version). It holds entity ids and counts, no content, and is cleared on sign-out. If another in-flight change (for example `date-time-preferences`) also bumps Dexie, whichever lands second takes the next version number and redeclares all stores.

## Risks / Trade-offs

- [Icon swap touches about 35 files at once and conflicts with the redesign changes] → Land `ui-primitives` before the screen changes start. The swap is mechanical, one commit per area, and covered by `ui:check`.
- [Menu role change alters screen-reader output for existing menus that contain form controls] → Keep `kind="dialog"` for those (label editor, project "Move to" with its select) until their redesign; only pure action menus switch.
- [Fuzzy matching surfaces surprising matches] → Fuzzy is tier 1, always below prefix matches, and requires at least 2 query characters.
- [Vendored icons drift from upstream] → Pinned version recorded in the file header; the sync script is idempotent; ISC needs only the notice.
- [Windowing breaks `scrollIntoView` and screen-reader browsing] → Keep the active option rendered; set `aria-setsize`/`posinset`; only engage above 200 options (labels and members never reach that).
- [Ranking feels "jumpy" as order changes] → Ranking is computed when the picker opens and frozen while it is open.

## Migration Plan

1. Primitives, icons and stories land behind no flag; nothing is visible yet except the legacy-class alignment that `design-language` already did.
2. Pickers are rebuilt on Combobox with the same props: a drop-in at all call sites.
3. The icon swap goes area by area (sidebar and shell, then task rows and detail, then fields, then the remaining views), each verified with the layout check and the visual gate.
4. Rollback: each step is an independent commit. Reverting the picker adapters restores the old pickers; the `pickHistory` table is harmless if unused (Dexie keeps it on downgrade-free paths, since versions only go up).

## Open Questions

- Whether the "Today" icon should show the current day number (a custom overlay on `calendar`) can be decided during the sidebar swap without affecting specs or tasks.
