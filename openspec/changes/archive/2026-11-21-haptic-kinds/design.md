 # Design: haptic-kinds

 ## D1. Kinds, not intensities

 The page asks for a meaning; each shell maps it to the platform's own generator. Unknown kinds fall back to `tick`, so a page newer than its shell never fails. The shared fixture `haptics.json` lists the kinds, so Go-free tests in both shells and in web read one list.

 ## D2. Where

 - `ui/Switch.tsx` and `ui/SegmentedControl.tsx`: `selection` on a change made by touch (not by keyboard, not by script).
 - `app/ToastActionHost.tsx`: `error` when a failure toast appears.
 - `lib/dnd.ts` `lift()`: `tick`.
 All go through `motion.ts` and the synced `user_prefs.haptics` switch, as today.

 ## D3. Tests

 vitest with a stub shell for each place; XCTest and a JVM test for the new kinds; device check for feel.

## Data model, size and budget

- Data model: none. No op field, no synced preference, no route.
- Container image and server memory: unchanged (web and shell only).
- First load: about 0.2 KB gzip (in the entry chunk with motion.ts; paid for by its cut, or the switch and segment calls go through a lazily loaded helper). The entry chunk is at 147.4 of 148 KB (web/bundle-budget.json), so anything that would land in it is loaded lazily or paid for by a cut in the same change; `make bundle-budget` decides.
- Interface budget (docs/interface-guide.md): no visible change.
