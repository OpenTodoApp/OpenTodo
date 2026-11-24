# Design: calendars-per-workspace

## D1. One additive field, a hide-list

`user_prefs.calendars_hidden` (`internal/sync/ops.go`, kind string, default `""`) holds `{"<workspace id>": ["<calendar id>", …]}` as JSON, the way `app_link_schemes` holds its list. Calendar ids are the subscription ids the events route serves, which include calendar sync calendars (`managed`). A hide-list keeps the default "everything shown": a calendar or a workspace added later needs no write. It is not content (ids, never user text), so it stays readable with end-to-end encryption; the server stores it like any pref and reads nothing from it.

Reading: `readCalendarsHidden` in `web/src/lib/calendarVisibility.ts` accepts only an object of string arrays; anything else reads as nothing hidden and the stored value is kept. Ids of deleted calendars or workspaces match nothing and are ignored. Writing (`setCalendarHidden`) rebuilds the whole object from the row the device holds, drops workspaces the device no longer lists and calendars it no longer knows, sorts keys and ids, and writes `""` when nothing is hidden. It is one field, so two devices that change it at once converge on the later write (last-writer-wins), like every pref field; hiding is a rare, visible action, redone in one click.

The workspace is the current one (`useWorkspaceState().current`). With no workspace list the key is the empty current id and no workspace is pruned.

## D2. One filter

`useVisibleCalendarEvents()` in `web/src/lib/liveData.ts` returns the subscriptions, their map and the cached events of enabled calendars not hidden in the current workspace. `useCalendarFeeds` (Day, Week, Plan, Month, Year), `useTodayCalendar` and `useUpcomingAgenda` read it instead of the raw events. The per-device "Show calendar events" switch applies where it did (the grid and Upcoming; Today's agenda keeps ignoring it, today-agenda). `readFreeTime` and the assistant's block data read the database directly, so hidden calendars still count as busy.

## D3. The menu

`CalendarsToggle` becomes a `Menu kind="menu"` behind the same ghost "Calendars" button, without its tooltip: the label names it and the menu shows the state. Its items keep the menu open, so several calendars can be changed in a row. The first is the device switch "Show calendar events" (an existing string), then one `MenuItem` per enabled calendar, by name, checked while shown, with the colour dot as its marker. Below 768 px the page menu keeps its "Calendars" item and gets the same rows after it. No helper text.

## D4. Interface budget

The button is the one already in the header: no row of chrome, task property, destination, scroll region or shortcut is added. The closed button renders as before (same classes, icon and label), so the calendar stories' UI baselines stay; the menu only appears when opened.

## D5. Size

No dependency. One small module, one hook, and a menu instead of a button; the two tooltip strings leave every catalogue and no string is added.
