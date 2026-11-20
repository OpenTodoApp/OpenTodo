# Tasks

## 1. Create-a-task tap

- [ ] 1.1 Fire a light tick when a task is created, at the shared creation path(s) (quick add, the add line, the composer), once per created task, behind the existing haptics preference and capability check. Verify: a unit/interaction test that creating a task calls the haptic and that it is silent when the preference is off or the device cannot vibrate.
- [ ] 1.2 (Only if the owner chooses open-task in D2.) Fire the same light tick when a task's editor/detail opens. Verify: a test at the open path.

## 2. Release

- [ ] 2.1 Changelog fragment `changelog.d/Added/task-haptics-moments.md`. Verify: `make repo-check`.
- [ ] 2.2 Docs: the apps' haptics line (`docs/ios-app.md`, `docs/android-app.md`) names the new moment(s). Verify: `make docs-check`.
