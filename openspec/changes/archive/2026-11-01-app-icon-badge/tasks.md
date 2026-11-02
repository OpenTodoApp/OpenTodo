## 1. Count and badge

- [x] 1.1 `web/src/lib/appBadge.ts`: `todayCount` (shared with the sidebar's Today count), `badgeCounts` for the next seven days, `showBadge`/`clearBadge`, the device flag and `useAppBadge` storing the `meta` row `badge:today`; verified by `web/src/app/appBadge.test.tsx` and `web/src/app/sidebar.test.tsx`
- [x] 1.2 The signed-in app keeps the badge current (`AppBadgeSync` in `web/src/app/AppBadge.tsx`, rendered by `web/src/app/App.tsx`), sign-out clears it (`web/src/app/App.tsx`); verified by `web/src/app/appBadge.test.tsx`

## 2. While closed

- [x] 2.1 `web/public/push-sw.js` sets the badge from the stored counts on a push with no visible window, finding the logical day like `logicalDay`; verified by `web/src/lib/pushWorker.test.ts`

## 3. Setting

- [x] 3.1 Settings → Notifications → App icon badge, shown only where supported, with the permission note; settings copy, search index and the six catalogs; verified by `web/src/app/appBadge.test.tsx`, `npm test`, `npm run build` and `make i18n-check`

## 4. Docs

- [x] 4.1 `docs/push-notifications.md` (App icon badge), `docs/install-phone.md`, CHANGELOG; verified by `make docs-check`
