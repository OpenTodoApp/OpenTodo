# Design

## Context

The brand appears in `web/index.html` (title, favicon, touch icon), the manifest `vite-plugin-pwa` writes (name, icons), `BrandMark`/`BrandWordmark` (`web/src/ui/icons/Brand.tsx`, rendered from `brand.svg`) on the sign-in and invitation cards, the sidebar rail and the workspace control, the share-capture heading and the tab title (`pageFocus.tsx`). The web app is embedded in the binary and served by `internal/web`; `internal/httpapi` mounts it at `/`. Owner settings live in the `settings` table; the profile picture code already stores a rendered JPEG under the data directory and serves it at a versioned address.

## Decisions

**D1. Rewrite on the way out, not at build time.** `httpapi.brandedWeb` wraps the embedded web handler: for a navigation (`/`, `/index.html`, an extension-less path) and for `/manifest.webmanifest`, and only on a branded instance, the response is captured and `web.Brand` / `web.BrandManifest` replace the title, the description, the icon links and the manifest's name and icons. Assets pass through untouched; an unbranded instance never buffers. Alternative: a second build per instance. Rejected: one binary, one container is the product. Alternative: let the client set `document.title` and the favicon at runtime. Rejected: the installed app's name and icons come from the manifest at install time, and the tab's icon before the app loads comes from the page.

**D2. One upload, every size rendered by the server.** The owner uploads one image; the server crops the centre square and renders 32 (favicon), 180 (Apple touch icon), 192 and 512 (manifest, sidebar) px PNGs plus a maskable 512 px icon (the logo at 80 percent on the logo's own edge colour, or the app's dark canvas when the edge is transparent), with `imgfit`. Alternative: ask for several files. Rejected: a form with five uploads for one logo. Alternative: SVG. Rejected: an SVG can carry scripts and external references, and the manifest and touch icons need PNGs anyway.

**D3. Versioned, public addresses.** `/branding/logo-<size>.png?v=<version>` is cached for a year; the version is a counter that only grows (a removed logo keeps its last version negated, as profile pictures do), so no cached address is ever reused for another image. The files are public like the app's own icons: the page every visitor gets links to them.

**D4. The client reads `auth/status`.** The app already reads `auth/status` on every profile read; `branding` rides along and a small store (`lib/branding.ts`) mirrors it on the device, so the first paint and offline use show the instance's name and mark. `InstanceMark` and `InstanceWordmark` fall back to `BrandMark` and `BrandWordmark`, so an unbranded instance renders exactly as before and the sidebar tests keep passing.

**D5. Powered by OpenTodo.** On a branded instance the sign-in card's licence line gains "Powered by"; the AGPL and no-telemetry statement stays, Settings → About is unchanged. The project asks nothing more of a branded instance.

**D6. Demo and hosted.** The settings routes are refused on the demo like every server setting (the deny list's `/api/v1/settings` prefix). A hosted tenant may brand itself: the data is the owner's, and the rewrite happens in the tenant's own router.

## Data model

One settings key `branding` `{name, logo_version}`; files under `<data>/branding/`. No op, no sync field, no migration. Backups: the files are under the data directory like attachments and avatars.

## Interface budget

The Branding card is one more card on the Server page (owner only); no new chrome above a list, no new sidebar destination, no new shortcut. Screens that showed the brand show the instance's mark and name in the same slots at the same sizes.
