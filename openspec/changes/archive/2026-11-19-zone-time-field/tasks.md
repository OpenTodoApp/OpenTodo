## 1. The Do on segment

- [x] 1.1 `DoOn` and `TimeOfDay` read and write the due in the task's zone when it is fixed to another zone; the time line shows "{time}{day} your time"; a test with a Madrid viewer and a Mexico City due (reads 20:00, writes 21:00 there, zone first then time)

## 2. Strings, docs and checks

- [x] 2.1 The new string in every locale; `make i18n-check`
- [x] 2.2 The zone section of the docs; `changelog.d/Changed/zone-time-field.md`; `make openspec-validate`, `make docs-check`, the web suite
