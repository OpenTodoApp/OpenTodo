# Proposal: brand-mark-tray

## Why

The open-loop mark (archived `sidebar-v2`) is a ring with a tick, and at icon sizes it reads like many other "done" glyphs. The owner explored new directions and chose a tray mark: an open tray with inward-turned lips that a tick drops into, the place where a task lands and gets done. It stays legible at 16 px in colour and in mono, and it echoes the Inbox. Changing the mark now, before 1.0, is cheaper than after the stores, the deploy catalogues and the website have carried the old one for longer.

## What Changes

- The brand mark becomes the tray mark in both variants. **mono:** the tray in the text colour and the tick in the accent. **colour:** a white tray and an emerald tick on the slate rounded square. It is drawn on the same 24-unit grid with the same 2-unit stroke (2.6 in the colour icon), round caps and joins, and a clear gap between lips and tick at every size.
- Every generated brand file is regenerated from the one source: the favicon, the PWA and Apple icons, the extension icons, the deploy-template logos and their upstream copies, and the site bundle's `brand/` folder.
- The iOS app icon (`AppIcon.png`, 1024 px, opaque) becomes a generated output of the brand script instead of a hand-made file.
- The Android launcher icon (still an old blue square with a plain tick) and the Android notification icon become generated outputs of the brand script too: vector drawables written from the same path data (the colour mark for the launcher, an all-white silhouette of the mono mark for the notification).
- The extension's version is raised, as its spec requires when its icons change.
- The illustrations keep the open loop as their own motif. Their requirement stops calling it "the brand mark's open loop"; no drawing changes.
- Docs follow: the Brand section of `docs/design-system.md`, and the Storybook Brand story's comment.

Not a **BREAKING** change: no op-log, API or environment change, and icon paths stay the same.

## Out of scope

- Redrawing the six empty-state illustrations around the tray (the owner chose to keep them; a later change can revisit).
- A new wordmark or a palette change. "OpenTodo" stays in Inter 600, and emerald and slate stay.
- Submitting the new logo upstream to Coolify, Dokploy, Easypanel, CasaOS, CapRover and Cosmos. The vendored upstream copies are regenerated here; the pull requests to those projects are done by hand after release.
- The website (`OpenTodoWebsite`): it picks up `brand/` from the next pinned bundle. Its own `public/assets/` copies and the default `og.png` are a follow-up in that repository.
- The GitHub social preview, the organisation avatar and the store listings.
- Owner branding (`instance-branding`) is unchanged: a branded instance still shows its own logo.

ROADMAP: this refines the brand delivered by `sidebar-v2`; it adds no new ROADMAP item. The archive adds a CHANGELOG entry.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: "Brand mark" describes the tray mark (shape, variants, the accent on the tick, the gap at 16 px, the "not a checkbox" check), and adds the native shells' icons to the files generated from the one source. "Illustrations" keeps the open loop as the illustrations' own motif rather than the brand mark's.
- `app-shell`: "Sidebar header row": the header scenario's "accent on its loop" becomes the accent on its tick.

## Impact

- **Files:** `web/src/ui/icons/brand.svg` and `brand-icons.json`; `scripts/brand-icons.mjs` and its test (new iOS output as an opaque PNG, new Android vector outputs); every output in the stamp; `mobile/ios/OpenTodo/Assets.xcassets/AppIcon.appiconset/AppIcon.png`; `mobile/android/app/src/main/res/drawable/ic_launcher.xml` and `ic_notification.xml` (now generated); `extension/manifest.src.json` (version); `web/src/ui/icons/Brand.test.tsx`, `Brand.stories.tsx`; `docs/design-system.md`; `scripts/site-bundle.mjs` (the bundle README's description of the mono mark). The site bundle's `brand/` requirement itself is unchanged.
- **Baselines:** every Storybook screenshot that shows the mark changes: the Brand story, the sidebar header, sign-in and setup cards, and the assistant welcome. CI's UI check reports them, and each one is inspected before it is accepted.
- **Size:** none. `brand.svg` stays under 2 KB (about 950 bytes today, about the same after), and the PNGs keep their pixel sizes. No dependency is added.
- **Users:** installed apps, extensions and bookmarks show the new icon on the browser's next icon refresh. The paths don't change.
