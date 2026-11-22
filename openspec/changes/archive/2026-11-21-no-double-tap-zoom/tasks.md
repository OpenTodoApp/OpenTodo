# Tasks

## 1. Web app

- [x] 1.1 `web/src/index.css`: `touch-action: manipulation` on every element under `(pointer: coarse)` in `@layer base`, and the touch comment updated. Verify: a test reads the stylesheet and finds the rule in the base layer under the coarse-pointer query; `npx eslint` and `npx tsc --noEmit` pass.
- [x] 1.2 Drag handles and the notes graph keep `touch-none` (Tailwind's utilities layer wins over base). Verify: the computed `touch-action` of a drag handle is `none` and of a task row is `manipulation` in a coarse-pointer browser check.

## 2. Release

- [x] 2.1 Changelog fragment `changelog.d/Changed/no-double-tap-zoom.md`. Verify: `make repo-check`.
- [ ] 2.2 On a phone, in the browser and the installed app: a double tap on a row does not zoom; a pinch does.

---

Shipped in 1.6.0; device check moved to the owner's list (the board task "Owner: device checks from shipped changes").
