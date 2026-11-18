# Tasks

## 1. The notice

- [x] 1.1 `beginDrag` calls an optional `onMiss(x, y)` on a lifted release over no target, never for a cancelled drag (`dnd.test.ts`).
- [x] 1.2 `useListDrag`: in a list without an order of its own and without Today's project groups, a miss over one of the list's rows shows the notice (`upcomingDrag.test.tsx`, Today case).
- [x] 1.3 A day drop that changes nothing returns the notice as its label, without Undo (`dayDrop.test.ts`, `upcomingDrag.test.tsx`, Upcoming case).
