# Tasks

## 1. iOS app

- [x] 1.1 `Downloads.previews(mimeType:fileName:)` and Quick Look in `DownloadSaver` (data source, no editing, the file discarded when the preview closes); `NSPhotoLibraryAddUsageDescription` in `project.yml` and `Info.plist`, translated in `InfoPlist.xcstrings`. Verified by `DownloadsTests.testImagesAndPDFsAreShownFirst` in `make ios` (the iOS job).

## 2. Checks

- [ ] 2.1 On an iPhone: open a photo and a PDF attached to a task (the preview shows them; Save Image adds the photo to Photos after the system's question), then the recovery key (the save dialog as before).

## 3. Docs and release

- [x] 3.1 `docs/ios-app.md` "Saving files". Verified by `make docs`, `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Changed/ios-quick-look.md`.
