## 1. Completion engine

- [x] 1.1 Hidden `ot __complete -- <words>`: command, subcommand, alias, flag and enum candidates from `cmdSpecs`; directive line; silent on every error (`TestCompletionCoversSchema`, `TestCompletionEngine` in `go test ./internal/cli`)
- [x] 1.2 Dynamic values: profiles, projects, labels, workspaces, task ids, `#`/`@` in an add title, 2-second limit, ciphertext skipped (`TestCompletionDynamic`, `TestCompletionOffline` against the in-process server)

## 2. Scripts

- [x] 2.1 `ot completion bash|zsh|fish` with per-shell quoting; the command prints the embedded script and refuses other shells with exit 2 (`TestCompletionCommand`); syntax checks with `bash -n`, `zsh -n`, `fish -n` when installed (`TestCompletionScriptsParse`)
- [x] 2.2 A bash run of the script completes a project name with a space quoted (`TestCompletionBashQuotesNames`); the zsh function hands `_describe` escaped values (`TestCompletionZshValues`)

## 3. Docs

- [x] 3.1 `docs/cli.md` install instructions, `ot help` line, CHANGELOG, ROADMAP; `make check`
