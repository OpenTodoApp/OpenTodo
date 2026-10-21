## ADDED Requirements

### Requirement: Icon catalogue
The icons a person can choose for their own things (projects and sections) SHALL come from one catalogue, a curated subset of the app's icon set of at least 300 icons. Each entry SHALL have a stable name (lowercase letters, digits and hyphens), one category, and search keywords. A name, once in a released catalogue, SHALL never be removed or given a different picture; a picture that changes meaning gets a new name. The catalogue SHALL be defined once in the repository; the server SHALL hold an identical list of names, and a test SHALL fail when the two differ.

The icons of the interface itself SHALL be available without loading the catalogue. The rest of the catalogue SHALL load only when a picker opens or when something stored names an icon outside the interface icons, and SHALL work offline once loaded. Until it has loaded, and for any name the device does not know (written by a newer client), the place of the icon SHALL show the fallback of what carries it (a project's colour dot, nothing before a section title), and SHALL never show an error, a broken image or an empty box.

The picker SHALL search as the person types, matching the name, the keywords and the category, with category names in the interface language. It SHALL list results grouped by category, offer "No icon" first, show the current choice as selected, and be fully usable from the keyboard (type to filter, arrows to move, Enter to pick, Esc to close without a change).

#### Scenario: Find an icon by a keyword
- **WHEN** the user opens the icon picker of a project and types "dog"
- **THEN** the results include the paw and dog icons under their category, and Enter on the first result sets it as the project's icon

#### Scenario: Category names in the interface language
- **WHEN** the interface is in Italian and the user types "cibo" in the picker
- **THEN** the icons of the Food category are listed

#### Scenario: Icon from a newer client
- **WHEN** a project carries an icon name that is not in this device's catalogue
- **THEN** the sidebar and the page header show the project's colour dot, and the stored name is kept unchanged

#### Scenario: Catalogue offline
- **WHEN** the catalogue has been loaded once and the device goes offline, then the user opens the icon picker
- **THEN** the picker lists and searches the whole catalogue without a network request

#### Scenario: Server list drifts from the catalogue
- **WHEN** a contributor adds an icon to the catalogue without regenerating the server's list
- **THEN** the test suite fails and names the icon missing on the server side
