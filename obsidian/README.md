# OpenTodo for Obsidian

Send a line, or a selection of lines, from any note to your own [OpenTodo](https://github.com/OpenTodoApp/OpenTodo) server as tasks. Each task links back to the note it came from, and the line gets a link to the task. It works on Obsidian for desktop and mobile, offline, and with end-to-end encrypted accounts.

- **Send line to OpenTodo**: from the command palette, the editor's context menu or the mobile toolbar. With no selection it sends the line at the cursor; with a selection, each non-empty line (at most 50).
- **Two grammars.** A checkbox line (`- [ ] Renew passport 📅 2026-11-05 ⏫ #errand`) is read like the [Tasks](https://publish.obsidian.md/tasks/) plugin and OpenTodo's vault: due date, start date, priority, `#tags` as labels, `[time:: 09:00]`, `[estimate:: 45m]`, `[deadline:: …]`. Any other line is read like OpenTodo's quick add: `Call the plumber tomorrow 9am p2 #Home @errand`.
- **A sheet before sending** shows the title, what was recognised (each chip can be removed) and the project. Enter sends, Escape cancels. "Send without asking" skips it.
- **After sending** the line gains `[opentodo:: https://your-server/?task=…]` (or, by setting, is ticked or removed). "Undo" in the notice for ten seconds puts the line back and moves the task to OpenTodo's Trash. A line that already carries the link is never sent twice.
- **The task links back**: its origin is `obsidian://open?vault=…&file=…`, so the chip on the task opens the note. Renaming or moving the note in Obsidian updates the links; "Fix OpenTodo links in this note" repairs links after a rename made elsewhere.
- **Offline**: tasks wait on the device and are sent when OpenTodo can be reached (on start, when the network returns, every minute, or with "Send pending to OpenTodo").
- **Encrypted accounts**: titles, notes and origins are encrypted on the device with OpenTodo's own code before they are queued; the passphrase unlocks the account key for the session ("Remember on this device" keeps it).

It needs OpenTodo 0.19.1 or newer on the server, and Obsidian 1.8.7 or newer.

## Connect

1. In OpenTodo, open **Settings → Integrations → API tokens** and create a token with the scope **Full**, named after the device (for example "Obsidian on my phone"). The plugin needs a `full` API token because it writes tasks: a `read` token cannot write, and an `agent` token is meant for AI assistants and labels changes as theirs.
2. In Obsidian, open **Settings → Community plugins → OpenTodo**, enter the server address (`todo.example.com`) and paste the token, then pick **Connect**.

The token is kept in Obsidian's storage on this device, never in the plugin's `data.json` inside the vault, so a vault synced to another device (Obsidian Sync, iCloud, git) does not carry it: connect each device with its own token, and revoke one without touching the others. **Disconnect** removes the token, the cached projects and labels and any remembered key from the device.

## Network use and privacy

The plugin connects only to the OpenTodo server you configure, through Obsidian's own request function, for these routes: `/healthz` (the server's version), `/api/v1/me`, `/api/v1/projects`, `/api/v1/labels`, `/api/v1/tasks/{id}` (the project of a linked task, after a rename on an encrypted account), `/api/v1/encryption/keys` (the wrapped key record of an encrypted account) and `/api/v1/sync` (sending tasks). Addresses must be `https`; plain `http` is accepted only for this device and private networks, after a warning.

It collects nothing: no analytics, no crash reports, no update check of its own (Obsidian updates plugins), no other destination. What it sends to your server is the tasks you send and the changes to their links.

## Install

- **From Obsidian**: Settings → Community plugins → Browse → "OpenTodo", once the plugin is listed in the directory.
- **By hand**: download `main.js`, `manifest.json` and `styles.css` from the latest release of [OpenTodoApp/obsidian-opentodo](https://github.com/OpenTodoApp/obsidian-opentodo/releases) into `<vault>/.obsidian/plugins/opentodo/`, then enable "OpenTodo" in Settings → Community plugins.
- **With BRAT**: add the beta plugin `OpenTodoApp/obsidian-opentodo`.

The guide is [docs/obsidian.md](https://github.com/OpenTodoApp/OpenTodo/blob/main/docs/obsidian.md) in the OpenTodo repository.

## Development

The source lives in [`obsidian/`](https://github.com/OpenTodoApp/OpenTodo/tree/main/obsidian) of the OpenTodo repository; the release repository holds only the built files. The plugin bundles OpenTodo's own quick-add parser (`web/src/lib/nlp`), envelope code (`web/src/lib/crypto.ts`, `web/src/lib/e2eeEnvelope.ts`) and clock (`web/src/lib/hlc.ts`), and the TypeScript twin of the vault's task-line grammar (`src/vault/line.ts`, pinned with `internal/vault` by `internal/vault/testdata/lines.vectors.json`), so the shared vectors pin the plugin too.

- `make obsidian`: type-check, unit tests (web/'s vitest and happy-dom, with an in-memory `obsidian` module), and the build of `obsidian/dist/`, which fails when `main.js` is over 250 KB or needs a Node or Electron module (Obsidian mobile has neither).
- `make obsidian-e2e`: the plugin against `bin/opentodo` (`make build` first).
- `cd obsidian && node esbuild.config.mjs --watch`, with `obsidian/dist` linked into a test vault's `.obsidian/plugins/opentodo`.

Dependencies: none at run time. Build time: `obsidian` (the API's types) and `esbuild`, pinned in `package.json`.

The plugin's strings are in `locales/` in the six languages OpenTodo ships, follow Obsidian's language and are checked by `make i18n-check`.

## Releases

Every OpenTodo release (`v0.20.0`) publishes the plugin with the same version (`0.20.0`): CI builds it from the tag and pushes `manifest.json`, `main.js`, `styles.css`, `versions.json`, this README and the licence to [OpenTodoApp/obsidian-opentodo](https://github.com/OpenTodoApp/obsidian-opentodo) with a tag equal to the version, and that repository's workflow attaches the three files to a release ([`mirror/release.yml`](mirror/release.yml)). By hand: `node obsidian/scripts/mirror.mjs 0.20.0 <checkout>` after `make obsidian`.

Owner actions:

1. **The release repository's deploy key**: `OpenTodoApp/obsidian-opentodo` exists. It needs a deploy key that may write to it (the organisation must allow deploy keys first: Organization settings → Member privileges → Deploy keys), whose private half is the `OBSIDIAN_DEPLOY_KEY` secret of OpenTodoApp/OpenTodo:

   ```sh
   ssh-keygen -t ed25519 -N '' -C opentodo-ci-obsidian -f obsidian_deploy
   gh repo deploy-key add obsidian_deploy.pub -R OpenTodoApp/obsidian-opentodo --allow-write --title "OpenTodoApp/OpenTodo CI"
   gh secret set OBSIDIAN_DEPLOY_KEY -R OpenTodoApp/OpenTodo < obsidian_deploy && rm obsidian_deploy obsidian_deploy.pub
   ```

   Without the secret the CI job prints the manual steps and succeeds.
2. **The community directory**: after the first release in the release repository, a maintainer opens a pull request to [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases) adding to `community-plugins.json`:

   ```json
   {
     "id": "opentodo",
     "name": "OpenTodo",
     "author": "OpenTodo",
     "description": "Send a line or a selection from any note to your own OpenTodo server as tasks that link back to the note. Works offline and with encrypted accounts.",
     "repo": "OpenTodoApp/obsidian-opentodo"
   }
   ```

   and answers the review. Until it is listed, the plugin installs by hand or with BRAT.

## Licence

AGPL-3.0-only, like OpenTodo: the plugin bundles OpenTodo's own code. See [LICENSE](LICENSE).
