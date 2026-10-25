## 1. Breadcrumb

- [x] 1.1 `TaskPage.tsx`: tell the page whether the trail starts at the task's own project (`fromProject`)
- [x] 1.2 `TaskPageView.tsx`: the origin crumb as a button calling `onBack`; the project crumb calls `onBack` when it is the origin; **Inbox** as a button without a trail
- [x] 1.3 Tests: from Today (origin crumb, back with the task selected), from the project (no duplicate, back), without a trail (Inbox link); each fails without the change

## 2. Docs

- [x] 2.1 `docs/task-panel.md`: the breadcrumb leads back
- [x] 2.2 CHANGELOG Unreleased → Fixed
