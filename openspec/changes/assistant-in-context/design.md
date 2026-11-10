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

## Implementation notes

- **Skills.** `rewrite-task` (get_task, update_tasks), `find-slot` (get_task, find_free_time, schedule_tasks; display show_free_time), `project-next` (the read tools; show_board, show_timeline, show_tasks; an answer) and `brief-today` (today_summary, list_tasks, get_task, find_free_time; show_calendar, show_deadlines, show_stats; an answer) join `agenttools.Skills`, and with them the manifest, the skills route and the MCP prompts. Every turn also offers the follow-ups.
- **The working day for find-slot.** Like plan-week, the turn's working day goes into the instructions: `agenttools.SlotDayNote` ("Working day: from 08:00 to 17:00. Pass day_start_hour 8 and day_end_hour 17 to find_free_time."), on the device too (pinned by `prompt.vectors.json`), and the MCP prompt takes `startHour` and `endHour`. The server also fills find_free_time's hours from the working day when the model names none.
- **Subjects.** Rewrite this and Find a slot select the task (`selected`); What's next? names the project in its text ("What's next in “Garden”?"), since a turn's selection holds task ids only; Brief me sends "Brief me" from Today. Each sends at once. Break this down keeps its entry, now in the same group.
- **Entries.** An "Assistant" group in the task's actions menu (the panel and the task page share it; Find a slot only for an open task), in the project menu and in Today's menu, shown only while the assistant is available.
- **Bundle.** The task and project items load with their panels; Today's menu is drawn by the list header in the entry chunk, so Brief me costs 99 bytes there. The entry budget rises from 143 to 143.1 KB (measured 143.06 KB against main's 142.97 KB); the first load stays at 683.4 KB.
- **Eval.** Scenarios `find-slot` and `brief-today`; a scenario may name `skill` and `selected` (seed task keys).
