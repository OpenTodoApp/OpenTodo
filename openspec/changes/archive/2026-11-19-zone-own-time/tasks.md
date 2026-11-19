# Tasks

## 1. Web app

- [x] 1.1 `WhenControl.tsx`: the Do on fields use the due's own zone when it is fixed to one; the zone control keeps the viewer's (D1). Verify: `whenControl.test.tsx` "a due fixed to Mexico City reads and edits Mexico City time" (fails on main: the field reads 02:00) and "a due fixed to the viewer zone shows no hint"; `npm test`.
- [x] 1.2 The hint line under the fields, from `zonePreview` shared with `ZoneControl.tsx` (D2). Verify: the same test reads the hint; `zoneControl.test.tsx` still passes.

## 2. Release

- [x] 2.1 Changelog fragment `changelog.d/Fixed/zone-own-time.md`. Verify: `make repo-check`.
