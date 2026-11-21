# Proposal

## Why

In the Android app, dictation in Quick Add fails at once with "voice capture is unavailable", although OpenTodo has the microphone permission. The same phone records in Chrome, and Android shows no microphone indicator for the app (GitHub issue [#1582](https://github.com/OpenTodoApp/OpenTodo/issues/1582)). The shell declares `RECORD_AUDIO` only. Chromium's Android audio manager, which the system web view uses, opens no recording device without `MODIFY_AUDIO_SETTINGS` as well: `getUserMedia` is rejected with an error other than a refusal, which the web app reads as "unavailable". Chrome declares both.

## What Changes

- **The Android shell declares `MODIFY_AUDIO_SETTINGS`.** It is a normal permission, granted at install with no prompt. The shell itself changes no audio setting.
- The store permission list (`store/permissions.txt`) and the data-safety table name it.

Out of scope: any change to how or when the shell asks for the microphone, and the iOS app.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: "Microphone for voice capture" names the second permission.

## Impact

- `mobile/android/app/src/main/AndroidManifest.xml`, `mobile/android/store/permissions.txt`, `mobile/android/store/data-safety.md`.
- No size change; no server, web or data change.
