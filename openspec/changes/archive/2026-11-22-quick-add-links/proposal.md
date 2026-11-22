# Proposal

## Why

Issue #1743: a link typed or pasted into quick add stays in the title. To keep it as a link attachment, the user creates the task, opens it, chooses **Attach → Add a link…** and pastes the same URL again. Quick add already reads dates, projects and labels out of a line; a link is the same kind of thing, and the reporter asks for it to work like the date chip.

## What Changes

- **A link chip, on by default.** In quick add, an `http` or `https` URL in the line is recognised like a date: it gets a tint in the field and a dismissible chip labelled with the link's host (`example.com`, without `www.`). On save, the URL becomes a link attachment of the new task, named after its host like **Attach → Add a link…** names one, and leaves the title. `Review the mockup https://example.com/mockup tomorrow` creates **Review the mockup**, due tomorrow, with the mockup link in Attachments.
- **Same controls as every chip.** × on the chip, or Backspace twice at the end of the line, keeps the URL in the title. A URL inside double quotes is literal text. With parsing off, nothing changes.
- **Every quick add, and title editing.** The list's line, the phone's sheet, the capture screen, the command bar's Add mode and a multi-line paste: the same line makes the same task. Editing a title reads links typed during the edit, with the same chip and dismissal, and attaches them on commit; text that was in the title before the edit is never read, so existing titles keep their URLs. `POST /api/v1/quick-add/parse` reports the links additively (`fields.links`), and `ot add` attaches them, so the web, the CLI and the route agree under the shared vectors.
- **Limits.** At most 5 links per line become attachments; further ones stay in the title. A line that is only a URL keeps it as the title, with no chip. Trailing punctuation that ends a sentence (`.`, `,`, `;`, `:`, `!`, `?`, an unbalanced `)` or `]`) is not part of the URL, and leaves the title with it. A link equal to the origin of a shared page is not attached twice.
- **Offline and convergence.** The task and its link attachments are one local operation set, visible at once, uploaded together, converging like any attachment. Not **BREAKING**: no new op field, entity, route, mandatory env var or dependency.

Out of scope: links already in a title before an edit; routines, which keep URLs in their titles; fetching a page title for the chip or the attachment name (no outbound request); turning description links into attachments; changing **Attach → Add a link…**.

Roadmap: adds a `quick-add-links` row to 0.20 "Everywhere" ([ROADMAP.md](../../../../ROADMAP.md)), for [#1743](https://github.com/OpenTodoApp/OpenTodo/issues/1743).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `natural-language-capture`: a new requirement "Links in quick add" (the token, its chip, the limits, title editing, the route and `ot add`).
The new requirement states the route's `fields.links` and `ot add` too, so `attachments`, `http-api` and `cli-client` keep their requirements unchanged.

## Impact

- Parsers: `internal/quickadd` and `web/src/lib/nlp` get a link token behind a context option, pinned by `web/src/lib/nlp/quickadd.vectors.json`.
- Web: quick add's commit (`web/src/app/quickadd`) writes the attachment ops in the same `mutate()` as the task.
- Server: the parse route's response; `internal/cli` `ot add`. No sync or schema change.
- Docs: `docs/quick-add.md` (a Links row in the token table), `docs/attachments.md`.
