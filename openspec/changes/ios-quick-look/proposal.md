# Proposal

## Why

Opening an image attached to a task in the iPhone app only offers to save it: since 1.5.0 every file the web app saves in a shell goes to the system's export sheet (`Downloads.swift`, shell-repairs D3), so a photo or a scanned PDF cannot be looked at without saving it first. A report from the owner's Discord (22 Nov) and #1477 item 9 ask to see attachments in the app.

## What Changes

- **In the iOS shell, an image or a PDF opens in Quick Look**, the system's preview, with its share button (Save Image, Save to Files, AirDrop, …). Every other file keeps the save dialog.
- The server's content type decides; a file the server sends as `application/octet-stream` (a type it does not render) and SVG keep the save dialog. The preview does not offer markup, so the file is never changed.
- `NSPhotoLibraryAddUsageDescription` (add only, never read) so Save Image from the preview does not end the app; translated in `InfoPlist.xcstrings`.

Out of scope: an in-app viewer for every platform and the browser (#1477 item 9, an owner decision).

## Capabilities

### Modified Capabilities

- `native-shells`: "Saving a file from the app" shows images and PDFs in the preview on iOS.

## Impact

- `mobile/ios/OpenTodo/Downloads.swift`, `mobile/ios/project.yml`, `mobile/ios/OpenTodo/Info.plist`, `mobile/ios/OpenTodo/InfoPlist.xcstrings`, `mobile/ios/OpenTodoTests/ShellDataTests.swift`, `docs/ios-app.md`.
- No web app, server, bridge or Android change. App Privacy stays "Data Not Collected": adding a chosen image to Photos is not collection.
