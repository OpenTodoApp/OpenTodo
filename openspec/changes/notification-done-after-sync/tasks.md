# Tasks

Web tasks run `npm test` and `npm run build` in `web/`.

## 1. Web app

- [x] 1.1 `handleShellUrl` applies Done after `afterFirstSync` (first exchange, cannot run, or 30 s; 10 s when sync never starts); Snooze and Dismiss do not wait. Verified by `shellActions.test.ts` ("waits for the first sync", "Snooze and Dismiss do not wait", "the first sync ends").
- [x] 1.2 `applyReminderAction` leaves a series alone when its relative or deadline reminder, computed on the device and as stored, fires more than an hour from now. Verified by `shellActions.test.ts` ("already completed elsewhere", "a snooze set on another device", "a clock ahead or in another time zone", "written east of the phone", and the absolute reminder left unguarded).
- [ ] 1.3 Device run on Android: complete today's occurrence on the web while the phone is offline, reconnect, tap Done on the next notification; the web shows the occurrence completed and the series on its next date. Left open: it needs a phone.
