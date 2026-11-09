# Design

## Decisions

### D1. Skills are data

The four skills join `agenttools.Skills`, with instructions and tool subsets: `find-slot` uses `find_free_time`, `get_task` and `schedule_tasks`. Their display tools are listed in `skillDisplay`. MCP serves them as prompts like the others. No new route is needed.

### D2. Entry points

`openAssistantWith({ skill, selected, send: true })` already exists (Break this down uses it):
- the task's Actions menu and panel gain Rewrite this and Find a slot;
- the project header's overflow menu gains What's next?;
- Today's overflow menu gains Brief me.

## Data model, size, interface budget

- **Data:** none.
- **Size:** a few strings.
- **Interface budget:** all entries sit inside existing menus, with no new chrome row, sidebar entry or shortcut.

## Risks / Trade-offs

- **Menu clutter.** Entries show only while the assistant is available, grouped under an "Assistant" menu group.
