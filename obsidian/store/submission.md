# Submitting OpenTodo to Obsidian's community directory

What a maintainer enters to list the plugin, ready to copy (obsidian-plugin task 6.7, design D14). It is not part of the plugin or of the release repository.

**There is no pull request any more.** Obsidian moved submissions to the community directory at [community.obsidian.md](https://community.obsidian.md) in May 2026: `obsidianmd/obsidian-releases` removed its pull request templates and its validation bot (commit `d4f0694`, 2026-05-15), and its `community-plugins.json` is now copied every hour from the directory (`.github/workflows/mirror-community-json.yml`). A pull request adding the entry would not be merged. The directory's own review replaces the bot: it scans the manifest, the release, the source and the build after each release, and shows what to fix on the entry's page. Sources: [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin), [Submission requirements for plugins](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins), [Developer policies](https://docs.obsidian.md/community-directory/developer-policies), [Set up and claim](https://docs.obsidian.md/community-directory/set-up-and-claim), [Manage your plugin or theme](https://docs.obsidian.md/community-directory/manage-entry), [FAQ](https://docs.obsidian.md/community-directory/faq).

## Before submitting

1. Release OpenTodo `v0.20.0`. The `obsidian-plugin` CI job pushes the plugin and its source to [OpenTodoApp/obsidian-opentodo](https://github.com/OpenTodoApp/obsidian-opentodo) with the tag `0.20.0`, and that repository's workflow creates the release `0.20.0` with `main.js`, `manifest.json` and `styles.css`.
2. Check the release repository:

   ```sh
   gh release view 0.20.0 -R OpenTodoApp/obsidian-opentodo --json tagName,name,assets -q '{tag: .tagName, name: .name, assets: [.assets[].name]}'
   # {"assets":["main.js","manifest.json","styles.css"],"name":"0.20.0","tag":"0.20.0"}
   gh api repos/OpenTodoApp/obsidian-opentodo/contents/manifest.json -q .content | base64 -d   # "version": "0.20.0"
   ```

3. Optional: update the release repository's GitHub description, which still says "Release files only" (it now also holds the source), for example: "OpenTodo for Obsidian: send lines from your notes to your own OpenTodo server as tasks, and sync a folder of task files. Published from OpenTodoApp/OpenTodo (obsidian/); edit there."

## The submission form

1. Sign in at [community.obsidian.md](https://community.obsidian.md) with an Obsidian account, and under **Profile → GitHub** select **Connect** with a GitHub account that owns or is a **public** member of the `OpenTodoApp` organisation (the directory verifies ownership through it).
2. Optional, to share the entry: **Organizations → Create an organization**, handle `opentodo`, display name `OpenTodo`.
3. **Plugins → New plugin**:

| Field | Value |
| --- | --- |
| GitHub repository URL | `https://github.com/OpenTodoApp/obsidian-opentodo` |
| Owner | the `opentodo` organisation (or yourself) |

4. Agree to the developer policies and to maintaining the plugin, then **Submit**.
5. On the entry's page, **Review branch** runs a preview scan of `main` (no release needed); after the release, **Request review**. Errors block installing; warnings do not. `make obsidian-review` ran the same kinds of checks before the tag (below), so the expected result is no error.

## The listing (Edit listing)

- **Short description** (the manifest's, the directory entry's):

  > Send lines from any note to your own OpenTodo server as tasks that link back to the note, and keep a folder of task files in two-way sync. Works offline and with encrypted accounts.

- **Long description**:

  > OpenTodo is a free, open-source, self-hosted task manager. This plugin connects Obsidian to your own OpenTodo server.
  >
  > Put the cursor on a line (or select several) and pick "Send line to OpenTodo": each line becomes a task, read like the Tasks plugin for checkbox lines (dates, priority, tags) or like OpenTodo's quick add for any other line ("Call the plumber tomorrow 9am p2 #Home"). The task links back to the note, and the line gets a link to the task. Optionally, one folder of the vault stays in two-way sync with OpenTodo as Markdown task files, on phones too.
  >
  > Works offline (tasks wait on the device), with end-to-end encrypted accounts, in six languages, on desktop and mobile. It talks only to the server you configure and collects nothing. Requires an OpenTodo account on a server you run or use.

- **Categories**: the directory's closest to task management, productivity and sync.
- **Payment type**: **Free**. Nothing is paid: OpenTodo is AGPL software that the user hosts, and the plugin needs no third-party service (the directory's FAQ reserves "Optional payment" for plugins that rely on a paid service or lock features).
- **Icon**: OpenTodo's mark, `web/public/favicon.svg` (or `apple-touch-icon.png`).
- **Screenshots** (optional, up to 5 desktop at 1200 × 800 and 5 mobile at 900 × 1600): the send sheet on a daily note, the line with its `[opentodo:: …]` link, the settings tab, the synced folder's `Home.md` beside the app. None are made yet.

## The directory entry

Once published, `community-plugins.json` (copied from the directory) carries:

```json
{
  "id": "opentodo",
  "name": "OpenTodo",
  "author": "OpenTodo",
  "description": "Send lines from any note to your own OpenTodo server as tasks that link back to the note, and keep a folder of task files in two-way sync. Works offline and with encrypted accounts.",
  "repo": "OpenTodoApp/obsidian-opentodo"
}
```

`test/review.test.ts` keeps this equal to `manifest.json` and to the copy in the README.

## The former pull request checklist, answered

The template `obsidianmd/obsidian-releases` used until May 2026 (`.github/PULL_REQUEST_TEMPLATE/plugin.md`), filled in for the record and for the policy confirmation in the form. Ticked only what is true today (2026-11-02); the rest says what makes it true.

```markdown
# I am submitting a new Community Plugin

- [x] I attest that I have done my best to deliver a high-quality plugin, am proud of the code I have written, and would recommend it to others. I commit to maintaining the plugin and being responsive to bug reports. If I am no longer able to maintain it, I will make reasonable efforts to find a successor maintainer or withdraw the plugin from the directory.

## Repo URL

Link to my plugin: https://github.com/OpenTodoApp/obsidian-opentodo

## Release Checklist
- [ ] I have tested the plugin on
  - [ ]  Windows
  - [ ]  macOS
  - [ ]  Linux
  - [ ]  Android _(if applicable)_
  - [ ]  iOS _(if applicable)_
- [ ] My GitHub release contains all required files (as individual files, not just in the source.zip / source.tar.gz)
  - [ ] `main.js`
  - [ ] `manifest.json`
  - [ ] `styles.css` _(optional)_
- [ ] GitHub release name matches the exact version number specified in my manifest.json (_**Note:** Use the exact version number, don't include a prefix `v`_)
- [x] The `id` in my `manifest.json` matches the `id` in the `community-plugins.json` file.
- [x] My README.md describes the plugin's purpose and provides clear usage instructions.
- [x] I have read the developer policies at https://docs.obsidian.md/Developer+policies, and have assessed my plugin's adherence to these policies.
- [x] I have read the tips in https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines and have self-reviewed my plugin to avoid these common pitfalls.
- [x] I have added a license in the LICENSE file.
- [x] My project respects and is compatible with the original license of any code from other plugins that I'm using.
      I have given proper attribution to these other projects in my `README.md`.
```

Why the open boxes are open:

- **Tested on each platform**: the automated tests run the plugin's code in Node with happy-dom and an in-memory `obsidian` stand-in, and `make obsidian-e2e` against a real server, but not inside Obsidian on these systems. The manual runs on devices are listed in the README ("Manual runs of the folder sync", all "not yet run"). Tick each system after sending a line and syncing the folder in Obsidian there.
- **Release files** and **release name**: true once `v0.20.0` is released (the release workflow attaches the three files to a release named and tagged `0.20.0`); check with the commands under "Before submitting".
- **Attribution**: the plugin uses no code from other plugins. It bundles OpenTodo's own modules (same project, same licence) and reads the line format of the Tasks plugin and Dataview's inline fields, which are formats, not code.

## What the review checks, and where it is checked here

| Directory check | Here |
| --- | --- |
| Manifest: required keys only, `id`/`name` without "obsidian" or "plugin", description of at most 250 characters ending with a period, without "Obsidian" or emoji, `authorUrl` not the plugin's repository, no `fundingUrl` without donations, `minAppVersion` set, `version` x.y.z | `test/review.test.ts` (`make obsidian`) |
| Releases: a release tagged exactly the manifest's version with `main.js` and `manifest.json` (and `styles.css`) | `mirror/release.yml`, `scripts/mirror.mjs` (refuses a `v` prefix), `test/mirror.test.ts` |
| Source code: Obsidian's ESLint rules, a dependency audit, a recognised licence | `make obsidian-review` (`review/`): `eslint-plugin-obsidianmd` recommended rules with no error, `npm audit` with no finding; `LICENSE` is the AGPL-3.0 text, which GitHub already recognises on the release repository |
| Build verification: install, `npm run build`, output equal to the release | `make obsidian-review`: `npm ci`, `npm run build` in a filled release repository, byte comparison with `obsidian/dist` |
| Mobile: no Node or Electron module with `isDesktopOnly: false` | `esbuild.config.mjs` fails the build otherwise; `test/bundle.test.ts` |
| Disclosures: account required, network use, files outside the vault | README "Requirements" and "Network use and privacy" |

Warnings the review will still show, none blocking: the settings tab does not implement Obsidian 1.13's `getSettingDefinitions()` (it would need `minAppVersion` 1.13 or a second settings code path), and the sentence-case rule reads the English quick-add vocabulary (`web/src/lib/nlp/vocab/en.ts`, month and weekday names) as interface text.
