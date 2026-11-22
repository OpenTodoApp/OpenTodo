# Tasks

## 1. Web app

- [x] 1.1 `appBadge.ts`: the stored mode (D1) and the Earlier count for today and the next days (D2). Verify: `appBadge.test.tsx` "Earlier: only Today's Earlier group…" and "Earlier: the badge and the stored counts follow the Earlier group"; `incrementalEquivalence.test.ts`.
- [x] 1.2 `AppBadge.tsx`: Count with Today, Earlier and Off (D3). Verify: `appBadge.test.tsx` "offers Today, Earlier and Off"; `npm test`, `make i18n-check`.
- [x] 1.3 `docs/app-icon-badge.md` describes the choice. Verify: `make docs-check`.

## 2. Release

- [x] 2.1 Changelog fragment `changelog.d/Changed/badge-overdue.md`. Verify: `make repo-check`.
- [ ] 2.2 On an installed app (Android Chrome or an iPhone with notifications allowed): choose Earlier with one overdue and one today task; the icon shows 1.

---

Shipped in 1.6.0; device check moved to the owner's list (the board task "Owner: device checks from shipped changes").
