# Design

## D1. One synced preference, offered in Upcoming's page menu

`user_prefs.upcoming_today` is a string: `"on"` turns the option on; empty, `"off"` or any other value reads as off and is kept as stored. It is written with `mutate('user_prefs', 'me', …)` like `day_parts` and `today_events`: applied locally first, offline included, sent as one op, last-writer-wins per field. It is a setting, never content, so it is not encrypted.

The item is **Start with Today** (icon `sun`, checked state, description "Show Today's tasks before Tomorrow") in the overflow of Upcoming's page header, beside Show repeating occurrences. On a phone it is in the same overflow menu. There is no Settings entry: the option belongs to one page, like Show repeating occurrences.

Interface budget (docs/interface-guide.md): no new row of chrome (the item lives in an existing menu), no new task property, no sidebar destination, no scroll region, no shortcut.

## D2. Today's groups come from Today's own code

Upcoming's tasks while the option is on are `todayList(...)` followed by the `upcomingList(...)` tasks that `inToday` does not already hold (`dayLists.upcomingWithToday`). A task due tomorrow whose deadline has passed is in both lists; it is listed once, under Earlier, as Today lists it.

`listGroups` draws Today with one function, `todayGroups`, and Upcoming calls the same function with the tasks `inToday` holds: Earlier, Today, Morning, Afternoon, This Evening, Blocked and the closed list's Waiting for a slot. So any change to Today's grouping (for example the Waiting group's next-up line in #766) shows in Upcoming too. Two differences, both because more groups follow: the Today group always carries its heading, and it is left out when it has no task (Today keeps an unnamed group so its own list is never empty).

Upcoming's duration and query filters apply to the whole list, as they always did. Unfiltered, the Today part holds exactly Today's tasks, so its count agrees with Today and the sidebar.

Earlier shares Today's fold choice on the device (`today:earlier`), and **Move all to today** and **Reschedule…** are in its header as in Today. Blocked and Waiting for a slot fold with the same per-device keys as Today.

Projected occurrences (`series-occurrences`, Show repeating occurrences) start tomorrow; when they are merged, the day groups are sorted by date and Today's named groups stay in front.

## D3. The Today limit in Upcoming

The slots are filled from Today's tasks only (the Upcoming tasks after today never take a slot), with the same `todaySlots` call as Today, so the same tasks wait. They leave the Today groups and are listed in the folded **Waiting for a slot** group at the end of Today's part, with Take a slot in their menus, exactly as in Today. Done today, the "3 of 5" line in the header and Close the day stay on Today: Upcoming looks ahead.

The part-of-the-day headings take no drops in Upcoming. In Today a drop sets the part; in Upcoming a task dragged from Tomorrow onto Morning would get the part and keep tomorrow's date, which reads as a bug.

## D4. CLI, agent tools and other surfaces

`ot upcoming`, `ot list --upcoming` and the agent tools' `view: "upcoming"` keep returning the tasks after today. They are explicit requests, and both already offer Today by name; one preference changing what a script or an agent receives would be surprising. Display mode's Upcoming page and the briefing are unchanged for the same reason.

## Data model, size and memory

One additive string field on `user_prefs`. No dependency; the main chunk grows by a few hundred bytes (one menu item, two small functions). No server change beyond the schema entry, no new memory.
