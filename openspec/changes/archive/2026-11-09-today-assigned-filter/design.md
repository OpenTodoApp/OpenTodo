# Design

## Context

See the proposal for why. Today's date rule is `inToday` in `web/src/lib/views.ts`, and `todayList` in `web/src/lib/dayLists.ts` is that rule plus a sort. The sidebar count and the icon badge count with `todayCount`, which calls `inToday` directly. The briefing, the weekly review and the shell's published Today list all call `todayList`. Upcoming's lead group calls `inToday` too.

The filter grammar has no assignee term. `web/src/lib/filter/parse.ts` and `internal/filter/filter.go` are twins and already share test queries. A saved view is validated by the Go parser. A routine's Find tasks step evaluates with the Go evaluator.

Today's calendar-events item is the pattern for the menu: `user_prefs.today_events`, empty reads as off, one op, last-writer-wins, hidden when there is nothing to show, and on a phone it sits in the bar's overflow.

## Goals / Non-Goals

**Goals:**

- One predicate for "on Today while the option is on", used by the Today list, its count, the icon badge, the briefing and the shell's published Today list.
- Assignee terms in both parsers, with shared queries, and a builder condition.

**Non-Goals:**

- `inToday` stays the date rule. Upcoming's lead, the weekly review's unfinished list and every other caller of `inToday` keep listing someone else's task.
- No new route, dependency, shortcut or sidebar destination.

## Decisions

### The option is a string on user_prefs, default empty

`user_prefs.today_assignees` is an additive string, default `""`. `mine` hides others. Anything else, including empty and a value this client does not know, reads as off and is not rewritten. Same read as `today_events`. The field is absent until written, so no migration file and no rewrite of existing rows. Export already includes `user_prefs`, so the choice leaves with the account.

Alternative: hide others for every shared account. Rejected. A household's shared day is the current meaning of Today, and the proposal keeps that until someone turns the option on.

### Hide at the edges that are Today, not inside inToday

A small predicate, next to `isMine` in `web/src/lib/stats.ts`: a task drops only when the option is `mine`, the membership cache says the project is shared, and `assignee_id` is set to someone else. Unassigned stays. A project the cache does not know as shared stays, which is what a stale offline cache must do.

`todayList` grows an optional flag rather than a new list function, and the Today page, `todayCount` (so `badgeCounts` follows), the briefing and `shellPublish` pass it. `upcomingWithToday` and the review do not. Filtering inside `inToday` would change Upcoming and the review, which the spec leaves alone.

### The menu item follows the calendar-events item

Offered when the membership cache has a shared project with another member. The stored value is kept when the item is hidden, so a solo stretch does not wipe it. Copy is "Hide tasks assigned to others" and, while on, "Show tasks assigned to others". No new shortcut: the existing page menu is already on the keyboard. On a phone the item is in the overflow the calendar item uses.

Interface budget: one item in an overflow that already exists. No row of chrome above the list, no new default property on a task row, no new primary destination, no new scroll region.

### Assignee is a keyword, resolved from the membership cache

`assigned`, `unassigned` and `assigned: me | name` follow `energy` and `notes`: a reserved word, a syntax error when `assigned:` has no value, a warning and no match for an unknown name, and the server still accepts a saved view that names someone. `me` is the viewer on the device and the account the routine runs as on the server. A name matches a member's name or email, ignoring case; two Sams both match. The Go evaluator needs the viewer id and the member directory it already has for assignment; it does not read task text, so the step is not a content step.

The condition builder gains an Assignee kind: Me, Unassigned, and the members the device knows. It writes `assigned: me` or `unassigned` or `assigned: "Name"`.

`docs/filters.md` gains the terms. The existing routine scenario `#Errands & !assigned` starts to parse, which is what that scenario already says.

### Nothing new to ship

No dependency, no asset, no SQL migration. The container image and runtime memory are unchanged: the predicate walks tasks the list already holds.

## Risks / Trade-offs

- [A stale membership cache shows a shared task the option would hide] → The spec requires that. The task leaves Today once the membership syncs.
- [The weekly review still lists someone else's unfinished task] → Accepted. The review is not Today. The shell widget is Today, so it is filtered.
- [Future badge days use `todayCount`, so they hide others too] → The badge is "what Today will count". Leaving them unfiltered would make the badge jump at midnight.
- [`assigned` becomes reserved] → A custom field of that name needs quotes, the same rule as `energy` and `notes`.

## Migration Plan

Ship the field as additive. An old client ignores it. A new client reads absence as off. Turning the option off writes `""`, which an old client also ignores. No backfill.
