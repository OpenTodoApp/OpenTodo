## Context

Email to task wrote the plain part, or HTML converted to plain text with links in parentheses. The notes editor parses a description as Markdown (`web/src/lib/richtext.ts` `parseMarkdown`) when it builds the note, so Markdown is the richest format the server can hand over without a new field.

## Decisions

### D1. Markdown in the subset the notes parse

The converter emits only what `parseMarkdown` understands: `#` headings, `**bold**`, `_italic_`, `~~strike~~`, `[text](url)`, `-` and `1.` lists with nested items indented by the parent marker's width, a newline as a line break and a blank line between paragraphs. Everything else (tables, quotes, images, code) becomes text and breaks. Link targets percent-encode space, `(` and `)`, because the notes parser ends a target at the first `)` or space. Literal formatting characters are escaped with a backslash (the parser's escape set), and a line that would start a heading or a list is escaped at its start. A golden file shared with a web test pins that the notes read the server's output as intended.

### D2. A small scanner instead of an HTML parser dependency

Mail HTML is tag soup; a tokenizer that finds tags outside quoted attribute values, skips comments and the content of non-text elements (counting nesting of the same name), and treats unknown tags as nothing is enough for text, emphasis, links and lists. `golang.org/x/net/html` would be more complete but is a new dependency for one feature; the scanner is about 300 lines, linear in the message, never fetches or runs anything, and keeps the 10 MB message limit.

### D3. Which part

HTML is preferred because it carries the structure; the plain part wins when the HTML has fewer than half its letters (link addresses not counted), so a mailer's stub HTML ("Hi") does not hide the real text. Hidden elements are recognised by their inline style, which is how newsletters hide preview text (no stylesheet is evaluated).

## Risks / Trade-offs

- Some mail renders slightly differently than in a mail client (layout tables flatten, images vanish) → the text, links and structure are what a task needs; the original stays in the mailbox.
- The description now contains Markdown punctuation for clients that show it raw (CalDAV, the API) → the syntax is the light Markdown people read as plain text, and links stay readable.

## Data, size and memory

No data model change. A few KB of binary; memory linear in the body, which is already bounded by the 10 MB message limit and cut to the value limit (`email-body-limit`).
