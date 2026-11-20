## Context

The Notes page builds one list from three kinds: task notes, project notes and standalone notes. The search field's tokens filter it, and `kind:<k>` tokens of the same key combine with OR. The chips, not the words, are remembered on the device. #1478 asks whether task descriptions belong there by default.

## Goals / Non-Goals

**Goals:** the page shows what the user wrote as notes. Task descriptions stay one chip away, and a device remembers that choice.

**Non-Goals:** changing what a task's description is; a setting; separating machine-written descriptions; renaming project notes.

## Decisions

### D1. An implicit kind filter, not a new setting

With no `kind:` chip, the page behaves as if the kinds were `note` and `project`. Any `kind:` chip replaces that default, so:
- `kind:task` shows task notes only;
- `kind:task kind:note` shows both kinds;
- `kind:note` reads as it does today.

This reuses the existing token and its memory on the device, and adds no control. A user who wants the old page picks the three kind chips once.

**Alternatives considered:**
- *Leave completed tasks' descriptions out but keep open ones.* This still floods the page: most clutter is open tasks from integrations.
- *A switch "Show task descriptions".* It is one more control for what the chip already does.

### D2. Words search the same notes

A word search looks among the notes the chips keep, as it does today. The default therefore skips descriptions. Finding a task by the text of its description is the job of the app's global search, which keeps doing it.

### D3. Counts and other parts

The header count, Show more, the empty page, the bulk actions and Templates follow the list D1 keeps. The Graph keeps every item as a node, as before: it draws links, and a task linked to a note belongs in that picture; its chips still pick the topic.

## Risks / Trade-offs

- **Someone who used Notes to browse descriptions sees them disappear.** The kind suggestions under the field offer `kind:task`, the changelog says so under Changed, and one chip brings them back on that device.
- **Size:** a few lines, no dependency.

## Interface budget

No new control, string or screen.
