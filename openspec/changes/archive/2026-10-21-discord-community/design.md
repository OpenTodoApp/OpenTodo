# Design

## Context

The welcome note (`web/src/app/WelcomeDialog.tsx`) and Settings → About (`web/src/app/AboutSection.tsx`) already share the project's outbound links as exported constants (`ISSUES_URL`, `REPO_URL`, `COFFEE_URL`) and render them as plain anchors with `target="_blank" rel="noopener noreferrer"`; the settings search index (`web/src/app/settingsIndex.ts`) lists each About row. The user guide `docs/feedback-and-support.md` is the Help page behind those rows and ships to the website docs through the site bundle. Every interface string is its own message id and `make i18n-check` fails when a shipped catalog (de, es, fr, it, pt) lacks one. Motivation: see proposal.md.

## Goals / Non-Goals

**Goals:**
- One place holds the invite address; the three surfaces (welcome note, About, docs/README) read consistently.
- No request to Discord unless the person activates the link (keeps non-negotiable 5: no third-party network calls).

**Non-Goals:**
- Rendering Discord's widget, member count or an embed.
- Translating the docs page (Help stays English, as the localization change decided).

## Decisions

- **D1. One constant, `DISCORD_URL = 'https://discord.gg/Jmj7WuRQ'`, exported from `WelcomeDialog.tsx` beside the other project links.** Alternative: a server setting or `/api/v1/auth/status` field. Rejected: the address is a project fact like the repository address, not an instance fact, and a client constant works offline and on the demo.
- **D2. Welcome note: a fourth `LinkRow` between the issue row and the star row**, title "Join the community on Discord", detail "Ask questions and see what other people build." Alternative: replacing the issue row. Rejected: issues stay the place for bug reports, Discord is for conversation.
- **D3. About: a `SettingRow` with id `about-community`, label "Community", description "Questions, ideas and other people who use OpenTodo, on Discord.", control an external link labelled "Join on Discord" with `data-about-link="discord"`.** Placed between the feedback row and the source row. A matching `settingsIndex.ts` entry with keywords `discord community chat forum people` so the search scenario holds.
- **D4. Icon: Lucide `messages-square`**, added to `web/src/ui/icons/names.json` and regenerated with `scripts/icons-sync.mjs` against the pinned `lucide-static` version (the row for issues keeps `message-circle`). Alternative: reuse `message-circle` or `users`. Rejected: two identical icons in one dialog read as one action; the extra path is about 300 bytes in the sprite. There is no Discord brand glyph in Lucide and the design system allows no other icon source.
- **D5. Docs: a "Talk to other people" section in `docs/feedback-and-support.md`** before "Help other people find it", and the summary and `docs/README.md` row updated; the About paragraph lists the Discord row. The README gets the invite in the "Questions, ideas and bug reports" line and under Contributing.
- **D6. Translations are added by hand to the five shipped catalogs** in the same change (the catalogs are hand-written JSON; `node scripts/i18n/extract.mjs --write` refreshes `messages.json`).

Data model impact: none (no op, no field, no setting). Dependencies: none; image size and memory unchanged. Interface budget (docs/interface-guide.md): About gains one row in a settings section (no chrome, no list, no shortcut); the welcome note gains one row in a dialog that already scrolls as one region.

## Risks / Trade-offs

- [The invite link expires or is revoked] → Use a permanent invite on the server; a change is one constant plus two Markdown lines, and the website holds its own copy (see the website change).
- [Discord is a third party in an app that promises no third-party calls] → Only a link; nothing is loaded until the person opens it, same as the GitHub and Buy Me a Coffee links. Tests assert `target="_blank"` and that no element loads a Discord address.
- [Translators' catalogs drift] → `make i18n-check` fails on a missing entry; the change ships the five translations.
