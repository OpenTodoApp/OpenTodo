# Proposal

## Why

The web app has almost no shared building blocks. About 30 emoji and Unicode glyphs act as icons (📥 📅 🗓️ in the sidebar; ⋯ ▸ ✕ › elsewhere), and every menu item is a hand-styled full-width ghost button. Native `<select>` elements pick projects, sections and parent tasks, while `AssigneePicker` and `LabelPicker` are near-duplicate custom listboxes. Settings panels hand-roll their markup. The result looks inconsistent and dated, and each screen redesign would otherwise reinvent the same pieces. `design-language` defines the tokens and the Storybook workbench. This change builds the primitives on top of them, so `settings-redesign`, `task-detail-redesign` and `labels-and-menus` can be assembled from parts that are tested, accessible and documented.

## What Changes

- **Icon set**: a curated set of about 50 line icons, vendored from Lucide (ISC) into the repository with its license notice and no npm dependency. Every emoji or glyph used as an icon in the app is replaced by a named icon: sidebar views, ⋯ menus, ✕ clear buttons, ▸/▾ disclosure, ›/‹/←/→ navigation, ✓, ↻ recurrence, ⏰ reminders, 🔔, 💬, ☰ and the others. Decorative icons are hidden from assistive technology; icon-only controls carry an accessible name.
- **Button**: variants primary, secondary, ghost and danger, plus an icon-only form; sizes sm, md and lg; a loading state. The legacy `.btn-*` classes keep working as aliases until the screens migrate.
- **Form controls**: Input, Textarea and Select styling with label, description and error states; Checkbox; Switch (a true `role="switch"`).
- **Surfaces and data display**: Card, Badge/Chip (solid and soft, from the 12-hue palette), Avatar (initials with a deterministic palette colour), Tabs (roving tab index), Timeline (events and threads), EmptyState.
- **Settings patterns**: SettingsSection (a card with a title, a description and an optional help link) and SettingRow (label and description on one side, control on the other; stacks on phones).
- **Menus**: MenuItem, MenuGroup and MenuSeparator built on the existing `app/overlay` Menu. Items get an icon, a label, a shortcut hint, danger and disabled states, and arrow-key, Home/End and type-ahead navigation, with the correct `menu`/`menuitem` roles.
- **Combobox (smart picker)**: one accessible picker for choosing an item from a list. When opened it shows the most probable items first: recent picks on this device, then frequency, then alphabetical. Typing filters with word-prefix and fuzzy matching. It supports grouped and hierarchical results, an optional "Create …" row, and synchronous or asynchronous (paged) sources. It renders inline (anchored) or as a sheet on phones through the overlay Popover. `AssigneePicker` and `LabelPicker` are rebuilt on it with unchanged behaviour. The picks feed per-device ranking that never syncs.
- **Quality bar for every primitive**: Storybook stories covering states, light/dark and 375/1280 widths; unit tests; zero axe violations; a visual-regression baseline (gates defined in `design-language`).

Out of scope:
- Redesigning screens. Settings, task detail, labels and menus are covered by `settings-redesign`, `task-detail-redesign` and `labels-and-menus`; this change only swaps icons in place and rebuilds the two existing pickers.
- Replacing the native project/section/parent selects with the Combobox (`task-detail-redesign`).
- A date picker (`date-time-preferences` owns date entry).
- User-selectable accent themes.
- Server or API changes.

ROADMAP: the original roadmap is complete and no listed item covers UI quality. This change is the second step of the design-system track started by `design-language` (proposed new ROADMAP entry: "Design system and UI refresh"). Nothing here is **BREAKING**: no environment variables, no op-log or schema changes.

## Capabilities

### New Capabilities
- `design-system`: the shared visual and interaction building blocks of the web client: icons, controls, menus, the smart picker, surfaces and settings patterns, and the accessibility and quality bar each must meet. The capability is introduced by `design-language` (tokens, workbench, gates); this change adds the primitive requirements to it.

### Modified Capabilities
- `labels`: the label picker gains most-probable ordering (recently used on this device first) and fuzzy matching; assignment behaviour and the `L` shortcut are unchanged.
- `task-assignment`: the assignee picker gains most-probable ordering and fuzzy matching; options and permissions are unchanged.

## Impact

- **Code**: new `web/src/ui/` (primitives, `icons/`, `patterns/`, `*.stories.tsx`, `*.test.tsx`); `web/src/lib/pickRank.ts` (per-device recency and frequency in Dexie). `app/overlay/Menu.tsx` gains menu semantics. `AssigneePicker.tsx` and `LabelPicker.tsx` are rebuilt on Combobox. About 35 app files swap glyphs for `<Icon>` (Sidebar, TaskRow, TaskDetail, HistoryPanel, Sections, field components, Shell, NotificationBell, CalendarView, ViewsView and others).
- **Data**: a new device-local Dexie table for pick history (not synced, not exported, cleared on sign-out). No op, server or API change.
- **Dependencies**: none. Icons are vendored SVG path data, with no runtime library.
- **Bundle**: estimated +12–18 KB gzipped for primitives and icons, partly offset by deleting duplicated picker and menu code. Measured and reported in design.md tasks. No effect on the Go binary beyond the embedded assets, and none on runtime memory.
- **Tests/CI**: new unit tests under vitest, Storybook stories run through the a11y and visual gates from `design-language`, and the existing layout check (`web-app` "Automated layout check") must keep passing.
