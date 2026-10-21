# Proposal

## Why

OpenTodo now has a Discord server (https://discord.gg/Jmj7WuRQ) where people can ask questions, share how they use the app and talk to the maintainer without opening a GitHub issue. Today the only ways to reach the project named in the app, the README and the docs are the issue tracker, the repository and Buy Me a Coffee; nobody can find the server from there.

## What Changes

- The welcome note shown to a new owner gets a row inviting them to join the Discord server, beside the issue, star and coffee links.
- Settings → About gets a Community row that opens the Discord server, searchable from the settings search like the other About rows.
- The README names the Discord server next to the issue tracker, near the top and under Contributing.
- The user guide page "Feedback and support" (served in Help, offline, and on the website docs) gets a "Talk to other people" section with the invite.
- The invite address is one constant in the client, so a changed invite is a one-line edit.

Out of scope: any Discord integration (bots, notifications, sign-in with Discord), a link in the main navigation or the sidebar, a link on the sign-in screen, and the website and demo pages (those are the `website-discord-link` change in the website repository). No new environment variable, no op-log change, no new dependency, no network request from the app: a plain link that opens in a new tab.

ROADMAP.md: this advances no feature row; it is community infrastructure around the finished `welcome-note` change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `first-run`: the "Welcome note for the owner" requirement adds the Discord link to the dialog's links.
- `settings-navigation`: the "About section" requirement adds a Community row that opens the Discord server.

## Impact

- `web/src/app/WelcomeDialog.tsx` (the `DISCORD_URL` constant and a new link row), `web/src/app/AboutSection.tsx` (a new row), `web/src/app/settingsIndex.ts` (a search entry), `web/src/app/welcomeDialog.test.tsx`.
- New source messages in the five shipped catalogs under `web/src/locales/` (`make i18n-check` fails on a missing entry), `messages.json` regenerated.
- `README.md`, `docs/feedback-and-support.md` (and through it the in-app Help and the website docs of the next release), `CHANGELOG.md`.
- No server code, no API, no schema change. Bundle size: a few hundred bytes of text and one Lucide icon if a new one is chosen.
