# Proposal

## Why

On a computer, quick add is reached with `q` or by clicking the line at the top of a list. Someone who does not know the key sees no "Add task" anywhere, and the line's fields (priority, project, labels) can only be typed as tokens (`p1`, `#`, `@`). The phone has a visible add button and a tool row; the web has neither (issue #1936).

## What Changes

- **Add task in the sidebar.** From 768 px, the Tasks space of the sidebar shows an "Add task" item above the primary destinations: the phone add button's accent plus mark, the row's quiet tone, the `q` key when shortcut hints are on, and the key in its tooltip. The icon rail shows the mark alone. It runs what `q` runs: in a list it focuses the list's own quick add, which already takes the view's context (the project, Today's date, Upcoming's tomorrow, the label, the location, Someday, Assigned to me), and elsewhere it opens the command bar in Add mode, which takes the same defaults. There is no second composer.
- **Field buttons in a list's quick add.** Beside the calendar button, three compact buttons (Priority, Project, Label) start the field's token at the end of the line, or select the words that set it, and open the line's own suggestions, exactly as the phone's tool row does. They write only the line, so the parse, the chips and the saved task are what typing gives. They show while recognition is on, from 640 px.
- **Priority's suggestions open from a button too.** Starting a priority from a field button or a field row opens the `p1`–`p4` list, as starting a project or a label already does.

## Capabilities

### Modified Capabilities

- `app-shell`: a new requirement, "Add task in the sidebar".
- `natural-language-capture`: a new requirement, "Field buttons in quick add in a list".

## Out of scope

- Configurable default fields or templates for a new task (mentioned in the issue's comments).
- A section as context: the sidebar's Add task adds where `q` adds (the list's top line); a section's own add line is unchanged.
- The phone: its add button and sheet are unchanged; the drawer does not repeat Add task.
- Calendar, Notes and the rituals keep their own `q`; the sidebar item does what `q` does on screens without a quick add (the command bar in Add mode).

No ROADMAP.md item; it answers issue #1936. No breaking change, no environment variable.

## Impact

- `web/src/app/Sidebar.tsx`, `web/src/app/Shell.tsx`, `web/src/app/palette/useCommandBar.ts` (one `quickAdd` action shared by `q` and the item), `web/src/app/QuickAdd.tsx`, `web/src/app/quickadd/LineTools.tsx`, tests, stories and their baselines, the quick add guide, a changelog fragment.
- No server, sync, op or API change.
