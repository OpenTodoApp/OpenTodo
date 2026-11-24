## 1. Web

- [x] 1.1 `useCommandBar` exposes `quickAdd`, the `q` action; the sidebar's Add task item calls it from 768 px in the Tasks space, with the `q` hint and tooltip; verified by `addTaskButton.test.tsx` (Today, a project, a label, Upcoming focus the line and add with the view's defaults; Statistics opens the bar; keyboard; hints; no item in the drawer)
- [x] 1.2 `LineTools` beside a list's quick add: Priority, Project and Label start their token and open the suggestions, a set field's words are selected, hidden while recognition is off; verified by `quickAddLineTools.test.tsx`
- [x] 1.3 Strings in every catalog (`npm run i18n:check` or `make check`)
- [x] 1.4 Stories for the sidebar and the line; baselines regenerated with the UI baselines workflow

## 2. Docs

- [x] 2.1 The quick add guide names Add task and the field buttons; changelog fragment

## 3. Check

- [ ] 3.1 `make check`
