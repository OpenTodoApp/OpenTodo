# Design

## D1. Six entry points over the existing groups
Pages keep their front matter; `entryOf(fm, slug)` maps the existing groups:

| Entry point | URL | Groups |
| --- | --- | --- |
| Get started | `/docs/start/` | Get started, Switch from another app |
| Use OpenTodo | `/docs/use/` | Open Loops, Guides |
| Self-host | `/docs/self-host/` | Self-hosting |
| Integrate | `/docs/integrate/` | Integrations |
| Reference | `/docs/reference/` | Reference, plus Keyboard shortcuts |
| Under the hood | `/docs/internals/` | Internals, plus Stability and compatibility |

Switching from another app sits under Get started because it is something a person does once, on the way in, next to installing the app. Open Loops sits under Use: it is a way of using the app every day, not a first step. Keyboard shortcuts is a reference table, and Stability is a promise about the system, so two slug overrides move them. The URLs were checked against every page and folder under `docs/`; none collides.

## D2. Depth from the index the docs already keep
`docs/README.md` already nests deeper guides under their topic with ↳ rows. `indexTree()` reads those rows into parent → children, and the section pages and the sidebar use it: a topic guide with its deeper pages under it. A page the index does not nest is a top-level item. No new front matter.

## D3. The website's header and footer
Same markup and look as the website's `SiteHeader` and `SiteFooter` (without the language switch: the docs are English). The links are absolute paths on open-todo.app, so the docs need no knowledge of the website's build. The demo and repository addresses are constants in `lib.mjs`.

## D4. Tokens, not copies
`build.mjs` writes the app's colour tokens (the same `tokensCss()` the site bundle uses, plus the `--ot-mix-*` ratios they reference) at the top of `docs.css`, so a new release's palette reaches the docs with no edit. Inter is loaded from `/fonts/InterVariable-latin.woff2`, the file the website already serves; where it is missing the system sans takes over.

## D5. Search results
Every docs page carries inline JSON-LD: a BreadcrumbList (OpenTodo, Docs, the entry point, the page) and a TechArticle (headline, description, url, language). Section pages and the landing carry the breadcrumb only. The meta and Open Graph descriptions are capped at 160 characters, cut at the last sentence end after 80 characters or else at a word with an ellipsis; the page itself keeps the full summary.

## Build and download size
Six more pages; `docs.css` grows by the token block (about 18 KB, 3 KB gzipped); Google Fonts' stylesheet and three font files (about 200 KB) are no longer requested. Build time is unchanged.
