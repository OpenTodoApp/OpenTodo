---
title: "Settings: You"
summary: The Account and Appearance sections of Settings, your profile, session, password, two-factor authentication, passkeys, encryption, and the mode, theme, density, sidebar and how tasks open.
audience: user
section: Guides
specs: [appearance-preferences, account-profile]
screens: [settings/account#account, settings/appearance#appearance, settings/session#account, settings/activity#account, settings/linked-accounts#account]
order: 141
---

# Settings: You

<picture><source srcset="images/settings-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/settings-light.webp" alt="Settings with the Account section open: its pages Profile, Security, Recent activity and End-to-end encryption, each with its state."></picture>

The **You** group of [Settings](settings.md) holds your account and how the app looks for you.

## Account

- **Profile**: your initials, name, email and role, and [how you work](#how-you-work).
- **Security**:
  - **Session**: **Sign out here** removes your tasks from this device; changes not yet sent are uploaded first, and the app asks you to confirm. **Sign out everywhere** signs out every device and revokes your API tokens and app passwords.
  - **Password**: **Change password** opens the form. See [Account security](account-security.md#change-your-password).
  - **Two-factor authentication**: a code from your phone on top of your password. The badge shows whether it's on, and the card warns when only a few recovery codes remain. See [Two-factor authentication](two-factor.md).
  - **Passkeys**: sign in with your fingerprint, face or device PIN. See [Account security](account-security.md#sign-in-with-a-passkey).
  - **Linked accounts**: connect a single sign-on login, if your server offers one. If the owner turned it on, your picture at the provider becomes your profile picture when you sign in or link; a picture you upload yourself is never replaced, and one you remove is not fetched again. See [Single sign-on](self-hosting/sso.md#profile-pictures-from-the-provider).
- **End-to-end encryption**: encrypt your task text on your devices, and keep its recovery key. See [End-to-end encryption](e2ee.md).
- **Recent activity**: sign-ins and token changes from the last 90 days.
- **Invitations**: answer people who asked to add you to a project or workspace.

## How you work

**How you work** chooses how much the app shows [Open Loops](method/overview.md), its method for everything on your mind: **Simple lists**, **Lists with method hints** or **Full Open Loops method** (the Loop home first). It syncs and never changes a task; see [Set up in ten minutes](method/set-up.md). **Daily focus** is **Three tasks** or a [Bento](method/rhythms.md#bento), with its **Order** while Bento is on. **Energy levels** adds [task energy](method/set-up.md#energy-levels), **Formatting button** [the formatting row](formatting-row.md).

## Appearance

Three pages, **Theme and density**, **Sidebar** and **Task details**. These choices follow your account to every device, also offline:

- **Mode**: **System** follows your device's light or dark setting (the default), **Light** and **Dark** keep the app that way whatever the device says.
- **Theme**: the colour of buttons, links, the focus ring and selected items: **Emerald** (the default), **Blue**, **Indigo**, **Violet**, **Rose**, **Orange**, **Teal**, **Graphite** or [**Custom**](custom-accent.md). Each tile previews its theme; the arrow keys move between them. On a phone the tiles are one scrollable row.
- **Density**: **Comfortable** (the default) or **Compact**, which makes task rows, group headers and the sidebar tighter. On a touch screen every target stays full size in both.
- **Task rows**: [one line or detailed](row-layouts.md).
- **Haptic feedback**: on a phone or tablet that can vibrate, a short tick when you complete a task or pick one up with a long press. On by default; turning it off on one device turns it off on all of them. Computers without vibration do not show the switch.
- **Open tasks** (Task details): **As a page** (the default) or **In a side panel** beside every list, from 1024 px wide. See [The task page](task-panel.md#open-tasks-beside-the-list).
- **Sidebar**: numbers on every list or only on Inbox and Today, the order of the main destinations, and which **More** destinations sit next to them. See [Sidebar counts and order](sidebar-counts-and-order.md).

Mode and theme apply at once, without a reload. They never change other people's app. Priority colours (P1 to P4), warnings and errors, and the colours of your projects, labels and views keep their meaning in every theme. The installed app's title bar follows the theme too; its splash screen stays neutral. Every theme meets the same contrast rules in light and dark.
