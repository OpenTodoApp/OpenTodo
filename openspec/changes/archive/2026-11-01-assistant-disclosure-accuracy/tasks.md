# Tasks

## 1. Server lists

- [x] 1.1 Rewrite `consentFields` to name everything the server's assistant sends and add `deviceConsentFields`, returned as `fields` in `mode: "device"` (`internal/httpapi/assistant.go`). Verify `TestDeviceAssistantSettings` checks the device list
- [x] 1.2 Add `TestDisclosureCoversEveryReadTool`, mapping each read tool of the assistant's registry to its entry. Verify `go test ./internal/httpapi -run TestDisclosure`
- [x] 1.3 Raise `DisclosureVersion` to 4 with the decision in its comment, `MinDisclosureVersion` unchanged (design D2). Verify `go test ./internal/assistant ./internal/httpapi -run Consent`

## 2. App

- [x] 2.1 Add `web/src/lib/assistantDisclosure.ts` and show the list translated in `AssistantConsent`; add `TestDisclosureFieldsAreTranslatable`. Verify `npm test -- assistantConsent` with an Italian rendering of every entry
- [x] 2.2 Name the step's instruction and a project as context in `RoutinesDisclosure`. Translate every new message in the five catalogues. Verify `make i18n-check`

## 3. Docs

- [x] 3.1 Update `docs/assistant-privacy.md` (the server's list, the routines steps, the device's list) and `docs/api.md` (`disclosure_version` 4, `fields` per mode). Verify `make docs-check`
