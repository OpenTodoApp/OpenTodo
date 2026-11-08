# App Privacy (App Store Connect)

Answers for App Store Connect → App Privacy, kept next to the code so a change to the app's behaviour changes them in the same pull request. The Android counterpart is `mobile/android/store/data-safety.md`.

- **Do you or your third-party partners collect data from this app?** No. "Data Not Collected".
- **Why:** the app talks only to the OpenTodo server the user enters on the first screen, which the user or their organisation runs. Nothing is sent to the developer or to any third party. Apple defines "collect" as transmitting data off the device in a way that lets the developer or a third party access it beyond what is needed to serve a request in real time; the user's own server is neither.
- **Third-party SDKs:** none. The app links only Apple's frameworks (`make ios` fails on anything else).
- **Tracking:** none. `NSPrivacyTracking` is false and no tracking domain is listed.
- **Stored on the device:** the server address (`UserDefaults`), the next seven days of reminders and the Today widget's last publication (the App Group container), a share waiting for the app (the App Group container, deleted after the hand-over), and, when the user turns on Face ID unlock, the account key in the Keychain under a biometric access control. "Change server" deletes all of it.
- **Privacy manifests:** `OpenTodo/PrivacyInfo.xcprivacy` declares `UserDefaults` (CA92.1, the app's own settings) and file metadata (C617.1, the size of shared files in the App Group container). `OpenTodoShare/PrivacyInfo.xcprivacy` declares file metadata (C617.1) for the same check in the share extension. The widget reads one file and uses no API that needs a reason.
- **Privacy Policy URL:** required by App Store Connect even for apps that collect nothing: `https://open-todo.app/privacy`. That page covers the Android app today; it needs an iPhone section (the list above) before the first App Store submission.
