# Design

## Context

inbox-planned-group added a folded group at the end of the Inbox for open, scheduled tasks without a project, with a device-local open state (the key `inbox:planned:open` in the per-device collapse set `opentodo.collapsed`), and inbox-zero-quiet showed the Inbox zero empty state as one line while the group was below it. The owner now wants the Inbox to show only the Inbox.

## Decisions

### D1. Remove the group, not hide it

The group, its derivation (`isPlannedWithoutProject`, `plannedOrder`), its header action and the compact empty state are deleted rather than put behind an option. Today, Upcoming and Filter `no project` already list these tasks; a second way in from the Inbox is what confused the owner.

### D2. The stale "group open" key is left alone

Devices that opened the group hold `inbox:planned:open` in the per-device collapse set. Nothing reads it any more. It is one short string in a set of group keys that already tolerates keys of groups that no longer exist (a deleted section, a project gone), so no migration removes it: a cleanup would add code for no visible effect. The key name is not reused.

## Data model

None. No op field, no server change; the per-device store keeps an unread key (D2).

## Interface budget

The change removes a group from the Inbox list: chrome above the first item, task properties, sidebar destinations, scroll regions and shortcuts are unchanged. Bundle size goes down slightly.

## Risks

- A user who relied on the group to see dated tasks without a project loses that view in the Inbox. Mitigation: Upcoming and Filter `no project` list them, and the docs say so.
