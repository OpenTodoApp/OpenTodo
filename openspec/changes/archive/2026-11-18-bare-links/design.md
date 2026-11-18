## Decisions

### D1: A decoration, not a mark

The editor marks bare addresses with ProseMirror inline decorations (`<a class="bare-link" href rel target>`), recomputed when the document changes. Nothing is written to the note. The address rule is `bareUrls` in `markdown.ts`, factored out of the renderer's own branch, so the editor and the read-only views always agree on what counts as an address. Text inside a code mark, a code block or an existing link is skipped. The existing Ctrl/Cmd-click handler opens any `<a>`, so decorated addresses need nothing new.

### D2: Paste keeps the source of truth single

`markdownSlice` returns a pasted bare address as plain text instead of a link mark. `transformPasted` drops the link mark from any pasted link whose text equals its address, ignoring a trailing slash, so the result is the bare address again. A pasted link with different text, a deliberate label, is kept.
