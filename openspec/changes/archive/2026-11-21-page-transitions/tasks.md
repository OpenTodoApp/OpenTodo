## 1. Router

- [x] 1.1 Direction table and `direction` in `navigate()` and `popstate`; vitest
- [x] 1.2 `startViewTransition` with the reflow skip rules; vitest with a stub

## 2. CSS

- [x] 2.1 `page` group animations from the motion tokens; chrome names; vitest pins the rules
- [x] 2.2 Layout check: Inbox → task page → Back reads the end states; reduced motion reads none

## 3. Check

- [x] 3.1 `npm test`, `npm run build`, `make bundle-budget` in web/ (lazy load if the entry chunk would pass 148 KB)
- [ ] 3.2 Device check rows on an iPhone and an Android phone: forward, back, the system back gesture and button, reduced motion

---

The device check (3.2) moved to the owner's list (the board task "Owner: device checks from shipped changes"). 2.2 is `pageTransitions` in scripts/e2e-layout.mjs (Chromium, phone widths). The entry chunk had room, but the transition code is still loaded after the first paint (D3): 684 B gzip outside the first load; the CSS and the router hook add 318 B to it (entry +23 B).
