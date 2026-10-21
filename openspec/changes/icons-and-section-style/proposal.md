## Why

A project can carry one of only 24 icons, offered as a fixed grid with no search, and people who organise many projects run out of meaningful choices. Sections have no visual identity at all: on a long list or a wide board, "Waiting" and "Doing" look the same until you read them. Both came up in user feedback on 2026-10-21, together with the wish that an AI assistant (MCP) can set the same icons and colours, which needs one well-defined catalogue of icon names that the server can check.

## What Changes

- **One icon catalogue.** A curated catalogue of several hundred Lucide icons, each with a stable name, a category and search keywords, defined once in the repository (`web/src/ui/icons/catalogue.json`) and generated together with a server copy so the Go side can validate names. The 106 interface icons stay in the main bundle; the rest of the catalogue is a separate chunk loaded only when a picker opens or a stored icon is not in the core set.
- **A searchable icon picker** replaces the 24-icon grid: a Combobox with a search field (name, keywords, category, in the interface language for category names), icons grouped by category, keyboard reachable, with "No icon" first.
- **Projects use the catalogue.** Any catalogue icon can be a project icon. An icon name the device does not know (written by a newer client) renders the colour dot, never an error.
- **Sections get an optional colour and an optional icon**, shown before the section title in list headings and board column headers. A new section has neither (the neutral heading as today). Both are edited from the section menu, with the same colour palette as projects and the same icon picker.
- Sections sync the two values as additive fields (`color`, `icon`), applied locally first and converging per field. The Sections API accepts and validates them.
- Out of scope: icons or colours for labels and saved views (labels keep their colour; views keep theirs); uploading custom icons or images; emoji as icons (still forbidden by `design-system` "One icon set"); the MCP tools that set icons and colours (change `mcp-projects`, which relies on this catalogue); templates carrying section style (change `template-library`).
- ROADMAP: no listed item; this extends the shipped `ui-primitives` step of the design refresh ("Shared building blocks: icons…") and follows the user feedback of 2026-10-21.
- No new mandatory environment variable. The op log format gains two additive fields; nothing is renamed or removed.

## Capabilities

### New Capabilities

### Modified Capabilities
- `design-system`: a new requirement for the icon catalogue (one definition, stable names, categories and keywords, lazy loading, fallback for unknown names, a server copy kept identical by a test), next to "One icon set".
- `project-organization`: "Project icon" now picks from the whole catalogue through a searchable picker.
- `sections-and-boards`: "Section entity" gains the optional `color` and `icon` fields; a new requirement for showing and editing a section's colour and icon in the list and the board; "Sections API" accepts and validates `color` and `icon`.

## Impact

- Web: `web/src/ui/icons/` (catalogue, generated chunk, `isIconName` and a catalogue loader), a shared icon picker in `web/src/ui` with stories, `ProjectHeader.tsx` (the picker replaces `PROJECT_ICONS`), section heading and board column header components, the section menu, `web/src/lib/types.ts` and `ops.ts` (section `color`, `icon`, default null).
- Server: `internal/sync/ops.go` Schema (section `color`, `icon`), a small `internal/iconset` package with the generated name list and `Valid(name)` for the Sections API and later the MCP tools, the Sections API handlers.
- Tooling: `scripts/icons-sync.mjs` generates the catalogue chunk, the server name list and keeps the core set; Lucide's ISC licence already ships in `web/src/ui/icons/LICENSE-lucide.txt`.
- Size: the main bundle is unchanged; the catalogue chunk is about 90 KB raw, 25 to 30 KB gzipped, fetched on demand and cached by the service worker. The server binary grows by the name list, a few KB. No new dependency.
- Docs: `docs/projects.md` and `docs/sections-and-boards.md`, `docs/api.md` (section fields).
