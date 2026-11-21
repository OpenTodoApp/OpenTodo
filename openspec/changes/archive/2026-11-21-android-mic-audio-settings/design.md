# Design

## D1. Declare the permission the web view needs

The web view's audio capture goes through Chromium's `AudioManagerAndroid`, which refuses to open an input device unless the app holds both `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` ("Requires MODIFY_AUDIO_SETTINGS and RECORD_AUDIO. No audio device will be available for recording"). `onPermissionRequest` and the runtime prompt stay as they are. `MODIFY_AUDIO_SETTINGS` has normal protection level: Android grants it at install and shows no prompt. Play lists it among the app's permissions; no declaration form is needed.

A unit test reads the manifest and fails without the permission. The real check is on a phone (task 2.2): no emulator in CI records from a microphone.

## Data model

None.
