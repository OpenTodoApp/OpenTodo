## 1. Release gate

- [x] 1.1 `scripts/release/accessibilityAudit.mjs`: pending screen-reader cells are one warning for any release; pending keyboard or zoom cells, an invalid cell and an audit older than 12 months refuse; verify `node --test scripts/release/*.test.mjs`
- [x] 1.2 `scripts/release/prepare.mjs` and `prepare.test.mjs`: the rc and final release flows expect the warning and no screen-reader refusal

## 2. Docs

- [x] 2.1 `RELEASING.md`, `docs/accessibility.md`, `docs/accessibility/audit-1.0.0.md`: no "1.0.0 cannot be released"; partial conformance, which passes were done, how to contribute (#9)
- [x] 2.2 Changelog fragment `changelog.d/Changed/screen-reader-passes-optional.md`; verify `make openspec-validate`, `make deploy-check docs-check`
