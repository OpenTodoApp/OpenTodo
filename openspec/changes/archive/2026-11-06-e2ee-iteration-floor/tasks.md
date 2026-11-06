## 1. Range

- [x] 1.1 `ACCEPTED_ITERATIONS` (600,000 to 10,000,000) in `web/src/lib/crypto.ts`, `ITERATION_LIMITS` copied from it; `crypto.test.ts` ("accepts the iteration range the server stores…", "refuses iteration counts outside 600,000 to 10,000,000…"), `e2ee.test.ts` ("refuses a key record with an iteration count outside the accepted range…" with 100,000 and 599,999); verify `npm test` in web/
- [x] 1.2 `crypt.MinIterations` 600,000 and equal to `e2ee.MinIterations`; `TestPassphraseAndRecoveryVectors` refuses 100,000 and 599,999; verify `go test ./internal/e2ee/...`

## 2. Docs and checks

- [x] 2.1 Threat model, "How we verify security", `docs/e2ee.md`; CHANGELOG `### Security`; tick 5.5 in `external-security-review`; verify `make docs-check`, `make openspec-validate`
