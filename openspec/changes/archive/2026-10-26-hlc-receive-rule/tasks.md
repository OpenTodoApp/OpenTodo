## 1. Receive rule

- [x] 1.1 `hlcReceive` in `web/src/lib/hlc.ts`, called by `applyOps` for every remote batch, with the seed stored; verified by `hlc.test.ts` and the `ops.test.ts` case of a device a minute behind
- [x] 1.2 Encrypt-on-sight of a plaintext value stamped a second ahead ends with the envelope as the server's value; verified by `e2ee.test.ts`
- [x] 1.3 `ot vault` clock moves past every pulled op; verified by `TestVaultClockBehindKeepsLaterEdit`
- [x] 1.4 The server clock follows stored ops and is seeded at start; verified by `TestServerTSFollowsStoredOps`; the property test's device model applies the rule

## 2. Docs

- [x] 2.1 `docs/sync.md` "Clocks"
- [x] 2.2 CHANGELOG Unreleased, Security
