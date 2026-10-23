# Design

## Context

inbox-means-unplaced D4 put "N planned tasks without a project" in the Inbox header's meta, opening Filter with `no project`. phone-v2 moved it into the bar's subtitle on a phone, and a third copy sits in the action row below 768 px. The tasks it counts are open, live, without a project and scheduled (`isPlannedWithoutProject` in `web/src/lib/inbox.ts`): a due date, a start date or Someday.

The list model already has a group that starts folded and remembers being opened on the device: Today's Blocked group (`folded`, the per-device collapse set, `BLOCKED_OPEN_KEY`).

## Goals / Non-Goals

Goals:
- The tasks the line counted are visible in the Inbox without leaving it, and without competing with the Inbox's own tasks.
- Inbox zero still means "nothing needs a decision".
- No new chrome above the first row (interface budget).

Non-goals:
- Changing which tasks are in the Inbox.
- A new filter or a new view.

## Decisions

### D1. A folded group at the end of the list

The Inbox's groups become: its own tasks (as today, a tree in the Inbox's order), then "Planned, no project (n)", folded by default. The group is a `ListGroup` with `key: 'planned'`, `folded`, and its own open key `inbox:planned:open` in the per-device collapse set, the same mechanism as Today's Blocked group. `ListGroup` gains `openKey`, so the header toggles the right key; Blocked keeps `today:blocked:open`.

Rows are flat (each planned task once, with its parent named as a breadcrumb when it has one), ordered by when they are planned: the do-on date, else the start date, with Someday last, then by creation. They are ordinary rows: open, complete, the action cluster, keyboard navigation and dragging onto a project in the sidebar all work as anywhere else.

Alternatives considered:
- Keep the line and restyle it: still a link to another screen, which was the complaint.
- A group open by default: it would push the Inbox's real work below planned tasks, against the Inbox's meaning.
- Show the tasks inline mixed with Inbox tasks: breaks Inbox zero and the membership rule.

### D2. The group is not the Inbox

The empty state, Inbox zero, the Process the Inbox button and its count, and the "n tasks" figures read only the Inbox's own rows. When only planned tasks remain, the Inbox shows its empty state with the folded group below it. The sidebar's Inbox count is unchanged (it never counted these tasks).

### D3. Open as filter

The group header has one action, "Open as filter", which opens Filter with `no project`, as the line did. The action is always visible (like Earlier's actions), so it is reachable on touch and by keyboard.

### D4. The line goes everywhere

The header meta, the phone bar's subtitle and the action-row copy below 768 px are removed. On a phone the group is part of the list, so the bar keeps one action slot and no subtitle in the Inbox. `usePlannedWithoutProject` and `PlannedWithoutProject` are removed.

## Interface budget

Nothing is added above the first row; a row of chrome is removed on phones (the subtitle). Rows show the same properties as elsewhere. The group adds no scroll region and no shortcut.

## Data model

None: the group is derived from synced task fields, so it converges like every list. Offline it shows what the device has.

## Owner questions

1. The owner's note was cut off: "Also because we don't force users to put…" (presumably a project on every task). This change keeps tasks free to have no project and makes the planned ones easy to see in the Inbox. If the intent was to nudge people to give these tasks a project, a "Move to a project…" action on the group header is a small follow-up.
2. Folded by default: is that right, or should it open when it holds only a few tasks?

## Risks / Trade-offs

- A user who relied on the line's count at a glance now sees it on the folded group's header at the end of the list, not under the title. The count stays visible without opening the group.
- Dragging a planned row to reorder inside the Inbox has no meaning (it is not an Inbox task). Reordering is not offered across groups; dropping it on a project in the sidebar moves it as usual.
