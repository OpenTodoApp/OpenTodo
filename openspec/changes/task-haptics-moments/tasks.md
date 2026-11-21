# Tasks

## 1. Create-a-task tap

- [x] 1.1 Fire a light tick when a task is created, at the shared quick-add path (`addToList`: the command bar, the phone sheet, the list and section add lines), once per created task, behind the existing haptics preference and capability check. A pasted list (`addManyToList`) does not tap. Verified: `web/src/app/reuseAdd.haptics.test.ts`.

> Decision (owner/Lead, 20 Nov): create-a-task taps; opening a task does **not**, since it is the most frequent action and would buzz on nearly every tap. The spec delta reflects this (a "Create on a phone" scenario and an "An ordinary tap does not tick" scenario).

## 2. Release

- [x] 2.1 Changelog fragment `changelog.d/Added/task-haptics-moments.md`.
- [x] 2.2 Docs: the apps' haptics line (`docs/ios-app.md`, `docs/android-app.md`) names adding a task.

## 3. Confirm on a device (post-merge, before archive)

- [ ] 3.1 Feel the create tap on a real iPhone and Android, with the switch on and off; then archive the change.
