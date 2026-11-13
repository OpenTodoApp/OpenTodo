## ADDED Requirements

### Requirement: One search grammar for scripts and assistants
`ot notes search`, the `--search` option of `ot notes list`, the agent tool `search_notes` and the MCP resources that search notes SHALL read a query with the same grammar as the Notes page words (`notes-page` "Search operators"): every word or phrase must match, `OR` in capitals joins alternatives, and `title:` or `text:` limits a word or phrase to the title or the text. They SHALL match and rank exactly as the device does, pinned by the shared vectors of `internal/notesearch` and `web/src/lib/noteSearch.ts`, and SHALL accept every query they accepted before with the same results. Page tokens such as `in:` or `changed:` SHALL stay words there; those tools keep their own project and label options. The CLI SHALL search on the user's machine; `search_notes` SHALL search on the server for accounts without end-to-end encryption; on encrypted accounts it SHALL keep returning `encryption_enabled`, and `ot mcp --decrypt` SHALL apply the same grammar when it matches decrypted notes locally. Reads change nothing, so there is nothing to converge.

#### Scenario: CLI with OR
- **WHEN** the user runs `ot notes search 'ferry OR train'` and the notes "Trip" (ferry) and "Commute" (train) exist
- **THEN** both are printed, ranked as the Notes page ranks them

#### Scenario: Assistant title search
- **WHEN** an assistant calls `search_notes` with `query: "title:wifi"`
- **THEN** only notes whose title contains "wifi" are returned, with snippets inside `untrusted_text`

#### Scenario: Vectors agree
- **WHEN** the shared note search vectors with `OR`, `title:` and `text:` are run by the Go and the TypeScript tests
- **THEN** both give the same groups, matches, ranking and highlights

#### Scenario: Old query unchanged
- **WHEN** a script that ran `ot notes search '"oat milk" bread'` before this change runs it again
- **THEN** it prints the same notes in the same order
