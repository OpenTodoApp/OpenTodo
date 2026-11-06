# Proposal

## Why

The docs landing at open-todo.app/docs is a wall: a dark hero, then five unrelated sections of cards and long lists (Start here, Open Loops, Guides with 30 cards, Reference, a split of self-hosting and developer lists). It has no information architecture a visitor can scan, and its header (Features, Self-host, Tour, anchors into an old home page) and footer belong to a different site than the one around it. It also loads Bricolage Grotesque, Inter and JetBrains Mono from Google Fonts, a third-party request the website otherwise avoids. The website restyle for 1.0 (PLAN-1.0 Track C, "trust first") asks for a docs landing with clear entry points and depth, more readable inner pages, and a docs navigation that matches the site.

## What Changes

- **Entry points.** Every docs page belongs to one of six entry points: Get started, Use OpenTodo, Self-host, Integrate, Reference and Under the hood. The landing shows the search and the six as scannable blocks: title, one line, five or six key pages, and "All N pages".
- **Section pages.** One generated page per entry point (`/docs/start/`, `/docs/use/`, `/docs/self-host/`, `/docs/integrate/`, `/docs/reference/`, `/docs/internals/`) lists every page of it with its summary, the guides that go deeper into one topic nested under it (the nesting the docs index `docs/README.md` already writes with ↳).
- **Navigation.** The sidebar follows the six entry points as disclosures, the current one open; a guide's deeper pages show only inside the current guide. The breadcrumb reads Docs › entry point. Previous and next follow the sidebar order.
- **Header and footer of the website.** The header carries the website's destinations (Features, Learn, Docs, Blog), a Star link to the repository and Try the demo; below 768 px a menu that opens without JavaScript. The footer has the website's three groups, a row of ways to support and follow the project, and one licence line.
- **Readability.** Inter at 17 px/1.65, a 68-character measure, calmer headings, roomier code blocks, tables that scroll inside their box. Colours come from the app's own tokens (generated from `web/src/index.css` into `docs.css`), light and dark.
- **No third-party fonts.** The Google Fonts links go; Inter is the website's self-hosted file, and code uses the system monospace stack.

Out of scope: the content of any guide, the in-app Help (`help.json` is unchanged), search behaviour and its index, the website repository (it serves these pages from the next pinned site bundle).

## Capabilities

### Modified Capabilities

- `documentation`: the documentation website requirement gains entry points, section pages, the website's navigation and no third-party requests.

## Impact

`web/scripts/docs/site.mjs`, `lib.mjs`, `build.mjs`, `assets/docs.css`, `assets/docs.js`, `scripts/e2e-docs.mjs`, `web/scripts/docs/lib.test.mjs`. The docs site grows by six small HTML pages and the token block in `docs.css` (about 18 KB before compression); three font downloads from Google go away.
