# Phone control facts

## Why

The whole app has to be usable on a phone. A tooltip never opens on a tap on a control: a tap on a button must do the button's job and leave nothing behind (`design-system` "Tooltip primitive"). The change `tooltip-tap` lets a tap open the tooltip of something that is not a control (a word, a time, a badge). That leaves the places where a fact a person may need sits only in the tooltip of a control, or of something inside one. On a phone that fact cannot be read at all.

A survey of every tooltip on a button, a link or a menu trigger, and of every badge with an explanation, suspected ten places, and this change's own search added more. Read against what each control opens, most already show the fact after the tap. Six do not.

## What Changes

- **A duplicate label.** The row's menu says "Another label has this name. Merge them from the menu or the banner on the labels page." under **Merge into**, the action it is about. The badge keeps its tooltip.
- **An event that can be deleted but not changed.** Its details say why it cannot be changed ("This calendar is read-only"), above **Delete**. Before, only the block's tooltip did.
- **A capped repeating task.** "Showing the next 31 occurrences" is the heading of the occurrence's menu (a long press on a phone), and a part of the occurrence's accessible name.
- **Skip and This occurrence only.** On a touch screen, one line under the two buttons says what each does. With a mouse the tooltips stay and the lines are not drawn.
- **An origin that is not a link.** The sheet its chip opens (Copy link) is titled with the page's title, which was only the chip's tooltip.
- **Reactions.** A reaction in a comment's **More actions** menu (and in Add reaction) names who chose it. Before, only the reaction's tooltip and accessible name did.
- **One rule in `design-system`:** a fact is never only in a control's tooltip.

No tooltip is removed and no string is added. With a mouse the three menus show the same line too; nothing else changes there. No op field, route, setting, shortcut or dependency. Not **BREAKING**.

## Out of scope

- A tap that opens the tooltip of a non-control: the change `tooltip-tap`.
- Tooltips that repeat a control's visible or accessible name, or name its keyboard shortcut.
- The places where the tap already shows the fact (design, "No change").
- The sync dot's "Last synced" time: Settings › Data shows it, and a failing sync already shows its text.
- A row's time-column marks ("In the slot Deep work", the part of the day): they are not controls of their own.

ROADMAP.md: none (part of making every screen usable on a phone).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: a new requirement, "A fact is never only in a control's tooltip". One requirement instead of a delta in `labels`, `calendar-event-edits`, `recurring-tasks`, `comments` and `task-management`: every fix moves words the app already shows with a mouse to a place a tap reaches, and no capability's behaviour (what is stored, what an action does) changes. The rule is about the tooltip primitive, which `design-system` owns.

## Impact

- Web:
  - `web/src/app/LabelsView.tsx`: `labelMenuGroups` takes `duplicate`.
  - `web/src/app/calendar/EventEditor.tsx`: the reason above Delete.
  - `web/src/app/calendar/occurrenceMenu.tsx`, `projections.tsx`, `PlanRow.tsx`: the capped note.
  - `web/src/app/RecurrenceField.tsx`: the two lines.
  - `web/src/app/OriginChip.tsx`: the menu's title.
  - `web/src/app/task-detail/ReactionBar.tsx`, `CommentsTab.tsx`: who chose a reaction.
- Docs: `docs/interface-guide.md`; `changelog.d/Fixed/phone-control-facts.md`.
- Size: a few hundred bytes, within the first-load budget.
