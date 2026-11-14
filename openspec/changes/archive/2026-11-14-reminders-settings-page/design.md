# Design

## D1: A kind switch without an old default counts as getting a due

The default reminder rule had two cases: a write that gives a dateless task a due (add the default, D3 of `default-reminders`) and a write that switches the kind of due (move an untouched default to the other kind's offset, D5). A due set in two steps (day, then time) falls between them when the first kind has no default: nothing is added in step one, and step two finds no default reminder to move.

The rule now treats step two as D3 when the kind changes, the old kind has no default and the task has no default reminder (`own` absent, so never created and never deleted). All D3 guards apply. If the old kind has a default but the task has no default reminder, nothing is added: the task got its date when no default applied (set later, imported, written by another client), and changing a preference never touches existing tasks.

Alternative considered: write the date and the time in one batch in the editor. It fixes only this editor, while the time can also be added later, in another screen, from the CLI or an agent; the rule fix covers every writer at once.

## D2: Reminders as the first Notifications page

A page of its own, not a section above push, so the Push notifications page holds only what is about this device's push. It reuses the existing Default reminders section, its anchor and help (`settings/default-reminders`); the settings search points to the new page. No redirect is needed: an old `/settings/notifications/push` link still opens a valid page.
