# Proposal

## Why

Once notes, tasks and projects link to each other (`note-links`), Linked references answer "what points here?", one step deep. A small picture answers the next question, "what is connected to this?": the item, what it links to and what links to it, and one step further, so a cluster of related notes and tasks can be seen and walked through. It must stay a tool for one question, not a wall of dots.

## What Changes

- **Connections**: from a note, a task or a project (its menu, the Graph button of its Linked references, or the palette's "Show connections"), a dialog shows a local graph centred on the item: its direct links in both directions on an inner ring, their links on an outer ring, at most two steps, with a cap and a "+n" marker when there are more.
- Clicking or tapping a node centres the graph on it; clicking the centre, or Enter on a focused node, opens the item. Arrow keys move between nodes; a **List** view shows the same items as two lists (Links, Linked from), the non-visual equivalent.
- A small, deterministic radial layout drawn in SVG, written in the app (no physics, no library): the same item always draws the same picture, and nothing moves on its own.
- Loaded lazily on first use, never in the first load; computed from the device's link index and local data, so it works offline and on encrypted accounts and sends nothing to the server.
- No whole-account graph in this change (recommended out; see the open questions). No new op field, route, dependency or shortcut. Not **BREAKING**.

Out of scope: a whole-account graph; pan and zoom; filters inside the graph (by label, kind or project); edges for structure (task in project, subtask, dependency); a graph in the CLI or MCP.

Roadmap: the third step of "Notes area" in ROADMAP.md. Needs `note-links`; independent of `notes-home`.

## Capabilities

### New Capabilities

- `notes-graph`: the Connections dialog: what it shows around an item, its layout, its interaction by pointer, touch and keyboard, its list equivalent, and its loading and data rules.

### Modified Capabilities

None. (The Graph button sits in the Linked references heading that `note-links` defines; this change adds it as part of `notes-graph`.)

## Impact

- Web: a new lazy chunk `web/src/app/connections/` (dialog, SVG renderer) and `web/src/lib/graphLayout.ts` (pure layout, unit-tested), entry points in the note, task and project menus, the Linked references heading and the palette; the six language catalogues; a story with visual baselines in light, dark, 375 and 1280 px.
- Size: about 4 KB gzip in its own chunk; first load unchanged (`web/bundle-budget.json`).
- Docs: `docs/notes.md` (a Connections section).
