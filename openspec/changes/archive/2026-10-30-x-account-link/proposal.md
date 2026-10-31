# Proposal

## Why

OpenTodo now has an account on X (https://x.com/opentodoapp) where releases and the work in progress are posted in short form. The app, the README and the user guide name the issue tracker, the Discord server, the repository and Buy Me a Coffee as the ways to follow and reach the project; nobody can find the X account from there.

## What Changes

- Settings → About gets a "News and updates" row that opens the X account, searchable from the settings search like the other About rows.
- The README names the X account next to the Discord server, near the top.
- The user guide page "Feedback and support" (served in Help, offline, and on the website docs) gets a "Follow the news" section with the address.
- The address is one constant in the client, beside the Discord invite, so a changed handle is a one-line edit.

Out of scope: any X integration (sign-in, sharing a task, embedded posts), a row in the welcome note (it stays focused on the three asks it has), a link in the sidebar or on the sign-in screen, and the website (that is the `website-x-link` change in the website repository). No new environment variable, no op-log change, no new dependency, no network request from the app: a plain link that opens in a new tab.

ROADMAP.md: this advances no feature row; it is community infrastructure, like `discord-community`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `settings-navigation`: the "About section" requirement adds a News and updates row that opens the X account.

## Impact

- `web/src/app/WelcomeDialog.tsx` (the `X_URL` constant beside `DISCORD_URL`), `web/src/app/AboutSection.tsx` (a new row), `web/src/lib/settingsCopy.ts` (the row's copy), `web/src/app/settingsIndex.ts` (a search entry), `web/src/app/welcomeDialog.test.tsx` and `web/src/app/settingsSearch.test.tsx`.
- Three new source messages in the five shipped catalogs under `web/src/locales/` (`make i18n-check` fails on a missing entry), `messages.json` regenerated.
- `README.md`, `docs/feedback-and-support.md` (and through it the in-app Help and the website docs of the next release), `CHANGELOG.md`.
- No server code, no API, no schema change. Bundle size: a few hundred bytes of text, no new icon.
