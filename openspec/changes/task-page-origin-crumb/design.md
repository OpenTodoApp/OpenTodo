# Design

## D1. The first crumb is the way back

The trail (`taskTrail.ts`) already records the address and name of the list a task was opened from, and `leaveTaskPage` already returns there with the task selected and the scroll restored (Esc, Close, the phone's Back). The origin crumb calls the same `onBack`, so all four ways back behave alike. Its label is the trail's label, the name the page gives itself.

## D2. No duplicate when the origin is the project

When the trail's address parses to the task's own project, an origin crumb "Home" followed by a project crumb "Home" would repeat itself. The project crumb then takes the origin's role (`onBack`, keeping the selection and scroll), and no origin crumb is drawn. From any other list the project crumb keeps navigating to the project page, as before.

## D3. Without a trail

A task opened from a link or after a reload has no trail; `onBack` falls back to the task's own list. A task in a project shows its project crumb (unchanged); a task without one shows **Inbox**, now a button calling `onBack`, which opens the Inbox with the task selected. A trail without a label (opened from the palette or a notification with an origin but no name) shows no origin crumb.
