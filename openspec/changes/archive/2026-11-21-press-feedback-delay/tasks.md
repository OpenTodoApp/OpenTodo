## 1. CSS

- [x] 1.1 Delay the fallback dim and the `press-*` utilities by 60 ms (`index.css` around 1636-1693); a vitest test reads the rule and finds the delay
- [x] 1.2 Innermost only with `:has()`; the layout check reads the computed opacity of row and button at 0 and 100 ms (`make layout-check`)
- [x] 1.3 Keep `:active` alive on iOS with a passive document `touchstart` listener when edge swipes are off; unit test of the installer

## 2. Check

- [x] 2.1 `npm test`, `npm run build`, `make bundle-budget` in web/
- [ ] 2.2 Device check row "a scroll that starts on a row does not flash it; a pressed circle dims alone" in mobile/AUDIT.md, run on an iPhone and an Android phone
