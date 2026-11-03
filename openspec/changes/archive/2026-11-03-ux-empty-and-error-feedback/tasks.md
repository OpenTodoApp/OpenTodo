# Tasks

## 1. Local refusals

- [x] 1.1 Map the eight known local refusal sentences to message ids in web/src/app/actionError.ts; unknown messages pass through
- [x] 1.2 Add the nine new messages to de, es, fr, it and pt and refresh web/src/locales/messages.json

## 2. Projects empty state

- [x] 2.1 Replace the bare sentence with the shared EmptyState, title, distinguishing line and a New project action opening the creation prompt

## 3. Sync error visibility

- [x] 3.1 Keep the pill label in compact mode and show the error as a role=alert below the pill in both layouts
- [x] 3.2 Keep the alert text visible without a native title attribute

## 4. Checks

- [x] 4.1 node scripts/i18n-check.mjs passes with every shipped catalog complete
- [x] 4.2 npm run typecheck and npm run lint pass
- [x] 4.3 The SyncStatus tests cover the visible alert and its absence when healthy
- [x] 4.4 CHANGELOG.md entry under Fixed
