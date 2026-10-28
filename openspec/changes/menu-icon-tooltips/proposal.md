## Why

Issue 528: hovering the Filter button of a list and the More actions button of a page header shows no name, while the icon buttons beside them do. Both open a menu, and the menu trigger only got a tooltip when a screen asked for one, so about two dozen icon-only menu buttons (row and settings "Actions for …", Task actions, Attach, Add reaction, More formatting) were unnamed to a pointer user.

## What Changes

- A menu whose trigger is only an icon shows its accessible name as a tooltip by default, like an icon button. A trigger with visible text gets none, and an explicit tip still wins.

## Out of scope

- New wording for any label; the tooltip shows the name the button already has.

## Capabilities

### Modified Capabilities
- `design-system`: Tooltip primitive covers icon-only menu triggers.

## Impact

- `web/src/ui/overlay/Menu.tsx`, `web/src/ui/tooltip.test.tsx`. No data, API or bundle size change.
