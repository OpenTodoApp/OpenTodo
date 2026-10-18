---
title: "Settings: You"
summary: The Account and Appearance sections of Settings, your profile, session, password, two-factor authentication, passkeys, encryption, and the mode, theme, density and sidebar.
audience: user
section: Guides
specs: [appearance-preferences]
screens: [settings/account#account, settings/appearance#appearance, settings/session#account, settings/activity#account, settings/linked-accounts#account]
order: 141
---

# Settings: You

<picture><source srcset="images/settings-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/settings-light.webp" alt="Settings with the Account section open: the profile card, then the Session, Password, Two-factor authentication and Passkeys cards."></picture>

The **You** group of [Settings](settings.md) holds your account and how the app looks for you.

## Account

- **Profile**: your initials, name, email and role.
- **Session**: **Sign out of this device** removes your tasks from this device; changes not yet sent are uploaded first, and the app asks you to confirm. **Sign out everywhere** signs out every device and revokes your API tokens and app passwords.
- **Password**: **Change password** opens the form. See [Account security](account-security.md#change-your-password).
- **Two-factor authentication**: a code from your phone on top of your password. The badge shows whether it's on, and the card warns when only a few recovery codes remain. See [Two-factor authentication](two-factor.md).
- **Passkeys**: sign in with your fingerprint, face or device PIN. See [Account security](account-security.md#sign-in-with-a-passkey).
- **Linked accounts**: connect a single sign-on login, if your server offers one.
- **End-to-end encryption**: encrypt your task text on your devices, and keep its recovery key. See [End-to-end encryption](e2ee.md).
- **Recent activity**: sign-ins and token changes from the last 90 days.


## How you work

**How you work** chooses how much the app shows [Open Loops](method/overview.md), its method for everything on your mind: **Lists only**, **Companion** (screens name the move they serve) or **Open Loops first** (the Loop home and a sidebar by the Places). It syncs to your devices and never changes a task; see [Set up in ten minutes](method/set-up.md).
## Appearance

Four choices that follow your account to every device, also when you change them offline:

- **Mode**: **System** follows your device's light or dark setting (the default), **Light** and **Dark** keep the app that way whatever the device says.
- **Theme**: the colour of buttons, links, the focus ring and selected items: **Emerald** (the default), **Blue**, **Indigo**, **Violet**, **Rose**, **Orange**, **Teal** or **Graphite**. Each tile previews its theme; with the keyboard, the arrow keys move between them. On a phone the tiles are one row of swatches you can scroll sideways.
- **Density**: **Comfortable** (the default) or **Compact**, which makes task rows, group headers and the sidebar tighter. On a touch screen every target stays full size in both.
- **Sidebar**: one switch per destination of the sidebar's **More** group (Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter). A destination you switch on moves up next to Inbox, Today, Upcoming and Calendar.

Mode and theme apply at once, without a reload. They never change other people's app. Priority colours (P1 to P4), warnings and errors, and the colours of your projects, labels and views keep their meaning in every theme. The installed app's title bar follows the theme too; the splash screen when it starts stays neutral, because it is the same for everyone on the server. Every theme meets the same contrast rules in light and dark.
