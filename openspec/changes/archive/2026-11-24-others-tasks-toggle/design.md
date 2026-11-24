# Design: others-tasks-toggle

## D1. The existing preference, one new value

`user_prefs.today_assignees` is already declared (today-assigned-filter) and has been kept unread since personal-views-assignee. `all` now means "show tasks assigned to others". Empty, `mine` (the old "hide") and anything else read as off, so the default stays the #1938 rule and no stored value changes meaning. `othersTasksShown` and `setOthersTasksShown` in `web/src/lib/userPrefs.ts` read and write it with one `mutate` op: local first, offline, last-writer-wins. The op schema is unchanged (a value, not a field); only the field's comment is updated and regenerated.

## D2. Lists only

`tasksForView` and `patchViewTasks` take `othersShown`. While it is true, Today, Upcoming (with Start with Today), Anytime and Someday skip `assignedToSomeoneElse`, and so do Today's subtask context rows. Assigned to me still matches the viewer. Everything else built from the views keeps passing the viewer's id: those surfaces count the work the viewer can act on, and leaving them alone keeps the change small. Today's limit fills its slots from Today's tasks without those assigned to someone else, so a shown task never takes a slot and is listed in its group.

## D3. The control

A checkable `MenuItem`, the pattern of Upcoming's Start with Today: the `eye` icon while unchecked, the menu's check while on. The state is visible in the menu and announced through `menuitemcheckbox`. It is offered in the four lists' menus while the membership cache holds a project with a member other than the viewer; a solo account never sees it, and its stored value is kept. No tooltip or helper text: the label and the check are the state.

## D4. Interface budget

One item in a menu that already exists; no row of chrome, task property, destination, scroll region or shortcut. No story shows a shared workspace's menu, so no UI baseline changes.

## D5. Size

No dependency: one function pair, one menu item and one catalogue string in every locale.
