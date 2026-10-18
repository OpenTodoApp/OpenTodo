# Design

## Context

See proposal.md. `web/scripts/docs/site.mjs` writes the head (Google Fonts for Bricolage Grotesque, Inter and JetBrains Mono, then `docs.css`), the header (`header()`: brand, four links to `/#features`, `/#self-host`, `/#tour`, `/docs/`, a GitHub link) and the footer. `docs.css` declares its own palette (`--bg`, `--link`, `--navy`…) with a navy header. The site bundle already generates `tokens/tokens.css` from `web/src/index.css` (`tokensCss` in `scripts/site-bundle.mjs`), and the app ships `web/src/assets/fonts/InterVariable-latin.woff2`. The public website serves the docs byte for byte, so the docs must carry their own chrome; the website cannot wrap them.

## Goals / Non-Goals

**Goals:** a docs page that looks like part of open-todo.app, with no third-party font request and no planning vocabulary in user guides.

**Non-Goals:** sharing code with the website repository at build time, changing the in-app Help view, rewriting docs content.

## Decisions

1. **Header links are the website's stable top-level URLs, written in the docs generator.** `lib.mjs` gets a `WEBSITE_NAV` list (`/#features`, `/vs/`, `/cost/`, `/self-host/`, `/help/`, `/docs/`) and the demo URL. These are the website's public, long-lived paths; the website's link check (`scripts/checks/links.mjs` runs over `dist/docs/` too) fails if one stops resolving, so a drift is caught on the website's bundle-bump pull request. *Alternative:* the website injecting its header into the docs at build time; rejected, the website's spec serves the docs as shipped, and an injected header would break the "released docs only" guarantee if the website changed between releases. *Alternative:* a nav file published by the website and fetched by the app build; rejected, a network dependency in the release build.
2. **Header styles mirror the website's, from tokens.** The docs build inlines the generated `--ot-*` tokens (the same `tokensCss` output) at the top of `docs.css`, and the docs palette variables become aliases of them (`--link: var(--ot-accent-text)` and so on). The navy header goes; the header uses the surface token with a bottom border, as the website does.
3. **Self-hosted Inter, system monospace.** Copy `InterVariable-latin.woff2` into the docs output with an `@font-face` rule; headings use Inter at the website's display weight; code uses `ui-monospace, SFMono-Regular, Menlo, monospace`. Dropping Bricolage and JetBrains Mono removes the only reason for Google Fonts. *Alternative:* self-host all three; rejected, the website uses only Inter, and matching it is the goal.
4. **Phone menu as `<details>`.** Same pattern as the website and the existing docs sidebar toggle: works without JavaScript, closes by activating the summary.
5. **Planning-reference rule in `check.mjs`.** For pages whose front matter `audience` is `user` or `admin`, fail on `OpenSpec change` in the rendered text (code blocks included, as they are shown to readers). The three affected pages (`reminders`, `e2ee`, `caldav`) drop the parenthetical; where it explains a behaviour, the sentence keeps the behaviour and loses the reference. Developer pages keep their references, which are useful there.
6. **External-asset rule in `check.mjs`.** Scan the built head for `<link rel="stylesheet">` and `@import`/`url()` in CSS pointing to another origin. The analytics script stays: it is the website's own self-hosted analytics, allowed by the website's spec, and is a script, not a font or stylesheet.

## Risks / Trade-offs

- [The website renames a top-level page and the docs header links to the old path until the next app release] → the website keeps old URLs (its navigation change removes none), and the link check on the bundle-bump pull request names any that break.
- [Docs headings lose the Bricolage display face] → they match the website, which is the point; the visual review of the docs preview decides the heading weights.
- [Token names change in `web/src/index.css`] → the alias layer in `docs.css` is the only place to update, and `docs-site-check` (axe in light and dark) catches contrast regressions.

## Data model, image size and memory

No data model change; no op field touched. The container image is unchanged (the docs are not in the image). The site bundle grows by about 70 kB (the font) and loses three Google Fonts requests per docs page view.
