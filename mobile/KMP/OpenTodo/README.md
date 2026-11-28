# OpenTodo KMP app

The shared module is the product code for Android and iOS. Put screens, connection and API logic, domain models, persistence contracts, and future task features in `shared/src/commonMain` first.

Platform-specific code belongs in the shared module's platform source sets only when an OS API is required:

- `shared/src/androidMain`: Android system browser, Android Keystore, and Android HTTP implementation.
- `shared/src/iosMain`: `ASWebAuthenticationSession`, Keychain, and iOS HTTP implementation.
- `shared/src/jvmMain`: desktop-only adapters needed to compile the development target.

The app projects are launch shells:

- `androidApp` owns the Android activity, manifest, app identity, and forwards deep-link callbacks to shared code.
- `iosApp` owns the SwiftUI launch point and Xcode project; its screen is the Compose UI from `shared`.
- `desktopApp` is a development target, not a separate product implementation.

Do not add product screens, API flows, or domain behavior to `androidApp` or `iosApp`. When adding a capability, start in `shared/commonMain` and add the smallest platform adapter under `shared/src/<platform>Main`.

## Run

- Android: `./gradlew :androidApp:assembleDebug`
- Desktop: `./gradlew :desktopApp:run`
- iOS: open `iosApp` in Xcode and run the app.

## Check

- Android host tests: `./gradlew :shared:testAndroidHostTest`
- Desktop tests: `./gradlew :shared:jvmTest`
- iOS simulator tests: `./gradlew :shared:iosSimulatorArm64Test`
