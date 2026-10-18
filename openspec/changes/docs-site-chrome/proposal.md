# Proposal

## Why

The documentation website ships in the site bundle and the public website serves it under `/docs/` unchanged. Next to the website it looks like another site: a dark navy header, its own navigation (Features, Self-host, a "Tour" anchor, Docs), its own hard-coded colours instead of the app's `--ot-*` tokens, and fonts loaded from Google Fonts while the website self-hosts its font and promises no third-party requests. A visitor moving from a product page to a docs page loses the header they were using, and the docs make a request to Google that nothing else on open-todo.app makes. Some user guides also show planning vocabulary that means nothing to a reader, such as "(OpenSpec change `reminders`)" in the reminders guide's first sentence.

## What Changes

- The docs site's header uses the website's top-level navigation (Features, Compare, What it costs, Self-host, Help, Docs), a GitHub icon link and a "Try the demo" button, on the same light or dark surface as the website's header, below 768 px as a menu that opens without JavaScript.
- The docs stylesheet takes its colours from the `--ot-*` tokens generated from `web/src/index.css` (the same `tokens.css` the bundle ships), not from a separate palette.
- Fonts are self-hosted in the docs site (the Inter variable font the app already ships, plus a monospace stack); no request leaves open-todo.app for fonts.
- The docs footer gains the website's licence, security and specification links in the same order, and links to the website's release list.
- Pages for users and administrators (`audience: user` or `admin`) no longer name OpenSpec changes in their text; developer pages keep them. The docs check fails on such a reference in a user or admin page.

Out of scope: the docs content beyond removing the planning references; search, the sidebar and the "on this page" list (unchanged); the website's own pages (separate changes in the website repository: `website-layout-integrity`, `website-section-system`, `website-navigation-and-home`, `website-voice-and-releases`, `website-maintainer-and-proof`); the in-app Help view, which does not use the docs site's header or stylesheet.

ROADMAP: advances "User guide, docs website and in-app Help" (`user-documentation`). No new environment variable and no change to the op log.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `documentation`: "Documentation website" names the header, tokens and self-hosted fonts; "Documentation stays complete and correct" adds the planning-reference rule and the no-external-font rule.

## Impact

- `web/scripts/docs/site.mjs` (header, footer, head), `web/scripts/docs/assets/docs.css`, the font file copied into the docs output, `web/scripts/docs/check.mjs` and `check.test.mjs`.
- `docs/reminders.md`, `docs/e2ee.md`, `docs/caldav.md` (references removed from their text).
- `scripts/e2e-docs.mjs` (header without JavaScript at 360 px).
- No new dependency; the site bundle grows by one font file (about 70 kB).
