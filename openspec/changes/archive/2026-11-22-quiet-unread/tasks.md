# Tasks

## 1. Unread

- [x] 1.1 `isArrangement` and `countsAsUnread` in `web/src/lib/feed.ts`; `countUnread` and the feed's unread dot (`FeedView.tsx`) use them. Verify: "a rearrangement is never unread" in `web/src/lib/feed.test.ts`; `npx vitest run src/lib/feed.test.ts` in web/.
- [x] 1.2 `useMarkProjectSeen` in `feed.ts`, called by `TaskListView` on the project route. Verify: `web/src/app/projectSeen.test.tsx` (open project seen, also as changes arrive; other projects untouched; a personal project writes nothing; a hidden page does not mark, becoming visible does).
- [x] 1.3 A dot on project rows in `Sidebar.tsx`; "Unread changes" in every catalogue. Verify: "unread changes on a project row" in `web/src/app/sidebar.test.tsx`; `make i18n-check`.

## 2. Docs and checks

- [x] 2.1 `docs/comments-and-activity.md`; `changelog.d/Changed/quiet-unread.md`. Verify: `make docs` and `make docs-check`.
- [x] 2.2 Typecheck, lint and `make openspec-validate`; the targeted tests above and `src/app/sidebar.test.tsx`.
