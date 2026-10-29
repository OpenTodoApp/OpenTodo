# Proposal

## Why

OpenTodo's four priorities are called "Priority 1" to "Priority 4" everywhere: the task's facts, the quick-add chip, the priority picker, list groups and filter chips. People think about importance in their own words ("Must", "Should", "Could", "Won't"; "Today", "This week", "Soon", "Whenever"; "Fire", "Important", "Normal", "Low"). The research (§1 TickTick, "Rename priority flags"; gap analysis "Rename priority flags: Missing, S, prefs field") lists renaming as a small, often requested comfort that TickTick and Things users expect when they switch. The numbers stay useful as a fast, language-independent token (`p1`), so the change is only about how the levels are named.

## What Changes

- **Your own names for the four levels.** Settings → General gains a **Priorities** card with four text fields, each showing the level's colour, and a Reset action. An empty field means the default ("Priority 1" … "Priority 4", translated).
- **Names shown wherever a priority is shown to a person:** the task's facts, the priority picker and the row menu's Priority submenu, quick-add and title-editing chips, list group headings when grouped by priority, board columns grouped by priority, filter builder chips ("Priority is Must"), bulk actions, the command palette, and the assistant's proposed change sets.
- **The numbers keep working.** `p1`–`p4` in quick add and in filter queries, saved views, the API, the CLI, MCP, CalDAV and the vault are unchanged. The stored value is still the number. Typing `p` in quick add suggests the four levels with their names.
- **Personal, synced, offline.** The names are four new fields of the user's preference row: they reach every device of the person, apply offline at once, converge by last-writer-wins per level, are never seen by the members of a shared project (each member sees their own names), and are part of the export.
- **Encrypted.** The names are user-written text: for an account with end-to-end encryption they are encrypted like label names.

Not **BREAKING**: four additive op fields, no environment variable.

## Out of scope

- More or fewer than four levels, or changing their order or colours (colours stay p1–p4 tokens; `accent-colour` does not touch them).
- Typing a name in quick add (`!Must`) or in a filter (`priority: Must`): saved queries would break on rename. The numeric tokens stay the only syntax.
- Names per project or per workspace, and names shared with project members.
- Showing the names in server-written text (emails, the digest, notification channels), in the `ot` CLI, in MCP tools or in CalDAV: those keep "priority 1" or the number, because the server cannot read names of an encrypted account and the numbers are the stable contract.

## Roadmap

Advances ROADMAP-1.0 milestone 0.21 "Horizons and home", item `priority-names`, and the research's §1 TickTick row "Rename priority flags".

## Capabilities

### New Capabilities

- `priority-names`: the four names, where they are set, where they are shown, how they sync and what keeps using numbers.

### Modified Capabilities

- `end-to-end-encryption`: the priority names join the encrypted fields (added requirement; the existing field list is unchanged).

## Impact

- **Data model and op schema:** `user_prefs` gains `priority_name_1`, `priority_name_2`, `priority_name_3`, `priority_name_4` (string, default `""`, marked content). Additive in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`.
- **Sync:** ordinary LWW fields of the personal "me" row. Older clients ignore them and keep showing "Priority 1".
- **E2EE:** the four fields are content fields (`internal/e2ee.ContentFields` is generated from the schema's Content flag, so `CONTENT_FIELDS` follows); the server never reads them.
- **API, CLI, MCP, CalDAV, vault:** no change; priorities stay numbers.
- **Bundle and binary size:** a few hundred bytes in the Settings chunk and a small `priorityName()` helper in the shared bundle; no dependency.
