# Design

## Context

A task's `priority` is a number from 1 (highest) to 4 (default, lowest). The client renders it through the message `Priority {n}` in about a dozen places, and colours it with the `p1`–`p4` tokens. Personal preferences live in the `user_prefs` entity (entity id `me`, the author's personal scope), whose fields are strings read as their default when empty or unknown. Content fields are marked in `sync.Schema`; `internal/e2ee.ContentFields` and the web `CONTENT_FIELDS` are generated from that flag.

## Decisions

**D1. Four fields, not one list.** `user_prefs.priority_name_1` … `priority_name_4`, each a string, default `""`, `Content: true`. Alternative: one JSON string `priority_names`. Rejected: renaming level 1 on the phone and level 3 on the laptop while offline would make one device's whole list win; four fields converge per level with no lost edit.

**D2. Values and validation on the client.** A name is trimmed, single-line, at most 24 characters (it must fit a chip and a menu row at 360 px). An empty value means the default, `t('Priority {n}')`, so a person who never opens the card sees exactly today's text in their language, and Reset writes `""`. Two levels may share a name; the colour dot always accompanies the name, so they stay distinguishable. The server keeps the kind check only, like the other preferences, because for an encrypted account it sees ciphertext. A client that reads a value longer than 24 characters shows it truncated with an ellipsis and keeps it.

**D3. One helper, used everywhere a level is shown.** `priorityName(n)` in `web/src/lib/priority.ts` reads the live preference (the same reactive pattern as the date format) and returns the custom name or the translated default. Every current use of `t('Priority {n}', …)` and every "P1" label is replaced by it: task facts, priority picker and the row menu's Priority submenu, quick-add and title-editing chips, list groups and board columns grouped by priority, filter builder chips, bulk actions, command palette commands ("Set priority: Must"), the assistant's change-set review, and the shortcut overlay's description of the priority keys. Screen reader names use the same text followed by the level ("Must, priority 1") so the numeric meaning is never lost. A `ui-lint` rule flags new uses of the raw `Priority {n}` message outside the helper.

**D4. The numbers stay the syntax and the contract.** Quick-add `p1`–`p4`, filter `p1`–`p4`, saved views, the REST API, the `ot` CLI, MCP tools, CalDAV `PRIORITY`, the vault's priority emoji, importers and automation rules keep using numbers. Alternative: accept the name as a token. Rejected: a renamed level would silently break saved filters and rules, and names can contain spaces and other languages' words that collide with quick-add vocabulary. Typing `p` in quick add lists the four levels as suggestions ("p1 · Must"), so the names help people learn the tokens.

**D5. Personal even in shared projects.** The names are in the author's personal scope, so in a shared project each member sees their own names for the same stored number. Activity entries ("Ana changed the priority to 1") render with the reader's names, because they are rendered on the reader's device. Nothing about the names reaches another account.

**D6. Server-written text keeps numbers.** Emails, the digest, notification channels, the CLI and MCP say "priority 1". For a plaintext account the server could read the names, but showing them only sometimes would make agent and CLI output depend on the encryption mode. A later change can add names to the agent tools for plaintext accounts.

**D7. Encryption.** The four fields are content. Turning encryption on encrypts them in the existing re-write job, and the history purge covers superseded values, because both walk the generated content field list. A locked device shows the default names until it is unlocked, the same degradation as label names.

## Progressive disclosure and interface budget

The card sits in Settings → General after Focus timer, screen id `settings/priorities`, findable by Settings search ("priority", "rename"). Nothing changes on any list or screen for someone who never renames: the default names equal today's text. No chrome is added above lists, no task property is added (the priority property is the same, only its label changes), no sidebar destination, no shortcut. On a phone the four fields stack, each with its colour dot, inputs at least 44 px tall.

## Data model

| Entity | Field | Kind | Default | Content |
|---|---|---|---|---|
| `user_prefs` | `priority_name_1` | string | `""` | yes |
| `user_prefs` | `priority_name_2` | string | `""` | yes |
| `user_prefs` | `priority_name_3` | string | `""` | yes |
| `user_prefs` | `priority_name_4` | string | `""` | yes |

Additive; no field renamed. Exported with the other preferences; imported back from OpenTodo's own export. No migration: the preference row is materialized generically.

## Size

No dependency. The Settings card adds well under 1 KB gzip to the lazy Settings chunk; the helper adds about 200 bytes to the main bundle. No server memory change.
