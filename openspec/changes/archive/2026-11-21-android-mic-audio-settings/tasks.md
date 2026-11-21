# Tasks

## 1. Android shell

- [x] 1.1 `AndroidManifest.xml` declares `MODIFY_AUDIO_SETTINGS` next to `RECORD_AUDIO`; `store/permissions.txt` and `store/data-safety.md` list it. Verify: `WebMicrophoneTest.theManifestLetsTheWebViewOpenTheMicrophone` and `./gradlew :app:checkStoreMetadata` in `make android`.

## 2. Release

- [x] 2.1 Changelog fragment `changelog.d/Fixed/android-mic-audio-settings.md`. Verify: `make repo-check`.
- [ ] 2.2 On an Android phone with the debug APK from this change's CI run: Settings → Capture → Voice capture → This server's speech service, then Quick Add → microphone. The green microphone indicator appears, speaking inserts the text, and the Privacy Dashboard lists a microphone access by OpenTodo.

---

Shipped in 1.6.0; device check moved to the owner's list (the board task "Owner: device checks from shipped changes").
