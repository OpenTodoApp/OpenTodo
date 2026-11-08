# Notes for App Review and Beta App Review

Paste into App Store Connect → the version's **App Review Information** → Notes, and into **TestFlight → Test Information** → Beta App Review notes before inviting external testers. No sign-in information is needed (leave "Sign-in required" off).

---

OpenTodo is a client for OpenTodo, an open-source task manager that people run on their own server. The app asks for the server's address on its first screen.

To review without a server of your own: enter demo.open-todo.app, then choose "Try the demo". That opens a private sandbox with sample tasks, with no account and nothing to type. The sandbox is deleted after a few hours.

Accounts are created on each person's own server, by the person who runs it. The app creates no accounts and offers no sign-up, so there is no account to delete in the app. Signing in uses the server's own accounts or the identity provider its owner set up.

What the app adds to the web page:
- Reminders scheduled on the phone as local notifications, with Snooze and Dismiss
- A share extension: links, text, photos and files from other apps become a new task
- A Today widget
- Face ID or Touch ID unlock of an end-to-end encrypted account (the key stays in the Keychain)
- Microphone (voice notes) and camera (photos for a task) only when the person uses them

The app collects no data and contacts nothing but the server the person enters.
