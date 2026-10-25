---
title: Account security
summary: Sign in with a passkey, add two-factor authentication, change your password and check where your account is signed in.
audience: user
section: Guides
specs: [account-access, passkey-auth, user-administration]
screens: [settings/password#change-your-password, settings/security#sign-in-with-a-passkey, settings/sessions#check-recent-sign-ins]
order: 110
card: settings-security
---
# Account security

<picture><source srcset="images/settings-passkeys-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/settings-passkeys-light.webp" alt="Settings, Security section with the Passkeys card and an Add passkey button."></picture>

A passkey makes signing in quicker and safer, and two-factor authentication adds a second lock to your password. All of it lives in **Settings** and involves nobody outside your server.

These settings need a connection to your server; offline they're read-only.

## Sign in with a passkey

A passkey lets you sign in with your fingerprint, face or device PIN instead of typing a password. It can't be phished or reused on another site, and your password keeps working as a fallback.

1. Open **Settings → Account** and find the **Passkeys** card.
2. Select **Add passkey** and give it a name you'll recognise, like "Work laptop".
3. Confirm with your fingerprint, face or PIN when your device asks.

Next time, choose **Sign in with a passkey** on the sign-in screen, or pick it from the suggestions in the email field.

<picture><source srcset="images/signin-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/signin-light.webp" alt="The sign-in screen with email and password fields and a Sign in with a passkey button below."></picture>

Add a passkey on a second device too, so losing one isn't a problem. You can rename or delete passkeys in the same list. One marked as suspicious looks like a copied passkey; delete it if you don't recognise the device.

No Passkeys card? Passkeys need a secure `https://` address on your server; ask whoever runs it.

## Turn on two-factor authentication

With two-factor authentication, signing in takes your password plus a six-digit code from an authenticator app on your phone. Set it up under **Settings → Account → Security → Two-factor authentication** and save the recovery codes it shows once. Signing in with a passkey skips the code. The steps are in [Two-factor authentication](two-factor.md).

### Remember this browser

When you enter a code, tick **Remember this device for 30 days** and that browser won't ask again for a month. See [Remember this browser](two-factor.md#remember-this-browser).

### Recovery codes

Each recovery code works once, in place of a code from the app, if you lose your phone. See [Recovery codes](two-factor.md#recovery-codes).

## Change your password

Open **Settings → Account**, select **Change password** in the **Password** card, enter your current password and a new one of at least 10 characters. Changing it signs you out everywhere else; the device you're on stays signed in and API tokens keep working.

Forgot it? If your server sends email, choose **Forgot password?** on the sign-in screen and enter your address: a reset link valid for 24 hours arrives by email, and the screen answers the same whether or not the address has an account. Otherwise ask the owner or an admin of your server for a reset link; an owner who can't receive mail: see [recovering owner access](self-hosting/docker.md#recovering-owner-access).

## Check recent sign-ins

**Settings → Account → Recent activity** lists sign-ins and token changes on your account from the last 90 days. If you see one you don't recognise, change your password, choose **Sign out everywhere** and tell your server's owner.

## Confirm it's you

Some changes, like creating an API token or turning off two-factor authentication, ask for your password or a code again unless you entered one in the last ten minutes, so someone who finds your unlocked laptop can't change them.

## Sign out

**Settings → Account → Security → Session → Sign out** ends your session on that device and removes your tasks from it. Unsent changes are uploaded first when you're online.

## More protection

- [End-to-end encryption](e2ee.md) encrypts your task titles, notes and comments on your devices, so even your server only stores scrambled text.
- If your server uses a company or family login (single sign-on), you can link it under **Settings → Account → Security → Linked accounts** and sign in with it.
