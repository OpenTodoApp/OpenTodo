---
title: Add a shared contract
summary: Logic that must give the same answer in Go and TypeScript - the two twins, one fixture both test suites read, and the row in docs/contracts.md.
audience: developer
section: Contributing
specs: []
screens: []
order: 7
---
# Add a shared contract

Some logic runs in the web app, offline, and on the server, for REST, MCP, the CLI and imports: recurrence, filters, quick add, Inbox membership, encryption. Each pair is a **shared contract**: two implementations and one fixture that both test suites read. The full list is [Shared contracts](../contracts.md).

## When you need one

When the server has to compute something the app already computes (or the other way round) and a difference would show: two answers for "what is due today", a task in the Inbox on one device and not the other. If the server only stores and returns a value, you don't need one.

## The steps

1. **The TypeScript side** stays in `web/src/lib/<name>.ts`: pure functions, no Dexie, no DOM.
2. **The Go twin** goes in its own package, `internal/<name>`, with the same inputs and outputs and a comment naming the TypeScript file.
3. **The fixture**: `web/src/lib/<name>.vectors.json`, a list of cases `{name, input, expected}`. Cover the edges: time zones and daylight saving, empty values, the limits.
4. **Both tests read it**: `internal/<name>/<name>_test.go` and `web/src/lib/<name>.test.ts` load the same file and assert every case.
5. **The row**: add the contract to the table in [docs/contracts.md](../contracts.md) with both files, the fixture, both tests and how the fixture is written (`hand`, or the command that regenerates it).
6. **The layout note**: name the Go package in `AGENTS.md` (Go ports of web logic) and in [Architecture](../architecture.md#server-packages-cmdopentodo-internal).

## Check it

```sh
go test ./internal/<name>
cd web && npx vitest run src/lib/<name>.test.ts
make repo-check   # every fixture listed, every file named exists and reads its fixture
```

Change one side, run both tests. A generated fixture is regenerated with its command, never edited by hand.
