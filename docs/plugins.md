---
title: Plugins
summary: Built-in plugins add commands to OpenTodo; each has a switch in Settings → Plugins that follows your account to every device.
audience: user
section: Reference
specs: [settings-navigation]
screens: [settings/plugins]
order: 65
---
# Plugins

Some features ship as **plugins**: small, built-in modules that add a command or two to the palette. A plugin is part of the app itself — nothing is downloaded when you turn one on, and nothing runs until one of its commands is used.

## The Plugins section

**Settings → Plugins** lists every built-in plugin with one line about it and a switch:

- Every plugin is on until you turn it off.
- The switches are account settings: turning a plugin off on your computer turns it off on your phone at the next sync, and turning it off works offline like every other preference.
- Turning a plugin off never deletes anything; it only removes the plugin's commands from the palette.

## Commands

A plugin's commands appear in the search and commands palette (`Ctrl`/`⌘`+`K`) and are found by name like every other command. As soon as a plugin is switched off, its commands leave the palette on every device.

## Adding a plugin

Plugins live in the source of this repository, under `web/src/plugins/`: one folder per plugin with a manifest (an id, a name, a one-line description and its commands), registered in `web/src/plugins/registry.ts`. A test fails when a folder is not registered, an id is duplicated or the copy breaks the settings rules. To contribute a plugin, start with an OpenSpec change describing what it does and open a pull request like any other code change.
