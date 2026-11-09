# Design

## Context

- `note-links` gives the device an index of internal links (source → targets and target → sources) over task notes, project notes and standalone notes, built from the decrypted projections, incremental, under 1 MB, and the Linked references section with its rows.
- Overlays follow the app's dialog behaviour (full-screen sheet below 640 px, Escape closes, focus returns). Motion and colour come from the tokens in `web/src/index.css`; icons from `<Icon>`.
- The first load has a gzip budget (`web/bundle-budget.json`); lazy chunks do not count against it. Accessibility target: WCAG 2.2 AA on every screen (`accessibility`).

## Goals / Non-Goals

**Goals:** answer "what is connected to this?" for one item in one glance; readable at phone width; fully usable by keyboard and screen reader; a picture that is the same every time.

**Non-Goals:** a map of the whole account; graph analytics (clusters, centrality); editing links from the graph; pan, zoom, drag.

## Decisions

**D1. A local graph, centred on one item, two steps deep.**
- **Nodes:** the centre (a note, task or project); ring 1, every item it links to or that links to it; ring 2, the items ring-1 nodes link with that are not already shown. Only items the device can read; unreachable targets (D4 of `note-links`) are left out.
- **Edges:** one line per linked pair, whichever direction (and between ring nodes when they link each other); direction is in the List view, not drawn, which keeps the picture quiet.
- **Caps:** ring 1 at most 24 nodes, ring 2 at most 48. Over a cap, the most recently changed are drawn and a "+n" marker sits at the ring; centring on a parent shows its own neighbours. The centre always fits.
- **Structure is not drawn:** a task's project, subtasks and dependencies are not edges. Alternative: draw them too. Rejected: every task would connect to its project, and a 2,000-task project would swamp the one relation the user made on purpose.

**D2. Layout: own, radial, deterministic. No library.** Ring 1 nodes are evenly spaced on a circle, ordered by kind (notes, tasks, projects) then title, starting at the top; ring 2 nodes sit on an outer circle inside the angular sector of the first ring-1 node that reaches them, sectors sized by child count. Labels are placed outside each node along its radius, truncated to 24 characters, with the full title in the accessible name and on focus or hover. Below 640 px ring-2 labels are hidden until a node is focused. Same input, same picture: positions depend only on the nodes, their order and the size of the box. About 150 lines of TypeScript plus the SVG renderer, about 4 KB gzip.

| Option | Licence | Size (gzip, approximate) | Notes |
|---|---|---|---|
| Own radial layout in SVG | AGPL (ours) | ~4 KB | deterministic, no animation loop, accessible SVG elements; enough for two rings |
| `d3-force` 3 (+ `d3-quadtree`, `d3-dispatch`, `d3-timer`) | ISC | ~9 KB | the standard force simulation; nondeterministic unless seeded, moves while it settles; the fallback if a whole-graph view is wanted |
| `cytoscape` 3 | MIT | ~110 KB | full graph library; far over what one dialog needs |
| `sigma` 3 + `graphology` | MIT | ~50 KB | WebGL, built for thousands of nodes; canvas text is not accessible without a parallel DOM |
| `force-graph` / `vis-network` | MIT / Apache-2.0 or MIT | ~60–150 KB | canvas, animation loops, the same accessibility gap |

Sizes are estimates from the packages' minified builds and would be measured before any adoption. A two-ring picture does not need a simulation, and a simulation's motion fights the "nothing moves on its own" rule.

**D3. Where it opens.** A dialog named after the centre ("Connections"), from: the menu of a note, a task and a project ("Show connections", offered when the item has at least one link in either direction); a Graph button in the Linked references heading; the palette command "Show connections" while such an item is open. On a computer a card about 40 rem wide and 28 rem tall; below 640 px a full-screen sheet. The dialog's header holds the centre's title, the Graph / List switch and Close; no other chrome. Alternatives: a Graph page (`/notes/graph`) — a destination for a picture whose subject is always one item; a graph drawn inline under every note — weight on every note for an occasional question. Both rejected.

**D4. Interaction.**
- **Pointer and touch:** a click or tap on a node centres the graph on it (the history of centres is kept for Back while the dialog is open); a click on the centre opens the item and closes the dialog. Hover or focus highlights the node's edges.
- **Keyboard:** focus starts on the centre; Arrow keys move between nodes (Left and Right around a ring, Up toward the centre, Down outward); Enter opens the focused node; Space centres on it; Backspace returns to the previous centre; Escape closes. All keys are local to the dialog and listed in its help, none registered globally.
- **Motion:** recentring moves nodes with the motion token's short transition; with reduced motion they jump. Nothing animates at rest.

**D5. The non-visual equivalent.** The List view shows two lists, **Links** (what the centre links to) and **Linked from** (what links to it), with the same rows as Linked references, and the same "centre on" and "open" actions. Screen readers: the SVG is a group named "Connections of <title>"; each node is a focusable element with its title, kind and ring ("Trip, note, linked directly"); the switch to List is the first control after the title. The List view is remembered per device, so someone who prefers it always gets it.

**D6. Data and loading.** The dialog's chunk is imported on first open and never by the first load; a test checks that the entry and its static imports do not include it. It reads the `note-links` index (building it in slices if needed) and local tables only, works offline and on an unlocked encrypted account, and makes no request. Updates arriving by sync while the dialog is open redraw it once. Budget: opening the dialog for a note of the notes fixture, index built, to the graph painted, within 200 ms desktop and 600 ms in the phone profile (measured, not a new nightly metric; added to `note-references`' run as a sub-step if it is close).

**D7. Whole-account graph: not in v1.** A whole-graph view earns its place only when people navigate by it; for a task manager the common question is local. At the notes fixture it would be 2,500+ nodes, needing a force layout (D2's fallback), pan and zoom, and a real non-visual equivalent; that is a second change if asked for (open question 1).

## Data model impact

None. Reads only the `note-links` index and local tables.

## Size and memory

No dependency. One lazy chunk of about 4 KB gzip; first load unchanged. Memory: at most 73 nodes and their edges while the dialog is open.

## Interface budget

- **Chrome rows:** the dialog has one header row; no page gains chrome. The Graph button sits in the Linked references heading, inside content.
- **Task properties:** unchanged.
- **Sidebar destinations:** none added.
- **Scroll regions:** the dialog does not scroll in Graph view (the layout fits the box); the List view scrolls inside the dialog as overlays do. No page gains a scroller.
- **Shortcuts:** none registered globally; the dialog's keys are local and listed in its help.

## Risks / Trade-offs

- [A hub note with hundreds of links] → caps and "+n"; the List view shows them all.
- [Labels collide on small screens] → ring-2 labels hidden below 640 px until focus; truncation to 24 characters.
- [A radial picture hides clusters a force layout would show] → accepted for the local question; D7 keeps the force layout as the path for a whole graph.

## Migration Plan

Additive, client-only. Rollback removes the dialog; nothing is stored.

## Open questions for the owner

1. **Whole-account graph.** Recommendation: not in v1. Ship the local graph, see whether people centre and walk through it, and only then consider a whole-graph view (with `d3-force`, lazily) as its own change.
2. **Depth.** Recommendation: two steps, fixed, no control. One step is what Linked references already show; three steps on a well-linked account is most of the account.
3. **Structural edges as an option.** Recommendation: no. Links are what the user made; a task's project and subtasks are already visible where the task lives.
