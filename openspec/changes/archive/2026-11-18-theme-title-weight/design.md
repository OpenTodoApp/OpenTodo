## Decisions

### D1: A top-level key, for older apps

`type` is a closed object: both validators refuse a key they don't know inside it. An unknown top-level key, on the other hand, is kept and ignored. A title weight inside `type` would therefore make every older app refuse a theme that uses it, and a synced theme chosen on a newer device would fall back to the default on an older one. As a top-level `titleWeight`, the older app keeps showing the theme, at the default title weight. The values are `400`, `600` and `700`: regular, semibold and bold. Medium (500) is left out because at list size it is hard to tell from regular, and a fourth segment would cut its label on a phone. Any other value is refused with the existing `type` code at path `titleWeight`.

### D2: One variable, applied to row titles

The resolved and the applied theme carry `titleWeight` only when it isn't 400. `themeCss` and the boot script write `--ot-title-weight`, and the applied-theme check accepts only 600 or 700, as it does for the list size. One rule, `[data-row-title] { font-weight: var(--ot-title-weight, inherit) }`, gives every list that uses the task row the weight. When it's unset the row keeps its own weight, so nothing changes for existing themes.
