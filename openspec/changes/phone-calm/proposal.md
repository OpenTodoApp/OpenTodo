## Why

The phone screens now look like an app, and the next step is not more of it: the owner asked for improvements that do not risk an overloaded screen. Each item here takes something away or shortens what is there. The task page shows a grid of empty tiles, Today says the late count three times, and the bars carry controls that a phone rarely needs.

## What Changes

- The task page: the facts a task does not have become a row of small chips, with Attach among them instead of a lone paperclip; the bar keeps Back and the menu, with Next and Previous task (and the place in the list) in the menu.
- Today on a phone: the display options join the header's menu; the briefing leaves out what the Late card says; Earlier's two actions become one Reschedule control; the Done today card opens its group; a task due yesterday says Yesterday.
- The tab bar: no count on the current tab, and the content fades out behind the bar.
- Today's header: a zero tracked or planned total is left out ("3h planned", not "3h planned · 0m tracked").

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `phone-ui`: the chips, the task page's bar, a calm Today.
- `app-shell`: "Phone navigation", the current tab's count and the fade under the bar; the task page's bar.
- `time-tracking`: "Tracked time on rows and in Today", a zero total is left out.

## Impact

Web only: `web/src/phone/`, `app/TabBar.tsx`, `app/task-list/EarlierActions.tsx`, `ListChrome.tsx`, `views/DisplayPanel.tsx`, `task-detail/TaskActionsMenu.tsx`, `AttachmentsRow.tsx`, `lib/time.ts`. No op, no server change, no setting, no store release. Out of scope: the desktop, and new modes or controls.
