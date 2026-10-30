## 1. Fields

- [ ] 1.1 `internal/sync/ops.go`: additive `review.focus_slots`, `user_prefs.focus_style`, `user_prefs.bento_order` (strings); `internal/sync/testdata/schema_fixture.json`; `go test ./internal/sync/...`
- [ ] 1.2 `web/src/lib/types.ts`, defaults in `web/src/lib/ops.ts`; not added to `CONTENT_FIELDS`; `npm test`

## 2. Logic

- [ ] 2.1 `web/src/lib/bento.ts`: `bentoSize(estimate)` (≤30 Small, 31–89 Medium, ≥90 Large, none for no estimate); `readBento(review, tasks, today)` reconciling `focus` and `focus_slots` without writing; `orderFocus(style, order)`; `placeInSlot` building the one batch; unit tests for every rule in design D3, including an older client's `focus` without slots and a stale `focus_date`

## 3. Interface

- [ ] 3.1 Daily check: slot rows in Bento, `f` behaviour, the occupied-slot message with Choose a slot, the slot menu (bottom sheet below 640 px) with Set estimate… only for editable tasks, Undo; happy-dom tests for each scenario of "Bento slots"
- [ ] 3.2 Daily check header menu: Daily focus style and Bento order items
- [ ] 3.3 Loop home Today's focus and the Focus screen's first task follow the order; tests for Frog and Summit
- [ ] 3.4 How you work: Daily focus row and the Order row shown only with Bento; copy in `web/src/lib/settingsCopy.ts`; `settingsCopy.test.ts`
- [ ] 3.5 Strings in the six catalogs (en, de, fr, it, es, pt); `make i18n-check`
- [ ] 3.6 Story for the Daily check in Bento (empty, partly filled, full) with baselines at 375 and 1280 px; `make ui-lint`, layout check at 360 px

## 4. Docs and checks

- [ ] 4.1 `docs/` review guide (Daily check): Bento, sizes, Frog and Summit; How you work guide; `make docs-check`
- [ ] 4.2 CHANGELOG Unreleased "Added" (at archive)
- [ ] 4.3 `make check`, `npm run build`, `make openspec-validate`
