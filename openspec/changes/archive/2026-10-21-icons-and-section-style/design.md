## Context

- Icons are Lucide paths vendored as static strings: `scripts/icons-sync.mjs` reads an unpacked `lucide-static` 1.48.0 package and the list in `web/src/ui/icons/names.json` (106 names) and writes `web/src/ui/icons/lucide.ts` (about 18 KB, roughly 174 bytes of path data per icon). The build never downloads anything; the ISC licence is in `LICENSE-lucide.txt`. `<Icon>` takes a typed `IconName`, and `isIconName` already guards stored project icons from newer clients.
- Project icons are an additive nullable `icon` field (`internal/sync/ops.go`, "not user text, so not an encrypted content field"), offered as a grid of 24 names (`PROJECT_ICONS` in `ProjectHeader.tsx`). The server accepts any string there.
- Sections are `{name, project_id, position, created_at, deleted_at}`. Project and label colours are hex strings from an 8-hue palette, rendered through the nearest palette hue (`design-system` "Stored colours render through the palette").
- `mcp-projects` (a separate change) will let MCP tools set project and section icons and must reject names that are not in the catalogue, and offer a way to list and search it. It relies on the contract in D2.

## Goals / Non-Goals

**Goals:**
- Hundreds of choosable icons with search, without growing the main bundle.
- One catalogue definition the web app, the Sections API and the MCP tools all trust.
- Section colour and icon that add identity without adding chrome.

**Non-Goals:**
- Translating every icon's keywords into five languages (category names only; see Open Questions).
- Colour or icon for labels, saved views or the "No section" group.
- Server-side validation of icons arriving through sync ops (see D4).

## Decisions

### D1. Catalogue: curated Lucide subset with Lucide's own keywords

The catalogue is a JSON file, `web/src/ui/icons/catalogue.json`: an array of `{name, category, keywords}`, roughly 400 to 500 entries picked from Lucide, grouped into about 15 categories (work, home, people, travel, food, health, money, learning, nature, animals, tools, tech, time, communication, shapes and symbols). Keywords start from the tags that `lucide-static` publishes with each icon (English) and are curated by hand where they are thin. Category ids are stable; their display names are interface strings in the locale catalogues.

- Alternative: the whole Lucide set (about 1,600 icons). Rejected: many are near duplicates or interface glyphs (arrows, cursors, text-formatting) that are noise for a project icon, and the chunk would be three times larger.
- Alternative: another icon library for the catalogue. Rejected: `design-system` "One icon set" requires one grid and stroke everywhere.

### D2. One definition, generated outputs, and the contract for other changes

`scripts/icons-sync.mjs` stays the only writer. From the unpacked `lucide-static` package, `names.json` (interface icons) and `catalogue.json` (catalogue entries), it writes:

1. `web/src/ui/icons/lucide.ts`: the interface icons, in the main bundle, unchanged in role.
2. `web/src/ui/icons/catalogue.paths.ts`: path data for catalogue icons that are not interface icons, imported only through a dynamic `import()` (its own chunk).
3. `internal/iconset/names.json`: the sorted list of every catalogue name, embedded into a small Go package `internal/iconset` with `Valid(name string) bool` and `Entries()` (name, category, keywords) for listing and searching.

The contract other changes rely on:
- **Names** are the catalogue's `name` values: lowercase `a-z`, `0-9` and `-`, at most 64 characters, never removed once released.
- **Server check:** `iconset.Valid(name)` is the single check for REST and MCP writes. A Go test reads `web/src/ui/icons/catalogue.json` (the same `../../web/...` pattern as the quick-add vectors) and fails when its names differ from the embedded list.
- **Web check:** `isCatalogueIcon(name)` (sync, from the names list that ships with the main bundle as a compact array, about 6 KB) and `loadCatalogue()` (async, entries plus path data).
- **Search:** case-insensitive substring match on name, keywords and the translated category name. Results are ordered: exact name, then name prefix, then keyword, then category. The MCP list and search tool in `mcp-projects` uses the same order through `Entries()`.

### D3. Rendering a stored icon

`<Icon>` keeps rendering interface icons synchronously. A new `<CatalogueIcon name fallback>` renders an interface icon at once, otherwise triggers `loadCatalogue()` and shows `fallback` until the chunk resolves (the project's dot, or nothing for a section), then the icon. Unknown names keep the fallback forever. The service worker caches the chunk like any other build asset, so it works offline after the first load.

- Alternative: inline all catalogue paths in the main bundle. Rejected: about 25 to 30 KB gzipped on every first load for a picture most screens do not show.

### D4. Validation: strict at the API, lenient in sync

REST (`/api/v1/sections`, the existing project routes) and MCP validate `icon` with `iconset.Valid` and `color` as `#rrggbb`, returning `invalid_input`. Sync ops are not checked against the catalogue: an op from a newer client may carry a name this server does not know yet, and rejecting it would break convergence between devices on different versions. Sync keeps checking only the kind (nullable string, at most 64 characters, the name character set), as for any field.

### D5. Section fields and look

`section` gains `color` (`kNullableString`, a palette hex) and `icon` (`kNullableString`, a catalogue name), both null by default in `ops.ts` and `types.ts`. Neither is user-written text, so neither joins `internal/e2ee.ContentFields` or `CONTENT_FIELDS`: an end-to-end encrypted account can style sections, and the MCP can change them without the key.

In a list heading and a board column header, the icon (size `sm`) or the colour dot (the same 10 px dot projects use) sits immediately before the title, inside the existing heading row. The colour tints the icon, never the title text or the column background, so contrast rules for text are unaffected and the board stays calm.

- Alternative: tint the whole column header or a coloured left border. Rejected for now: louder than the rest of the "calm rows" direction; can be revisited with real use.

### D6. Interface budget

No new row of chrome (the icon or dot lives in the existing heading row); task properties are unchanged; no new sidebar destination; no new scroll region beyond the picker's own list inside its popover, which replaces the grid's. No new keyboard shortcut: the picker is reached from the section and project menus, which are already keyboard reachable.

## Risks / Trade-offs

- [Lucide renames or redraws an icon in a later release] → `icons-sync.mjs` pins the `lucide-static` version; an upgrade that changes a catalogue name's picture adds a new name instead and keeps the old one (D2 rule), and a test checks that no released name disappears.
- [Catalogue chunk fails to load (offline before first load)] → the fallback is shown; the picker shows "Icons are not available offline yet" with the interface icons only.
- [Search feels poor in non-English languages] → category names are translated; keyword translation is an open question with a cheap later fix (extra keywords per locale in the same file).
- [Unknown names accumulate from newer clients] → they render as fallback and are preserved; nothing is lost when the older device updates.

## Migration Plan

Additive only. Existing project icons are all in the catalogue (the 24 current names are included by construction; a test asserts it). Old clients ignore the section fields. Rollback: revert the web and server code; stored section `color` and `icon` values stay in the log and are ignored.

Size and memory: main bundle unchanged except the compact name list (about 6 KB raw, about 2 KB gzipped); the catalogue chunk is about 90 KB raw, 25 to 30 KB gzipped, loaded on demand. Server binary grows by the embedded name list (a few KB); no runtime memory change worth measuring. No new dependency, no change to the container image beyond the binary.

## Open Questions

- Translated keywords per icon for the five other interface languages, beyond translated category names. Can be added later to `catalogue.json` without changing the specs.
- The exact final list and category of each icon, settled while curating with screenshots in the Storybook workbench.
