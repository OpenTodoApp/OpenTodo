## MODIFIED Requirements

### Requirement: Theme document format
A theme SHALL be a JSON document carrying a format version (an integer, 1 for this change), an id, a name, an author, a licence, an optional source given as text, a kind (`light` or `dark`), seeds (canvas, surface, text and accent, and optionally the success, warning, danger and info hues), and optionally explicit values for any token of the closed list of semantic tokens (surfaces, the four text tones, lines, accent steps, status steps, priorities p1 to p4 with their soft steps, the solid step of each of the 12 label hues, scrim, highlight and charts), a bar colour, a radius scale of five steps (0 to 20 px each) and a type choice (the bundled typeface, the system, serif or monospace stack, or a font installed on the device by name; and a list text size of 13, 14 or 15 px). A document MAY carry a top-level `$schema`, the address of the format's JSON Schema for editors, as text of at most 300 characters; it SHALL never be fetched by the app or the server. Colours SHALL be written as `#rrggbb` or as an OKLCH value inside the sRGB gamut, with transparency allowed only on the scrim. A document SHALL be at most 16 KB. The app SHALL refuse a document that breaks these rules, SHALL keep and ignore a token name it does not know, and SHALL never read a URL, a CSS expression or a font from another host out of a document; the source is shown as text and never fetched. The format SHALL be published as a JSON Schema with documentation of every key and token, and the app and the server SHALL accept and refuse exactly the same shared example documents.

#### Scenario: A valid document
- **WHEN** a document with format 1, kind `dark`, the four required seeds and no other values is read
- **THEN** it is accepted and every token of the list has a value after derivation

#### Scenario: A document that tries to carry CSS
- **WHEN** a document gives the canvas as `url(https://example.com/x.png)` or a token as `var(--ot-text)`
- **THEN** it is refused as invalid, nothing is applied and no request leaves the device

#### Scenario: Unknown token from a newer app
- **WHEN** a document carries a token `hue-amber` that this app does not know
- **THEN** the document is accepted, the token is ignored when applying, and it is still in the document when the document is exported or synced

#### Scenario: Too large
- **WHEN** a document is 17 KB
- **THEN** it is refused as too large in the app and on the server

#### Scenario: Shared examples
- **WHEN** a contributor makes the app accept an example that the server refuses
- **THEN** the shared example test fails naming the file and which side disagreed

#### Scenario: A schema address
- **WHEN** a document carries `"$schema": "https://raw.githubusercontent.com/OpenTodoApp/OpenTodo/main/docs/themes/opentodo-theme.schema.json"`
- **THEN** the app and the server accept it and neither requests the address; a `$schema` that is a number is refused by both
