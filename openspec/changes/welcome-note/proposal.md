## Why

The owner who installs OpenTodo has no obvious way to give feedback or support the project from inside the app: the issue tracker, the GitHub repository and the Buy Me a Coffee page are only in the README. A short thank-you the first time the owner opens a new server is the moment people are most likely to star or report something, and it costs nothing if it shows once.

## What Changes

- The first time the owner opens a new server (an owner account created in the last seven days, no task yet, not the demo), a dialog thanks them for installing OpenTodo and offers three plain links: open an issue on GitHub, star the repository, and a Buy Me a Coffee button. One primary button, "Start using OpenTodo", closes it; Escape, the close button and a click outside close it too.
- Closing it writes `welcome: "seen"` to the user's preferences (a new additive `user_prefs` field), so it never shows again on any of the account's devices. Members invited to the server, the public demo and accounts that already have tasks or are older than a week (servers in use before this change) never see it.
- A short Reference page, "Feedback and support", lists the same links in Help, as the dialog says.
- The coffee button uses Buy Me a Coffee's brand yellow through two new colour tokens (`--ot-coffee`, `--ot-on-coffee`, the same in every theme). The links load nothing from those sites: no widget, no script, no image.

## Impact

`internal/sync/ops.go` (schema: `user_prefs.welcome`, string, additive), the shared schema fixture, `web/src/lib/types.ts`, `web/src/lib/ops.ts` (default `''`), `web/src/lib/userPrefs.ts` (`welcomeSeen`, `setWelcomeSeen`), `web/src/app/WelcomeDialog.tsx`, `web/src/app/Shell.tsx`, `web/src/index.css` (two tokens), nine strings in the five shipped languages, `docs/feedback-and-support.md`. No migration, route or environment variable. Older apps ignore the new field.
