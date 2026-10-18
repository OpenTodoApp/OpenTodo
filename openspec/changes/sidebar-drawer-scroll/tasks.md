## 1. Sidebar

- [x] 1.1 Render the More group inside the sidebar's scroller, after the find field (`web/src/app/Sidebar.tsx`)
- [x] 1.2 Keep the content column from scrolling and the scrim from panning while the phone drawer is open (`web/src/app/Shell.tsx`)
- [x] 1.3 `sidebar.test.tsx`: the More group is inside the one scroller

## 2. Checks

- [x] 2.1 At 390×640 with More open and 25 projects, the scroller is 200 px tall instead of 8 px and scrolls under the pointer (Chromium, before and after)
- [x] 2.2 `npm test`, `npm run lint`, `npx tsc -b`, `make ui-lint`, Chromium layout check
