# Proposal

## Why

`ot vault watch` serves desktop Obsidian users well, but the research (§3.2 "The Obsidian Vault Bridge", P3.3, the r/ObsidianMD thread on two-way vault sync) names two needs it cannot meet: many people capture tasks inline in daily and meeting notes rather than in project files, and Obsidian mobile cannot run a Go binary at all. A small community plugin that talks to the user's own server solves the first directly — "Send line to OpenTodo" from any note, with the task linking back to that note — and is the base the second (`obsidian-vault-sync`) builds on.

The roadmap item `obsidian-plugin` (0.20 "Everywhere", size L) is split into three changes so each stays reviewable:

1. `obsidian-origin` (S): the `obsidian` origin kind and its link rules on the server, web app and shells.
2. **`obsidian-plugin` (this change, M):** the plugin itself — connecting to a server, encrypted accounts, "Send line / selection to OpenTodo", the link back, distribution.
3. `obsidian-vault-sync` (M–L): two-way vault sync inside the plugin, so Obsidian on a phone keeps a vault folder in sync without `ot`.

## What Changes

- A new top-level folder `obsidian/`: an Obsidian community plugin in TypeScript (plugin id `opentodo`), built with esbuild into one `main.js`, desktop and mobile (`isDesktopOnly: false`), no runtime dependency beyond the `obsidian` API.
- **Connect**: Settings → Community plugins → OpenTodo takes the server address and a `full` API token (created in OpenTodo under Settings → Integrations → API tokens, with a "For Obsidian" hint there). The token is kept in Obsidian's per-device storage, never in the plugin's `data.json`, which syncs with the vault. The plugin talks only to that server, through Obsidian's `requestUrl` (no CORS change on the server).
- **Send line / selection to OpenTodo**: an editor command, an editor context-menu entry and a mobile toolbar action. The current line, or each line of the selection (up to 50), becomes a task. A Tasks-plugin checkbox line (`- [ ] … 📅 2026-10-30 ⏫ #errand`) is read with the vault's line grammar; any other line with the quick-add parser. A small confirmation sheet shows what was recognised and the project (default: Inbox, or the project chosen in the plugin's settings) before anything is sent; "Send without asking" is a setting, off by default.
- **The link back**: every sent task carries `origin: {kind: "obsidian", id: <note path>, url: obsidian://open?vault=…&file=…, title: <note name>}` (from `obsidian-origin`), and the line gains an inline field `[opentodo:: <link to the task>]` (or, by setting, is ticked or removed). A line already carrying that field is not sent twice. "Fix OpenTodo links in this note" re-points the origins after a note is renamed or moved.
- **Offline**: sends are written into a per-device outbox as ready ops with client-made ids and pushed when the server answers; the line gets its link at once.
- **Encrypted accounts**: content is encrypted on the device with the web app's own envelope code, unlocked by the passphrase in the plugin; nothing is sent while locked.
- **Server side, small and additive**: the sync exchange gains an optional `push_only` feature, so a device that only writes (this plugin) is answered with the new cursor and no pulled operations.
- **Distribution**: AGPL-3.0, like the repository (Obsidian's directory accepts any OSI licence). CI builds the plugin on tags and publishes its release to a mirror repository that holds only the plugin's `manifest.json`, `main.js` and `styles.css`, because Obsidian reads a plugin from the root of its own repository. The plugin's strings in the six languages.

Not **BREAKING**: no op field, no new route, no environment variable; one additive sync request feature.

**Out of scope**: two-way vault sync (`obsidian-vault-sync`); ticking a sent line completing the task, or the task's state flowing back into the daily note (the line is a capture, not a mirror — the vault sync is the mirror); TaskNotes linking from the plugin; a narrower token scope for capture-only clients (owner question in design.md); links to headings or blocks; Logseq or other editors. ROADMAP.md item advanced: 0.20 "Everywhere", `obsidian-plugin` (second of its three changes).

## Capabilities

### New Capabilities

- `obsidian-plugin`: the Obsidian plugin's connection, credential storage, send command, link back, offline outbox, encrypted-account behaviour and distribution.

### Modified Capabilities

- `offline-first-sync`: the sync exchange accepts the optional `push_only` feature.

## Impact

- **Data model, sync and op schema:** no new field. The plugin writes ordinary task (and, with quick-add time spent, time-entry) ops with device `obsidian:<install id>`; they converge like any device's. `push_only` is an additive request feature next to `clock_skew` and `backfill_ack`; old servers ignore unknown features and answer with a normal page, which the plugin discards.
- **E2EE:** no new content field: title, notes and `origin` are already content fields. The pure envelope code moves out of `web/src/lib/e2ee.ts` (which depends on Dexie and the API client) into a dependency-free module shared by the web app and the plugin, so there is one implementation.
- **API, CLI, MCP:** no route change. `docs/api.md` documents `push_only`. The plugin needs a `full` token: `read` tokens are refused on `/api/v1/sync`, and `agent` tokens are for AI assistants and gated by the user's "Allow AI assistants to make changes" switch.
- **CalDAV and vault:** none. A sent task appears in project files as any task does, with `[origin:: obsidian://…]` read-only.
- **Shared code and vectors:** the plugin imports, at build time, `web/src/lib/nlp` (quick add), the line grammar ported for it from `internal/vault/line.go` (TypeScript twin pinned by the fixture vault `internal/vault/testdata/vault` and a new line-vector file), and the envelope module. `obsidian-vault-sync` reuses the same line grammar.
- **Size:** server and web bundle unchanged apart from the envelope split. The plugin's `main.js` budget is 250 KB minified (measured in CI); no new dependency in `web/` or `go.mod`; the plugin's dev dependencies are `obsidian` (types) and `esbuild`, both build-time only.
- **Repository:** a new `obsidian/` folder, a CI job for it, `make obsidian`, and a mirror repository `OpenTodoApp/obsidian-opentodo` (owner action).
