## 1. Hover

- [ ] 1.1 Guard the eight raw `:hover` rules in `index.css`; `make layout-check` shows no stuck hover after a tap on a note link, a calendar block and a resize handle
- [ ] 1.2 Repo check: no `:hover` outside `(hover: hover)` in `web/src/**/*.css` (`make repo-check`)

## 2. Focus

- [ ] 2.1 `lib/inputMode.ts` writes `data-input`; vitest for touch, pen, mouse and keyboard events
- [ ] 2.2 Focus utilities and `.ui-input` skip the ring for `data-input="touch"`; layout check taps then tabs and reads the outline
- [ ] 2.3 VoiceOver and TalkBack focus keep the ring (device check row in mobile/AUDIT.md)

## 3. Check

- [ ] 3.1 `npm test`, `npm run build`, `make bundle-budget` in web/
