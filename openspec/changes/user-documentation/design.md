# Design

## Context

Docs today: `docs/*.md` (21 pages, ~55k words, mostly reference), read on GitHub. The website (`website/`) is plain HTML/CSS/JS served by nginx with no build step; Coolify builds it from the `website/` directory. The app has a small Markdown renderer for comments (`web/src/lib/markdown.ts`) without tables or headings, and a hard-coded shortcut table in `web/src/app/ShortcutHelp.tsx`.

## Decisions

### D1. `docs/` is the single source, with front matter
Every page starts with:

```yaml
---
title: Sharing projects
summary: Invite people, pick roles, assign tasks and talk in comments.
audience: user            # user | admin | developer
specs: [project-sharing, task-assignment, comments]
screens: [share-dialog, settings/members]   # in-app help anchors
order: 40
---
```

`audience` decides the website section and whether the page ships in the app (only `user` pages do; `admin` and `developer` pages are linked to the website). `specs` feeds the coverage check (D6). `screens` maps app locations to sections for contextual help (D5). Pages without front matter fail the check.

### D2. Build-time rendering, pre-rendered HTML
A Node script (`web/scripts/docs/build.mjs`) parses the Markdown with `marked` (build-time devDependency, ~40 KB, zero runtime cost), adds heading ids, rewrites links between pages, adds `loading="lazy"` and real dimensions to images, and emits:
- `website/docs/<slug>/index.html` with the site's header, a sidebar, an "on this page" list and a footer;
- `website/docs/search.json` (title, headings, text per section);
- `web/src/generated/help.json` (user pages only: HTML per section plus the same index).

Content comes from the repository at build time, so it is trusted; the HTML is still produced only from the Markdown, with raw HTML in Markdown limited to `<img>`, `<picture>`, `<source>`, `<kbd>` and `<details>`.

Alternatives: extending the comment renderer (would grow the runtime bundle and mixes trusted and untrusted rendering), a static site generator (a second toolchain and theme to maintain), rendering on the server (a route and Go dependency for static content).

### D3. Generated website files are committed
Coolify builds the website from `website/` only, so `docs/` is outside its build context. `make docs` regenerates `website/docs/`, and CI runs it and fails on `git diff --exit-code`. This keeps the website Dockerfile and Coolify settings unchanged. The cost is generated files in diffs; they live in one directory and are marked `linguist-generated` in `.gitattributes`.

### D4. Search without a service
A ~2 KB in-house scorer over the prebuilt index: lowercase, strip accents, match words and prefixes, weight title > heading > text, return sections with a snippet. Website: loaded on first focus of the search box; pages stay fully readable without JavaScript. App: the same code over `help.json`. No query text leaves the browser; the website's analytics may count that search was used, never what was typed.

### D5. In-app Help view and contextual links
`help.json` is a separate chunk, imported only when Help opens, and precached by the service worker so it works offline. The view lists guides by topic, shows one guide at a time with an "on this page" list, keeps internal links inside the app and opens `admin`/`developer` links on the website in a new tab.

Entry points: Help in the sidebar footer and in Settings, a link at the bottom of the `?` overlay, `g` then `?` from anywhere, `:help <topic>` with the Vim layer, and a small "Help" link in each settings panel, the share dialog, the filter view, quick add and the import screen, opening a side panel (sheet on phones, via the `mobile-layout` overlay module) at the section named in `screens`. Opening help never discards unsaved input.

### D6. Checks in CI (`npm run docs:check`, part of `make check`)
- every page has valid front matter;
- every relative link and `#anchor` resolves; external links are not fetched (no network in CI);
- every image has non-empty alt text and exists;
- every directory in `openspec/specs/` is listed in some page's `specs`;
- every `screens` id used in the app exists in some page, and vice versa;
- the keyboard guide matches the shortcut data module;
- generated files are up to date.

### D7. Accessibility
Both renderings target WCAG 2.2 AA: landmarks (`header`, `nav`, `main`, `aside`), one `h1` per page and no skipped levels, skip link, visible focus, 4.5:1 contrast in both themes, link text that names the destination, tables with header cells, code blocks that scroll inside themselves, `prefers-reduced-motion`, 200% zoom without horizontal scroll, and search results announced through a live region. CI runs axe-core (dev dependency, via the Playwright layout job from `mobile-layout`) on a sample of website pages and on the Help view at 390 and 1280 px and fails on serious or critical issues.

### D8. Screenshots
`scripts/docs-screenshots.mjs` starts a server with the seeded demo data, opens the screens listed in a manifest at fixed sizes in light and dark, and writes WebP files to `docs/images/`. The guide references them with `<picture>` so dark mode gets the dark image. Running it is manual (`make docs-screenshots`); CI only checks that referenced images exist.

### D9. Shortcut table as data
The rows in `ShortcutHelp.tsx` move to `web/src/lib/shortcuts.ts` (key, description, context, section). The overlay renders from it and the build writes the keyboard guide's tables from it, so the overlay and the docs cannot drift.

## Data model, size and memory

- No data model change, no op field, no API route.
- Runtime bundle: unchanged for the main chunk; the help chunk is estimated at 40–60 KB gzipped for the user guide and is loaded only when Help opens. The precache grows by the same amount.
- Binary: +~200 KB (the help chunk embedded with the web app). Container image: same. Runtime memory: unchanged on the server.
- Website: static files only; the docs pages share `styles.css` plus a small `docs.css`.
- Build: `marked` and `@axe-core/playwright` as devDependencies only.

## Risks

- **Docs drift from behaviour.** Mitigated by the spec coverage check, the generated keyboard guide, and the existing archive rule that changes update `docs/`.
- **Generated files cause merge conflicts.** They are regenerated, never edited; CONTRIBUTING says to rerun `make docs` after a merge.
- **Screenshots go stale.** One command refreshes them; the 0.x release checklist includes it.
