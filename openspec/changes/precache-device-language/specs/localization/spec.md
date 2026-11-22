## MODIFIED Requirements

### Requirement: Catalogs load on demand and work offline
Only the catalog of the active language SHALL be loaded; English SHALL need no catalog. Catalogs SHALL be served by the user's own server. The service worker SHALL store a language's catalog on the device the first time the app loads it, checked against the app's file list like every file it installs, and SHALL install the catalogs of the languages the device already holds with every update, so a language the device has used switches offline. The service worker SHALL NOT download the catalog of a language the device has never used. When a catalog cannot be loaded, the interface SHALL keep its current language and say so where the language is chosen. No operation is written, so sync and convergence are unaffected.

#### Scenario: English costs nothing
- **WHEN** the language is English or resolves to English
- **THEN** no catalog is downloaded

#### Scenario: Only the device's language at first install
- **WHEN** a phone set to German opens the app for the first time
- **THEN** the German catalog is downloaded and stored, and no other language's catalog is downloaded

#### Scenario: Switch offline in the installed app
- **WHEN** the installed app has shown Spanish once, the user switched back to English, and later, offline, switches to Spanish
- **THEN** Spanish is shown from the stored catalog

#### Scenario: Update keeps the language offline
- **WHEN** the installed app in German updates to a new version and is then opened offline
- **THEN** the interface is in German, from the new version's catalog installed with the update

#### Scenario: Catalog unavailable
- **WHEN** the device is offline and the user switches to a language whose catalog this device has never loaded, such as German
- **THEN** the interface stays in its current language, the Language panel explains that the catalog could not be loaded, and the preference is still saved and applied when the catalog loads later
