# Export compliance

`ITSAppUsesNonExemptEncryption` is `NO` in `OpenTodo/Info.plist` (set in `project.yml`), so App Store Connect asks no encryption questions per build and TestFlight builds become available without a manual answer. This file is the reasoning, so it can be checked again when the app changes (OpenSpec change `ios-distribution`, D7).

**What encrypts in the app, and whose code it is:**

| Use | Implementation |
| --- | --- |
| HTTPS to the user's server | iOS (`URLSession`, WebKit) |
| The account key behind Face ID | the Keychain, under a biometric access control |
| End-to-end encryption of an encrypted account (AES-GCM, AES-KW, PBKDF2, HKDF, SHA-256) | WebKit's Web Crypto (`crypto.subtle`), called by the web app the server sends; the app bundles none of that code |

The app contains no encryption code of its own and no third-party library (`make ios` checks the linked libraries). Every algorithm is a published standard, reached only through Apple's operating system.

**Why `NO` is the answer.** Apple's rule for the key: an app that uses only the encryption built into Apple's operating systems, or only standard encryption for authentication and for protecting the user's own data, does not use non-exempt encryption and needs no export documentation. Both apply here: HTTPS and the Keychain are the system's, and the end-to-end encryption protects the user's own tasks with standard algorithms through the system's Web Crypto. Nothing in the app is a proprietary or non-standard algorithm, and the app offers no encryption as a feature to other apps or data.

**Check again when:** the app bundles a crypto library, implements an algorithm itself (for example in Swift instead of Web Crypto), or encrypts anything that is not the user's own data or its transport. Then the answer may become `YES`, with Apple's questionnaire and possibly a year-end self-classification report.
