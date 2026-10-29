## 1. Confirmed addresses (L5)

- [x] 1.1 `store.migrateEmailVerified` with backfill; `TestMigrationEmailVerified`
- [x] 1.2 Set on sign-up confirmation, email change confirmation and verified identity link; cleared by `ChangeEmailNow`; `TestOIDCTypedEmailDoesNotCatchSignOn` fails before; `TestOIDCEmailNeverLinksGuardedAccounts`, signup test updated

## 2. Setup and forwarding (L7)

- [x] 2.1 `isLocalSetup`; `TestSetupCodeOnlySkippedOnThisMachine`
- [x] 2.2 All-trusted chain uses the nearest proxy's entry; `TestForgedLeadingHopIgnoredWhenAllTrusted`, `TestClientAddressBehindTrustedProxies` updated
- [x] 2.3 One warning for an unforwarded trusted peer; `TestWarnsOnceAboutUnforwardedPeer`

- [x] 2.4 Setup code opt-in (`OPENTODO_SETUP_CODE`, D6): config validation `TestSetupCodeSetting`; default off `TestSetupCodeOffByDefault` (auth and httpapi); token wins `TestNoSetupCodeWithToken`; code tests opt in with `withSetupCode`; hosted tenants force it on

## 3. Reset timing (L8)

- [x] 3.1 Lookup and send after the answer; `TestPasswordResetAnswersBeforeSending` fails before (15 s), `TestPasswordResetTiming` and the reset tests pass

## 4. Docs and checks

- [x] 4.1 SSO, Docker, getting-started and add-on docs; CHANGELOG `### Security`
- [x] 4.2 `go test ./...`, `make openspec-validate`
