## 1. Hold the page and scroll at the edges

- [x] 1.1 `lib/dnd.ts`: one standing touchmove listener, held by an armed hold or a lifted touch drag (`dnd.test.ts`: a press adds no listener of its own; the page holds only while armed or lifted)
- [x] 1.2 `lib/dnd.ts`: edge scrolling of the main content and the sidebar during a lifted drag (`dnd.test.ts`: the step table; a still pointer at the bottom keeps scrolling and re-reads the target, and stops at the end and on release)
- [x] 1.3 `npm test` and `npm run build` in web/
- [ ] 1.4 On an iPhone (the installed web app and the iOS app): hold a task and a sidebar project, move them; the page stays still, and the list scrolls at its edge
