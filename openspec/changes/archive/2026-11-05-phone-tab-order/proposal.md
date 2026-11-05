# Phone tab bar follows the sidebar destination order

## Why

On a phone the bottom bar always reads Inbox, Today, Upcoming, Search, even after the same person has put Today or Upcoming first in Settings → Appearance. That order is already saved with the account and already rearranges the sidebar and the phone drawer. The bar was the one place that ignored it ([#873](https://github.com/OpenTodoApp/OpenTodo/issues/873)).

## What Changes

- The phone tab bar lists Inbox, Today and Upcoming in the stored destination order, then Search. Search stays last. Calendar and every other destination stay in the drawer.
- With no stored order the bar is unchanged: Inbox, Today, Upcoming, Search.
- No new preference, no second order for the phone, and no extra tab. Reordering stays where it already is: Settings → Appearance → Sidebar destinations, including Move up, Move down and Alt+↑ / Alt+↓.

## Capabilities

### Modified Capabilities

- `app-shell`: "Phone navigation" — the three list tabs follow the primary destination order; Search stays last.
- `appearance-preferences`: "Primary destination order" — the phone bar reads that order, offline, including while Open Loops first arranges the sidebar.

## Impact

- Web: `web/src/lib/appearance.ts` (`tabBarDestinations`), `web/src/app/TabBar.tsx`. Tests in `appearance.test.ts` and `tabBar.test.tsx`.
- Docs: `docs/sidebar-counts-and-order.md`, `docs/interface-guide.md`, the in-app help generated from the guide, and a CHANGELOG entry.
- No new field, no migration, no API route.

Out of scope: a phone-only order separate from the sidebar, choosing extra destinations for the four slots, and a scrolling bar that forgets its place when the app is backgrounded. Advances no open ROADMAP item; it is the phone half of the shipped `sidebar-polish` destination order.
