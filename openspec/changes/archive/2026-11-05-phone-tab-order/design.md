# Design: one order, read by the bar

## The bar reads the order it already has

`tabBarDestinations` takes the same `user_prefs.sidebar_order` the sidebar uses and keeps only `inbox`, `today` and `upcoming`, in the stored order. Anything else in the order (Calendar, a promoted destination, an id this client does not know) is ignored. A missing one of the three follows in the default order, which is what `orderDestinations` already does. Search is appended by the bar and is not stored.

A person who never reordered has an empty order, so the bar stays Inbox, Today, Upcoming, Search. Moving Today above Inbox in Settings writes the same op as today; the bar re-renders from the local row, offline, and other devices follow after sync. Last-writer-wins on the whole order is unchanged.

Open Loops first still disables the settings list and still arranges the sidebar. The bar keeps reading the stored order, so a reorder made in another mode is not forgotten on the phone.

## What does not change

The drawer still omits the three views the bar holds. Four tabs, 48 px tall, Search last. No new chrome above a list, no new shortcut, no new dependency. The container image and runtime memory are unchanged. The preference field is the existing additive `sidebar_order`; nothing is renamed.
