# Proposal

## Why

The sidebar is the one surface every person sees all day, and it has no character: the mark is a tick in a dark square that could belong to any app, every row has the same weight, each group header crams three micro controls beside its title, the More row carries an unexplained accent dot, and a running time entry adds a second line to the footer. The October 2026 interface review (move 5 of the design analysis) names it the most generic screen in the app. Linear's 2025 refresh showed the direction that fits OpenTodo's own "calm" principle: a sidebar a few notches quieter than the content, controls that appear when wanted, structure felt rather than drawn.

## What Changes

- **A brand mark and wordmark.** One mark for OpenTodo, drawn to a brief in design.md (emerald, an open loop that closes into a tick, not a generic checkbox), with acceptance criteria that are tested: legible at 16 px, works in light and dark, a mono variant that follows the text colour, a colour variant for icons. It replaces the tick-in-a-square everywhere: the sidebar header, sign-in and the other account screens, the PWA and Apple touch icons, the browser extension icons, the display routes, and the site bundle, which gains a `brand/` folder so the website and the docs use the same files.
- **A sidebar header row that can be replaced.** The mark and the wordmark sit in one header slot beside the search button. The slot is a seam: the `workspaces` change puts its workspace control there later, keeping the search button, without touching the rest of the sidebar.
- **Tones.** Inactive rows and their icons take the quiet text tone (the step below `muted` in the tone scale of `tokens-v2`; the current `faint` token until that change lands), hover raises them to the default tone, and the active row is an accent-soft pill with strong text and an accent icon. Counts stay where they are today: Inbox and Today at rest, projects on hover, the closed group headers.
- **Group headers.** A smaller uppercase label at the quiet tone. The group's controls (All, find, add, the project menu) are present in the document at all times but visible only while the pointer or keyboard focus is inside the group on a fine pointer, and always visible on a coarse pointer. The item count is part of the header's accessible name whether the group is open or closed.
- **Project rows** keep their icon or colour dot in the leading slot, the hover count and the sub-project guide line; nothing else changes about them.
- **The footer stays one row.** While a time entry runs, a compact pill with the elapsed time, the task's title and its own Stop control takes the place of the account name beside the avatar, so the footer never grows a second row; on the icon rail the pill is the elapsed time alone. The account control, assistant, bell, sync dot and collapse control are unchanged.
- **More is a labelled group, not a destination.** On a desktop the More row reads as a group label with a chevron and opens its menu as before; on a phone it is the inline collapsible group as before. It carries no state marker. The review-due dot moves to the Review entry, wherever that entry is (a primary destination in Open Loops first, an item inside More otherwise). The More header never carries a marker.
- **A trace of the accent.** From 768 px with a fine pointer the sidebar's background is a new surface token, the canvas mixed with a trace of the accent (3 % in light, 4 % in dark), and the sticky group headers use the same token so they never show a seam. The sidebar is never translucent over content. The phone drawer and the sheets keep their surface colour.
- **The icon rail and the phone drawer** use the same tones; the drawer's content is the subject of `phone-v2`, not of this change.

Out of scope: the drawer's structure and the phone tab bar (`phone-v2`), the tone scale itself and the colour ramps (`tokens-v2`), the workspace switcher (`workspaces`), any change to which destinations are primary or to the six-destination budget, a settings choice for the tint, and animated marks.

This change is a step of ROADMAP.md "Next: Design refresh" and follows `quiet-sidebar`, `sidebar-favourites`, `ux-feedback-2` and `time-tracking`, whose archived text it builds on.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: ADDED requirements for the sidebar header row and its seam, the sidebar tones, the group header controls, the running entry pill in the footer, More as a labelled group and the sidebar surface tint; MODIFIED "Quiet markers in the sidebar" (added by `quiet-sidebar`) so the review-due marker sits on the Review entry and never on More.
- `design-system`: ADDED "Brand mark", the acceptance criteria of the mark and the wordmark, and the one source every asset is generated from.
- `web-app`: ADDED "App icons", the installed app's icons are the brand mark, generated from the same source, in the same files as today.
- `site-bundle`: ADDED "Brand assets in the bundle", a `brand/` folder with the mark and the wordmark for the website and the docs.
- `share-capture`: ADDED "Extension icon", the extension's toolbar and store icons are the brand mark.

## Impact

- Web: `web/src/ui/icons` (the `BrandMark` and `BrandWordmark` components), `web/src/ui/patterns/Sidebar.tsx` (tones, header controls), `web/src/app/Sidebar.tsx` and `SidebarFooter.tsx` (header slot, More, the pill), `web/src/app/TrackingIndicator.tsx`, `web/src/index.css` (the `--ot-sidebar` surface token and its dark values, `pairs.ts` contrast pairs), `web/public` (favicon, PWA and touch icons regenerated), stories and baselines, `sidebar.test.tsx`, `sidebarFooter.test.tsx`, `budget.test.tsx`.
- Extension: `extension/icons/*.png` regenerated from the same source, version bumped.
- Site bundle: `scripts/site-bundle.mjs` adds `brand/`; `docs/design-system.md` gains a Brand section; `docs/interface-guide.md` updates the sidebar column.
- Server: `internal/web/dist` carries the new assets; the binary grows by the icon PNGs' difference only (expected under 10 KB). No API, op, migration or environment change. No new dependency: PNGs are rendered from the SVG in the bundled Chromium by a script, as the docs screenshots already are.
