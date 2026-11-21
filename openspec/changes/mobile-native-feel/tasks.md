## 1. The plan

- [x] 1.1 Proposal, design (order, rules, per-step table, measure of success) and the device check requirement
- [x] 1.2 One OpenSpec change per step, each with proposal, design, delta specs and tasks; `openspec validate --strict` passes for all

## 2. The steps (each applied and archived on its own)

Phase 1:
- [ ] 2.1 `press-feedback-delay`
- [ ] 2.2 `touch-input-mode`
- [x] 2.3 `row-lift-overscroll`
- [ ] 2.4 `haptic-kinds`
- [ ] 2.5 `status-bar-scroll-top`

Phase 2:
- [ ] 2.6 `page-transitions`
- [ ] 2.7 `swipe-back-follows` (after 2.6)
- [ ] 2.8 `ios-keyboard-bar`

Phase 3:
- [ ] 2.9 `focus-live-activity` (existing change)

Phase 4:
- [ ] 2.10 `tablet-layouts` (audit first)
- [ ] 2.11 `tablet-shells`

## 3. Success

- [ ] 3.1 The tester script and today's ratings recorded in `mobile/AUDIT.md` before phase 1 ships
- [ ] 3.2 The same testers re-run the script after phase 2 and after phase 4; results recorded; the plan is archived when the ratings meet D4
