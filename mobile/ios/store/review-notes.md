# Notes for App Review and Beta App Review

Paste into App Store Connect → the version's **App Review Information** → Notes, and into **TestFlight → Test Information** → Beta App Review notes before inviting external testers. Tick "Sign-in required" and enter the review account (`appreview@open-todo.app`; the owner keeps the password and enters it there, never in this repository).

---

OpenTodo is a client for OpenTodo, an open-source task manager that people run on their own server. The app asks for the server's address on its first screen.

For this review we run a server at review.open-todo.app with a reviewer account that has sample content and a project ("Household") shared by a second user, so every feature is available:
1. On the first screen, enter review.open-todo.app and tap Connect.
2. Sign in with the user name and password in the review information.

Features to try: add a task (quick add understands "tomorrow 3pm"), reminders (allow notifications when asked), the share sheet (share a link from Safari to OpenTodo), the Today widget, the shared project "Household" with its assignments, and Settings. Face ID unlock applies only to accounts with end-to-end encryption, which can be turned on in Settings → Encryption.

The public demo (demo.open-todo.app, "Try the demo") also works without an account, but it turns off sharing and settings.

Accounts are created on each person's own server, by the person who runs it. The app creates no accounts and offers no sign-up, so there is no account to delete in the app. Signing in uses the server's own accounts or the identity provider its owner set up.

What the app adds to the web page:
- Reminders scheduled on the phone as local notifications, with Snooze and Dismiss
- A share extension: links, text, photos and files from other apps become a new task
- A Today widget
- Face ID or Touch ID unlock of an end-to-end encrypted account (the key stays in the Keychain)
- Microphone (voice notes) and camera (photos for a task) only when the person uses them

The app collects no data and contacts nothing but the server the person enters.
