# Proposal

## Why

`ot vault watch` keeps a folder of Obsidian Tasks files in two-way sync with OpenTodo, but only where a Go binary can run. Obsidian on iPhone, iPad and Android cannot run it (research §3.2: "Obsidian Mobile cannot execute a background Go CLI binary"), so people who keep their notes only on a phone, or who want their phone's edits to reach OpenTodo without a desktop running `ot`, have no vault sync at all. This is the third of the three changes the roadmap item `obsidian-plugin` (0.20 "Everywhere", size L) is split into: `obsidian-origin` (the link-back kind), `obsidian-plugin` (connect, send a line, distribution), and this one, which puts the vault sync inside the plugin.

## What Changes

- The OpenTodo plugin for Obsidian gains **Vault sync**: in its settings, "Sync a folder with OpenTodo" picks a folder inside the Obsidian vault (default `OpenTodo/`). The plugin then does what `ot vault sync` does, with the same file format, the same merge and conflict rules, the same limits and the same state file `.opentodo/state.json`, so a folder can move between `ot vault` and the plugin.
- The engine is a TypeScript port of `internal/vault` (layout, line grammar from `obsidian-plugin`, merge, plan, exchange, state), pinned to the Go engine by the fixture vault and a new set of shared sync vectors generated from the Go engine. TaskNotes linking is not ported.
- Syncs run when the plugin loads, about two seconds after a file in the folder stops changing, every 30 seconds while Obsidian is in front, and on "Sync vault with OpenTodo now". There is no background sync while Obsidian is closed or in the background on a phone, and the settings tab says so.
- **One syncing device per folder**, for `ot vault` and the plugin alike: the state file records which device syncs the folder, with a five-minute lease renewed on each sync. When the folder also travels between devices through Obsidian Sync, iCloud or git, only the owning device talks to OpenTodo; another device shows who owns it and offers "Take over syncing here" (`ot vault sync --take-over` on the command line), which starts a fresh, conflict-safe first sync. This closes a hazard `ot vault` has today: two machines syncing the same replicated folder push each other's edits back as their own.
- Encrypted accounts work as in `ot vault`, with the plugin's unlock from `obsidian-plugin`; enabling sync says once that the folder holds the account's content in plaintext.

Not **BREAKING**: no op field, route or environment variable; the state file gains two optional members that older `ot` versions ignore.

**Out of scope**: background sync on a phone (the platforms do not run plugins in the background); the live update stream inside Obsidian (Obsidian's request function cannot stream; polling every 30 s in front is the fallback the vault already specifies); TaskNotes in the plugin (a folder with TaskNotes linked keeps using `ot vault`); more than one synced folder per Obsidian vault; changes to the file format. ROADMAP.md item advanced: 0.20 "Everywhere", `obsidian-plugin` (third of its three changes).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `markdown-vault`: a vault folder can be synced by the Obsidian plugin as well as by `ot vault`, with the same rules; a folder has one syncing device at a time, for both.

## Impact

- **Data model, sync and op schema:** none. The plugin's vault pushes ordinary ops as device `vault:<id>` over `POST /api/v1/sync`, pulling with its cursor exactly as `ot vault` does; convergence is unchanged.
- **State file:** `.opentodo/state.json` gains `owner` (`{kind: "cli" | "obsidian", install, label}`) and `lease_until` (Unix ms), both optional. `internal/vault/state.go` reads and writes them; a state without them is owned by whoever syncs it next.
- **E2EE:** no new content field. The plugin decrypts and encrypts with the shared envelope module (`obsidian-plugin` D10); `internal/e2ee/crypt` and the TypeScript envelope are already pinned by the same vectors.
- **API, CLI, MCP:** `ot vault sync` and `watch` gain `--take-over` (in `ot schema` and `ot help --json`) and refuse a folder another device owns with a new error code `vault_owned`, exit 2. No server route changes.
- **CalDAV:** none.
- **Shared vectors:** `internal/vault/testdata/sync/` (base state, file contents and server ops in; pushed ops, written files and conflicts out), generated from the Go engine's tests and run by both engines.
- **Size:** the plugin's `main.js` budget rises from 250 KB to 400 KB minified for the engine (~100 KB); no server, binary or web bundle change.
