---
title: Sequential projects and areas
summary: Make a project or a section offer one step at a time, or mark an ongoing list as an area that never finishes; what waits, what is available and where it shows.
audience: user
section: Guides
specs: [project-flow]
screens: []
order: 18
---
# Sequential projects and areas

<picture><source srcset="images/project-list-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/project-list-light.webp" alt="The Home renovation project with its tasks grouped under the sections Planning and In progress."></picture>

Every project has a flow that says how its tasks move. Choose it with **Flow…** in the project's menu, in the sidebar or at the top right of the project:

- **Parallel**, the default: every task can be done at any time.
- **Sequential**: one step at a time, in the list's order.
- **Area**: an ongoing list that never finishes, such as Home or Finances.

## Sequential projects

Only the first open step of a sequential project is available. The steps after it stay in their place, dimmed, with **After** and the name of the step they wait for. Complete the current step and the next one is ready at once, offline too. A waiting step can still be opened and completed.

The steps are the tasks without a section, in order, then each section. A section is one step: a **Parallel** section offers all its tasks together, and a **Sequential** section, or one that follows the project, offers them one at a time. Set a section's own **Flow…** in its heading or column menu. In a parallel project or an area, a **Sequential** section offers only its first open task and leaves the rest of the project alone.

What keeps a sequence where it is:

- A step that starts later, is blocked by another task or is assigned to someone else is still the current step, so the steps after it keep waiting.
- Recurring tasks, habits and tasks parked in **Someday** never hold a sequence and never wait.
- A subtask follows its task: a subtask of a waiting step waits too.

The order is always the list's own order, whatever sort you chose to look at it.

## Areas

An area shows no progress on the [All projects](all-projects.md) page, where its progress reads **Area**. It is never called **Quiet**, and it is never listed as without a next action in the weekly review, on the Loop home or in the weekly email. Its tasks work like a parallel project's, and its sub-projects keep their own flows. A top-level area is listed in the Monthly look's **Areas** step, with or without sub-projects.

## Where it shows

- **Today** puts a waiting step that is due into its folded **Blocked** group until it's its turn.
- **Next** lists only the current step of each sequential project, and **Waiting** lists no waiting step.
- The filter keyword `available` lists what you can do now: not blocked, not waiting, not parked and not starting later (see [Filters](filters.md)). `blocked` still means only tasks that wait for another task.
- Sidebar and Today counts keep counting every open task.

Under **Simple lists** in [How you work](settings-you.md#how-you-work), **Flow…** appears only on a project or section that already has a flow other than the default, so you can turn it back. The command palette offers **Set project flow…** in every mode. In a shared project the owner and admins choose the project's flow, and editors a section's.

Scripts and assistants can set `flow_mode` too: see the [API](api.md#project-fields), [MCP](mcp.md), the [command line](cli.md) and the [Markdown vault](vault.md).
