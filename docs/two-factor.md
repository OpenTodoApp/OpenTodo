---
title: Two-factor authentication
summary: Add a six-digit code from an authenticator app to your sign-in, remember a browser for 30 days, and keep recovery codes for when you lose your phone.
audience: user
section: Guides
specs: [mfa]
screens: [settings/two-factor#turn-on-two-factor-authentication]
order: 111
---
# Two-factor authentication

<picture><source srcset="images/settings-security-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/settings-security-light.webp" alt="Settings, Two-factor authentication section with the status Off and a Set up two-factor authentication button."></picture>

Two-factor authentication is the second lock on your account, next to [passkeys and your password](account-security.md). It needs a connection to your server; offline it's shown read-only.

## Turn on two-factor authentication

With two-factor authentication, signing in takes your password plus a six-digit code from an authenticator app on your phone. Any app that supports time-based codes works; your server makes and checks the codes itself, without contacting anyone.

1. Open **Settings → Account → Two-factor authentication** and select **Set up two-factor authentication**.
2. Scan the QR code with your authenticator app, or type in the key shown under it.
3. Enter the six-digit code the app shows.
4. Save the **recovery codes** that appear. They're shown only once: download them as a text file or write them down and keep them somewhere safe.

From then on, sign-in asks for a code after your password. Signing in with a passkey skips the code, because the passkey already checks it's you.

### Remember this browser

When you enter a code, you can tick **Remember this device for 30 days** so that browser doesn't ask again for a month. The list of remembered browsers is under **Two-factor authentication**, where you can forget them.

### Recovery codes

Each recovery code works once, in place of a code from the app. Use one if you lose your phone. Settings shows how many you have left and lets you generate a new set, which replaces the old one.

If you lose both your phone and your recovery codes, the owner of your server can reset your two-factor authentication.

Your server's owner can also make two-factor authentication required. If so, you'll be asked to set it up when you sign in, and you can't turn it off.

Turning two-factor authentication off asks for your password or a code again, unless you entered one in the last ten minutes ([Confirm it's you](account-security.md#confirm-its-you)).
