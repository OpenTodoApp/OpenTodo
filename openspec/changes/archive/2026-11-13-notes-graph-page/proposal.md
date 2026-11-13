# Proposal

## Why

The Connections dialog (`notes-graph`) answers "what is connected to this one item?". Once a workspace has a few hundred linked notes, people also want the opposite view: the whole picture, to see which notes cluster around a project, which ones nothing links to, and to walk from one to the next without opening a dialog each time. The owner asked for it on 2026-11-10: "It must be easy to switch to graph mode, where the graph isn't modal, it takes the whole page (except the layout like sidebar, footer, etc) and is a cool tool to navigate the notes with connections, zoom, topic, etc." Notes can have a project and labels like tasks (owner, the same day), so a topic is a project or a label.

## What Changes

- **List | Graph** in the Notes header, and a **Graph** row in the sidebar's Notes space: the Notes page gets a second mode, the graph of every note of the workspace, at `/notes?view=graph`. The mode is in the address (linkable, survives Back and reload) and the last one shown is remembered on the device, so Notes opens where the person left it. `v` switches on the page.
- **The graph page** fills the page's content area (the sidebar and the shell stay; no dialog): standalone notes, project notes and task notes (the notes the list shows) as nodes, the tasks and projects that are link targets without a note as small secondary nodes (shown by default, hidden from the header menu), and one line per linked pair from the device's link index.
- **Navigate:** pan (drag, two fingers), zoom (wheel, pinch, + and −, keyboard), fit to view; hover or focus lights a node's neighbours and dims the rest; a click opens the note in the docked side pane so the graph stays visible (Escape closes it); a double click or Space centres on a node, with a depth of 1, 2 or 3 around it; Backspace returns to the previous centre. The search field becomes **Find a note**: matches stay lit, Enter flies to the next one.
- **Topic:** the search field's chips (`in:`, `label:`, `kind:`… from `notes-space`) set the topic in the graph: everything outside it is dimmed, nothing moves. Nodes are coloured by project (the palette's hues from tokens) and shaped by kind, so colour is never the only signal. The header menu shows or hides notes without links.
- **Stays put:** a deterministic force layout of our own (Barnes–Hut, a fixed seed, a fixed number of steps), positions kept on the device, and a new note placed among its neighbours with every other node fixed: the picture changes locally, not globally.
- **Scale:** canvas rendering (no DOM node per graph node), level-of-detail labels, the layout in short slices; smooth at the notes fixture and at about 2,000 notes and 5,000 links. Two new performance budgets, `notes-graph` (open the graph to its first paint) and `notes-graph-frame` (a pan or zoom frame).
- **Connections** keeps answering for one item and gains **Open in graph**, which opens the graph centred on it.
- No new op field, route on the server, dependency or environment variable. Not **BREAKING**.

Out of scope: tags as a new field (projects and labels are the topics; decided), editing links in the graph (drawing or deleting a line), dragging nodes to pin them, a graph across workspaces, a graph in the CLI or MCP, clustering or other graph analytics, edges for structure (task in project, subtask, dependency).

Roadmap: the Notes area of `ROADMAP.md` (a new row, after `notes-graph`). Lands beside `notes-space` (the Tasks | Notes space switch, the compact list and search tokens); the two touch the Notes header in different places.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `notes-graph`: adds the graph page (what it shows, navigating, topics, a picture that stays put, scale, keyboard and screen reader, phones, data and loading) and Open in graph from Connections.
- `notes-page`: adds the List | Graph mode of the page and its address.

## Impact

- Web: `web/src/lib/forceLayout.ts` (the layout, pure) and `web/src/lib/notesGraph.ts` (the model, the positions kept on the device, keyboard steps), a lazy chunk `web/src/app/notes-graph/` (the page and its canvas), the mode switch in `web/src/app/notes/NotesPage.tsx`, the mode in `web/src/app/router.ts`, `LinkIndex.forEachLink` in `web/src/lib/noteLinks.ts`, Open in graph in `web/src/app/connections/`, one shortcut `notes.view-mode`, strings in every catalogue, stories.
- Size: the graph's chunk is lazy; the first-load entry chunk grows only by the mode in the router (tens of bytes).
- Perf: two rows in `scripts/perf/budgets.json` and `docs/performance.md`, measured by `scripts/perf/run.mjs` in the notes session, and a scale test at 2,000 notes and 5,000 links.
- Docs: `docs/note-connections.md` (the graph page), `docs/notes.md`, `docs/performance.md`; `changelog.d/Added/notes-graph-page.md`; `ROADMAP.md`.
