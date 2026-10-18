## 1. Server

- [x] 1.1 `internal/email/markdown.go`: `HTMLToMarkdown` (tag scanner, hidden and non-text elements skipped, invisible characters removed, headings, emphasis, nested lists, links with safe percent-encoded targets, escaping); `go test ./internal/email/...`
- [x] 1.2 `walker.text`: the HTML part as Markdown unless it has less than half the plain part's words; filler removed from plain bodies; `HTMLToText` removed
- [x] 1.3 Tests: the `newsletter.eml` fixture against its golden Markdown, structure cases (Gmail divs, escaping, nested ordered lists, image links, hidden blocks, unclosed tags, `pre`), active content dropped, a stub HTML part losing to the plain text

## 2. Web, docs and checks

- [x] 2.1 `web/src/lib/emailNotes.test.ts`: the notes parser reads the golden file as headings, lists, link marks and bold, with no syntax left in the text, stable after a write-back; `npx vitest run src/lib/emailNotes.test.ts`
- [x] 2.2 `docs/email.md` and CHANGELOG (Unreleased); `go test ./...`, `make openspec-validate`, `make check`
