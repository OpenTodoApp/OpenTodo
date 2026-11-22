## MODIFIED Requirements

### Requirement: Saving a file from the app
When the web app saves a file in a shell, the shell SHALL open the phone's save dialog with the file's name and write the file where the user chooses. In the iOS shell, an image or a PDF SHALL be shown in the system's preview (Quick Look) instead, whose share button saves or sends it; the server's content type decides, a file the server sends as `application/octet-stream` and an SVG image SHALL get the save dialog as before, and the preview SHALL not edit the file. This SHALL hold for a file the web app makes on the device (a recovery key, recovery codes, an export of tracked time, a theme, a decrypted attachment) and for a file it fetches from the user's server (an export, an attachment, a server archive), and for no other address. A file SHALL be written whole or not at all: when the user cancels, storage runs out or the transfer breaks, nothing partial SHALL remain and the web app SHALL be able to tell the user it was not saved. The shell SHALL keep no copy after the save ends. Saving works offline for files made on the device, changes no task data and syncs nothing. A shell MAY offer the bridge capability `files` for files made on the device; the web app SHALL use it only when listed and SHALL otherwise save as a browser does. Its payload SHALL be part of the shared bridge fixtures.

#### Scenario: Recovery key on Android
- **WHEN** the user taps Download on the recovery key in the Android app
- **THEN** the save dialog opens with `opentodo-recovery-key.txt`, and the chosen folder holds the file with the key after the user confirms

#### Scenario: Export from the server on iPhone
- **WHEN** the user taps Download export (JSON) in the iOS app
- **THEN** the save dialog opens with `opentodo-export.json` and the file the server sent is saved, fetched with the app's own session

#### Scenario: Cancelled
- **WHEN** the user closes the save dialog without choosing a place
- **THEN** no file is written, the shell keeps no copy, and the app stays where it was

#### Scenario: Offline
- **WHEN** the phone is offline and the user downloads the recovery codes
- **THEN** the file is saved, since it is made on the device

#### Scenario: A foreign address
- **WHEN** a page asks to download from a host that is not the user's server
- **THEN** the shell saves nothing and treats the address as any foreign link

#### Scenario: A shell without the capability
- **WHEN** the web app runs in a shell that does not list `files`
- **THEN** it does not call the method and saves the way it does in a browser

#### Scenario: An image attachment on iPhone
- **WHEN** the user opens a photo attached to a task in the iOS app
- **THEN** the photo is shown in the system's preview, and its share button saves it to Photos or Files; closing the preview leaves no copy in the app
