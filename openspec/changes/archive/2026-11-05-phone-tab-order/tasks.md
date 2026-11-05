# Tasks

## 1. Order

- [x] 1.1 `tabBarDestinations` in `web/src/lib/appearance.ts` keeps Inbox, Today and Upcoming from `sidebar_order`; verified by `web/src/lib/appearance.test.ts`
- [x] 1.2 `TabBar` renders those three in that order, then Search; verified by `web/src/app/tabBar.test.tsx` (default order unchanged, a stored order of Upcoming, Today, Inbox shows that, Search last)

## 2. Words

- [x] 2.1 `docs/sidebar-counts-and-order.md` and `docs/interface-guide.md` say the phone bar follows the order, and `npm run docs:build` in `web/` refreshes the in-app help
- [x] 2.2 CHANGELOG entry under Unreleased
