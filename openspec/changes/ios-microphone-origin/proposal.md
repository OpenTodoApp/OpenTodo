# Proposal

## Why

The requirement "Microphone for voice capture" covers the Android shell only. The Android app grants audio capture to a page of the configured server, never grants the camera from that request, and refuses a page of another origin without a prompt. The iPhone app makes no decision of its own. So WebKit's default applies: any page in the web view, including a sign-in provider's page or a frame it embeds, can ask for the microphone or the camera, and the person gets WebKit's prompt for each one. The server's own page gets that prompt too, on top of the app's microphone permission.

## What Changes

- **The iPhone app decides capture requests as the Android app does.** It grants the microphone when both the asking frame and the top-level page are the configured server's, without WebKit's prompt. iOS still asks once for the app's microphone (`NSMicrophoneUsageDescription`). It refuses the camera, and any request from another origin, without a prompt. WebKit decides a request as a whole, so a request for the camera and the microphone together is refused on iOS. Android grants the microphone part of it.
- **The first-run sign-in screen** (a login wall in front of the server) and the hidden background run refuse every capture request.
- **One fixture of cases**, `mobile/android/app/src/test/resources/microphone/cases.json`, is read by Android's `WebMicrophoneTest` and the iOS `MediaCaptureTests`.

Out of scope: the `microphone` bridge capability (the web app asking the shell before it records) on iOS. Android keeps it; iOS doesn't list it yet.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: "Microphone for voice capture" covers the iPhone app too.

## Impact

- `mobile/ios/OpenTodo/ShellView.swift` (`MediaCapture`, the `WKUIDelegate` capture decision), `mobile/ios/OpenTodo/SetupView.swift` (the sign-in sheet refuses).
- `mobile/android/app/src/test/java/app/opentodo/WebMicrophoneTest.kt`, `mobile/ios/OpenTodoTests/ShellTests.swift` (`MediaCaptureTests`), the new fixture.
- No server, web or bridge change.
