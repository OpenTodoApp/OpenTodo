## 1. Web

- [x] 1.1 Hold rise on `[data-touch-hold]` for task and sidebar rows; vitest pins the CSS; layout check reads the transform at 300 ms
- [x] 1.2 Reduced motion: tint only; layout check with `reducedMotion: 'reduce'`

## 2. Android

- [x] 2.1 `overScrollMode = OVER_SCROLL_NEVER` in `MainActivity.kt`; JVM test

## 3. Check

- [x] 3.1 `npm test`, `npm run build`, `make bundle-budget` in web/; `make android`
- [ ] 3.2 Device check rows: a held row rises and settles; no glow at a list's end
