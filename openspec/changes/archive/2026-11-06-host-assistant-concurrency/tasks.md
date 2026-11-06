## 1. One cap for the host

- [x] 1.1 `assistant.Slots`, `NewSlots` and `Service.UseSlots`; `Acquire` takes and returns a slot of the service's `Slots`; verify `TestAcquireLimits` and `TestSharedSlotsAcrossServices` (`go test ./internal/assistant`)
- [x] 1.2 `services.Hosted.AssistantSlots`: the host builds one `Slots` of `MaxConcurrentTurns` and hands it to every tenant, and the tenant's assistant uses it; verify `TestAssistantConcurrencyIsHostWide` (`go test ./internal/host`)

## 2. Docs and checks

- [x] 2.1 `docs/security/threat-model.md`, `docs/api.md`, `docs/self-hosting/docker.md`, CHANGELOG `### Security`; verify `make docs-check`
- [x] 2.2 `go test ./...`, `make openspec-validate`
