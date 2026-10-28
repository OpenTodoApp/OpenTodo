## ADDED Requirements

### Requirement: Copy buttons work without https
Every Copy button SHALL put its text on the clipboard whether the app is opened over https, on localhost or over plain http at another address, using the Clipboard API where the browser offers it and the browser's copy command otherwise. A button SHALL confirm the copy only once the text is on the clipboard; when the browser refuses both ways, it SHALL say so and suggest copying by hand where the text is shown.

#### Scenario: MCP address over plain http
- **WHEN** the owner opens Settings → Integrations → AI assistants (MCP) at `http://192.168.1.10:8080` and clicks Copy URL
- **THEN** pasting gives `http://192.168.1.10:8080/mcp` and the button reads "Copied"

#### Scenario: Recovery key is not reported copied when it was not
- **WHEN** the browser refuses every way of copying and the user clicks Copy on the encryption recovery key
- **THEN** the panel does not mark the key as copied
