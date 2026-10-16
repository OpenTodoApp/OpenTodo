---
title: Invite people
summary: Invite links that bring one person into a project, who may create accounts with them, and server invitations for people who have no account yet.
audience: user
section: Guides
specs: [invitations, project-sharing]
screens: [settings/members#invite-someone-new, settings/project-invites#who-can-bring-new-people]
order: 71
---
# Invite people

<picture><source srcset="images/share-dialog-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/share-dialog-light.webp" alt="The Share dialog for Home renovation: an email field, a role menu set to editor, and the member list with the owner and one editor."></picture>

Sharing by email reaches only people with an account on your server. Everyone else gets an invite link from the Share dialog or a server invitation from Settings; [Sharing and comments](sharing.md) has the overview.

## Invite with a link

An invite link adds one person to the project, whether or not they have an account yet.

1. Open **Share** and select **Create a link…** under **Invite with a link**.
2. Pick the role they get. Owners can also invite admins; admins can invite viewers and editors.
3. Optionally enter their email: then only an account with that address can use the link.
4. Choose how long it stays valid (1 hour to 30 days, 7 days by default) and select **Create link**.
5. Select **Copy link** and send it yourself. If your server sends email and you entered an address, **Send by email** (on by default) mails it for you; the dialog says where it went and still shows the link once.

The link is shown only once and works once. The dialog lists the links still waiting, with their role, email, expiry and creator; **Revoke** stops one from working. Creating and revoking links need a connection.

When the person opens the link they see who invited them, the project and the role:

- **Already have an account?** They select **Sign in to join**, sign in (with single sign-on too), and select **Join project**. Someone already signed in just selects **Join project**.
- **New to the server?** They select **Create an account**, choose a name and password, and land in the project. This option appears only when the link is allowed to create accounts (see below). Otherwise the page tells them to get an account on the server first, then come back and sign in.

A link stops working when it expires, is revoked or has been used, when the project is deleted, or when the person who created it is no longer the project's owner or an admin. Someone who is already a member is told so, and the link stays unused for whoever it was meant for.

### Who can bring new people

New accounts are created through a project link only when one of these is true:

- the link was created by the **owner or an admin of the server**;
- open sign-up is on for the server;
- the server owner switched on **Members can invite new people with project links** in **Settings → People → Project invite links**. It is off by default.

When none applies, the Share dialog says so under the new link, which then works only for people who already have an account. The switch is checked when a link is used, so changing it also affects links already sent.

## Invite someone new

Sign-up on an OpenTodo server is closed by default. The quickest way to bring someone into one project is an [invite link](#invite-with-a-link). To invite someone to the server without a project, as its owner or an admin, go to **Settings → People → Members**, optionally enter their email, choose how long the link stays valid, and select **Create invitation**. Copy the link and send it yourself, or, if the server sends email and you entered their address, leave **Send by email** on. The link works once.

<picture><source srcset="images/members-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/members-light.webp" alt="Settings, Members section: an email field, an expiry menu set to 7 days, a Create invitation button, and a list with one pending and one accepted invitation."></picture>

If you're not an admin of the server and your invite link can't create accounts, ask whoever runs it to invite the person, or to switch on **Members can invite new people with project links**. Once they've joined, you can share projects with them yourself.
