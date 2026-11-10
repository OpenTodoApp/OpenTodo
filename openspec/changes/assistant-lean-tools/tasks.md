# Tasks

- [x] 1.1 `propose_changes`, the per-round tool lists on the server and the device, and the manifest. Verify with `internal/assistant` loop tests for both scenarios and device loop tests; run `go test ./...` and `npm test`.
- [x] 1.2 Instructions, and eval runs before and after with token totals in the PR. Verify with a recorded `make assistant-eval`.
  Recorded on 2026-11-10 with `anthropic` / `claude-sonnet-5-5`, 1 run per scenario: before (main 691389f…+) **22 of 25**, 1,696,563 tokens; after (this branch) **22 of 25**, 1,052,404 tokens (**−38 %**). `reschedule-changeset` passes after: the model calls `propose_changes` before proposing. The failures are the same cause before and after, not this change: `board-column` (the model cannot see a project's sections) and `errands-map` / `complaint-no-repeat` (a search for "errands" does not find tasks labelled "errand"); `one-task-link` failed before and passed after, one run each.
  - Done: the instructions (`LeanNote`, the tool's description, the device's note from the manifest).
  - Measured with a proxy on every scenario's first round: a turn without a skill sends 35 tools and 33.5 KB (~8,400 tokens) instead of 50 tools and 57.3 KB (~14,300 tokens).
  - Open: the eval's pass rates on a real provider. This run used a small local model, `qwen2.5:3b` on Ollama (CPU only), not a real provider: it answered no call within the server's 90-second timeout before or after (0 of 25 scenarios before), so it says nothing about pass rates. Run `make assistant-eval` with a provider key, before and after, and record it here.
