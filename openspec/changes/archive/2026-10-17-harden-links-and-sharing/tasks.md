## 1. Links

- [x] 1.1 Mailed links from `OPENTODO_BASE_URL` only; 409 `base_url_required` without it (`TestMailedLinksNeedBaseURL`, `TestMailedLinksIgnoreRequestHost`, `go test ./internal/httpapi`)
- [x] 1.2 Forwarded host and scheme only from trusted proxies (`TestForwardedHostOnlyFromTrustedProxy`, `TestInvitationLinkUsesRequestOrigin`)
- [x] 1.3 Owner configuration warning for email without a base URL (`TestMailedLinksNeedBaseURL`)
- [x] 1.4 Client: error messages, the "Forgot password?" screen and translations (`npx vitest run src/app/emailScreens.test.tsx`, `make i18n-check`, error-code fixture)
- [x] 1.5 Docs: self-hosting, outgoing email, API (`make docs-check`)

## 2. Ids

- [x] 2.1 Entity id charset in `Validate` (`TestValidateEntityIDCharset`, `TestControlCharacterIDCannotBreakLists`)
- [x] 2.2 One JSON quoting helper `QuoteJSON` instead of `%q`, `strconv.Quote` and `quoteID` (`TestQuoteJSONIsJSON`, `go test ./...`)

## 3. Sharing

- [x] 3.1 Refuse sharing a project id that another personal scope holds (`TestShareRefusesProjectIDSquat`)
- [x] 3.2 Move attachments on first share (`TestShareMovesAttachments`)
- [x] 3.3 Migration repairing projects shared earlier (`TestMigrationSharedAttachments`)
