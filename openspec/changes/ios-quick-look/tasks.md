# Tasks

## 1. iOS app

- [x] 1.1 `Downloads.previews(mimeType:fileName:)` and Quick Look in `DownloadSaver` (data source, no editing, the file discarded when the preview closes); `NSPhotoLibraryAddUsageDescription` in `project.yml` and `Info.plist`, translated in `InfoPlist.xcstrings`. Verified by `DownloadsTests.testImagesAndPDFsAreShownFirst` in `make ios` (the iOS job).

- [x] 1.2 In a shell, the web app asks the server for an attachment of an inline type without `download=1`, so the shell gets its real type (Download keeps `download=1`). Verified by `web/src/lib/attachmentOpen.test.ts`.

## 2. Checks

- [ ] 2.1 On an iPhone: open a photo and a PDF attached to a task (the preview shows them; Save Image adds the photo to Photos after the system's question), then the recovery key (the save dialog as before). On Android, open an attached photo: the save dialog as before.

## 3. Docs and release

- [x] 3.1 `docs/ios-app.md` "Saving files". Verified by `make docs`, `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Changed/ios-quick-look.md`.
