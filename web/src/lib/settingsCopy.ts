// The settings copy table (OpenSpec change settings-copy, design D1; settings-navigation
// "Settings copy"): the English text of every settings card, row, option and notice,
// keyed by the card's heading id without "-heading". Every text is a msg() literal, so
// the extractor and the catalogs see it; the panels read it through cardCopy(),
// rowCopy() and noticeCopy(), or pass an entry to t.rich() when it carries tags.
//
// The rule (settingsCopy.test.ts): a title or label has at most 4 words; a card, row
// or notice description is one line of at most 90 characters; an option at most 60.
// What does not fit goes to the guide section the card's `learnMore` screen opens.
// A description that depends on state is a record of named variants, each checked.
//
// It lives in src/lib, not src/app, so the design-system stories can read it too
// (web-layering: src/ui never imports src/app).
import { msg, t } from './i18n'
import type { TValues } from './i18n/catalog'

/** A text, or named variants of it chosen by state. */
export type CopyText = string | Readonly<Record<string, string>>

export interface RowCopyEntry {
  readonly label: string
  readonly description?: CopyText
}

export interface CardCopyEntry {
  readonly title?: string
  readonly description?: CopyText
  /** The Help screen id the card's Learn more opens. */
  readonly learnMore?: string
  readonly rows?: Readonly<Record<string, RowCopyEntry>>
  /** Choices of a choice card: a label and at most 60 characters. */
  readonly options?: Readonly<Record<string, { readonly label: string; readonly description: string }>>
  /** One-line notices shown in the card (offline notes, warnings, pointers). */
  readonly notices?: Readonly<Record<string, CopyText>>
}

export const SETTINGS_COPY = {
  // Settings → Account
  'how-you-work': {
    title: msg('How you work'),
    description: msg('How much the app shows its method, Open Loops. Synced; never changes a task.'),
    options: {
      lists: { label: msg('Lists only'), description: msg('OpenTodo as a plain task app, with no method words.') },
      companion: { label: msg('Companion'), description: msg('Your sidebar as it is; screens name the move they serve.') },
      first: { label: msg('Open Loops first'), description: msg('The Loop home first, a sidebar by the Places, a daily check.') },
    },
  },
  session: {
    title: msg('Session'),
    description: msg('This device is signed in to your server.'),
    learnMore: 'settings/session',
    rows: {
      device: { label: msg('Sign out here'), description: msg('Clears your tasks from this device after uploading unsynced changes.') },
      everywhere: { label: msg('Sign out everywhere'), description: msg('Every device, plus your API tokens and app passwords.') },
    },
  },
  password: {
    title: msg('Password'),
    description: msg('Changing it signs out your other sessions; this one stays signed in.'),
    learnMore: 'settings/password',
    rows: { password: { label: msg('Password'), description: msg('Used to sign in on new devices.') } },
    notices: {
      offline: msg('You are offline. Changing your password needs a connection to your server.'),
      changed: msg('Password changed. Your other sessions were signed out.'),
    },
  },
  mfa: {
    title: msg('Two-factor authentication'),
    description: msg('A six-digit code from an authenticator app after your password.'),
    learnMore: 'settings/two-factor',
    rows: {
      status: { label: msg('Status') },
      recovery: { label: msg('Recovery codes'), description: msg('Use one to sign in if you lose your phone. Each works once.') },
      off: {
        label: msg('Turn off'),
        description: {
          required: msg('Required by the server owner for your account, so it cannot be turned off.'),
          optional: msg('Sign-in needs only your password; remembered browsers are forgotten.'),
        },
      },
    },
    notices: {
      offline: msg('You are offline. Two-factor authentication needs a connection to your server.'),
      few: msg('Few recovery codes left. Generate a new set and store it safely.'),
    },
  },
  security: {
    title: msg('Passkeys'),
    description: msg('Sign in with your fingerprint, face or PIN instead of your password.'),
    learnMore: 'settings/security',
    rows: { count: { label: msg('Passkeys'), description: msg('Tied to <span>{domain}</span>.') } },
    notices: {
      domain: msg('Passkeys will not work at {host}: open the app at {link}, or set {variable} to {url}.'),
      offline: msg('You are offline. Managing passkeys needs a connection to your server.'),
      unsupported: msg('This browser does not support passkeys.'),
    },
  },
  linked: {
    title: msg('Linked accounts'),
    description: {
      on: msg('Sign in with {name} instead of a password.'),
      off: msg('Single sign-on is off on this server; your links are kept.'),
    },
    learnMore: 'settings/linked-accounts',
    notices: { offline: msg('Offline: linked accounts are managed on the server.') },
  },
  e2ee: {
    title: msg('End-to-end encryption'),
    description: msg('Your task text is encrypted on your devices before it syncs.'),
    learnMore: 'settings/encryption',
    rows: {
      status: { label: msg('Status') },
      passphrase: { label: msg('Passphrase'), description: msg('Your content is not re-encrypted; other devices keep working.') },
      forgot: { label: msg('Forgot your passphrase?'), description: msg('Your recovery key sets a new one and is then replaced.') },
      history: { label: msg('Plaintext history'), description: msg("Removes earlier versions of encrypted fields from the server's history.") },
      device: { label: msg('This device'), description: msg('Asks for your passphrase again before showing your tasks.') },
      off: { label: msg('Turn off encryption'), description: msg('Your content is synced in plaintext again.') },
      lost: { label: msg('Lost both keys?'), description: msg('Without your passphrase or recovery key, encrypted content cannot be recovered.') },
    },
  },
  activity: {
    title: msg('Recent activity'),
    description: msg('Sign-ins and token changes from the last 90 days; revoke tokens if one is not yours.'),
    learnMore: 'settings/sessions',
  },

  // Settings → Appearance
  appearance: {
    title: msg('Appearance'),
    description: msg('Light or dark, colour and row density, on all your devices.'),
    learnMore: 'settings/appearance',
    rows: {
      mode: { label: msg('Mode'), description: msg("System follows your device's light or dark setting.") },
      theme: { label: msg('Theme') },
      density: { label: msg('Density'), description: msg('Compact tightens rows, headers and the sidebar; touch targets stay full size.') },
      rows: { label: msg('Rows'), description: msg('Calm leaves out what the view says and keeps counts quiet; Detailed shows every chip.') },
    },
  },
  sidebar: {
    title: msg('Sidebar'),
    description: {
      standard: msg('Pick which More destinations sit next to Inbox, Today, Upcoming and Calendar.'),
      arranged: msg('Open Loops first arranges the sidebar; these choices apply in the other modes.'),
    },
    learnMore: 'settings/appearance',
  },

  // Settings → General
  language: {
    title: msg('Language'),
    description: msg('The language of the app on all your devices. Tasks are not translated.'),
    learnMore: 'settings/language',
    rows: { interface: { label: msg('Interface language') } },
    notices: { failed: msg('This language could not be loaded; your choice applies once it can be.') },
  },
  'start-view': {
    title: msg('Start view'),
    description: msg('The view this device opens on. Not synced.'),
    learnMore: 'settings/start-view',
    rows: { open: { label: msg('Open on launch') } },
  },
  'date-time': {
    title: msg('Date and time'),
    description: msg('How dates and times look and where weeks start, on all your devices.'),
    learnMore: 'settings/date-time',
    rows: {
      dateFormat: { label: msg('Date format') },
      timeFormat: { label: msg('Time format') },
      weekStart: { label: msg('Week starts on') },
      dayStart: { label: msg('My day starts at'), description: msg('Work done before this time counts for the previous day.') },
      preview: { label: msg('Preview') },
    },
  },
  calendar: {
    title: msg('Calendar'),
    description: msg('Working hours and day length for Day and Week, on this device.'),
    learnMore: 'settings/calendar',
    rows: {
      gridStart: { label: msg('Grid starts') },
      gridEnd: { label: msg('Grid ends') },
      dayLength: { label: msg('Day length'), description: msg('Your daily capacity; the Day view warns when planned work goes over it.') },
    },
  },
  keyboard: {
    title: msg('Keyboard'),
    description: msg('Every action has a shortcut; press ? to list them.'),
    learnMore: 'settings/keyboard',
    rows: {
      hints: { label: msg('Show shortcut hints'), description: msg('Print the keys in the app itself, not only in tooltips. This device only.') },
      vim: { label: msg('Vim keybindings'), description: msg('Normal, Insert and Command modes with counts, {kbd}, {kbd2} and {kbd3}. This device only.') },
      rowClick: { label: msg('Click a task to'), description: msg('Edit its title in place, or open its details beside the list. This device only.') },
    },
  },
  focus: {
    title: msg('Focus'),
    description: msg('The Focus timer: mode, lengths, breaks and sound. Synced to your devices.'),
    learnMore: 'settings/focus',
    rows: {
      mode: { label: msg('Timer mode'), description: msg('Pomodoro alternates work and breaks, Flowtime counts up, Countdown runs a set length.') },
      work: { label: msg('Work session'), description: msg('Pomodoro work length in minutes') },
      shortBreak: { label: msg('Short break') },
      longBreak: { label: msg('Long break') },
      longEvery: { label: msg('Long break after'), description: msg('Work sessions before a long break') },
      autoBreaks: { label: msg('Start breaks automatically') },
      autoWork: { label: msg('Start work automatically') },
      reminder: { label: msg('Break reminder'), description: msg('A notice on any screen after a long stretch of work without a break.') },
      remindAfter: { label: msg('Remind me after') },
      sound: { label: msg('Sound'), description: msg('A short tone when a session or a break ends, while the app is shown.') },
    },
  },

  // Settings → Notifications
  notifications: {
    title: msg('Notifications'),
    description: msg('Get reminders while the app is closed. Each device decides for itself.'),
    learnMore: 'settings/notifications',
    rows: {
      device: { label: msg('This device') },
      titles: { label: msg('Include task titles'), description: msg('Off: the push carries only encrypted ids and this device adds the title.') },
    },
    notices: {
      serverOff: msg('Push notifications are turned off on this server. Reminders are shown in the app.'),
      unsupported: msg('This browser cannot receive push notifications; installing the app may help.'),
      blocked: msg('Notifications are blocked in your browser settings; reminders still appear in the app.'),
      renew: msg('The push service stopped accepting notifications for this device.'),
    },
  },
  'email-digest': {
    title: msg('Weekly digest'),
    description: msg("An email on your review day with last week's numbers and what is due."),
    learnMore: 'settings/digest',
    rows: { email: { label: msg('Email me the digest'), description: msg('It names your tasks and projects and goes to your account’s email address.') } },
    notices: {
      offline: msg('The weekly digest is set on the server, so changing it needs a connection.'),
      demo: msg('The weekly digest is not available on this demo instance: it would send email.'),
      noEmail: msg('Needs outgoing email, set up by the server owner under Settings → Server.'),
      encrypted: msg('Not available with end-to-end encryption: the email would show your task titles.'),
    },
  },

  // Settings → Capture
  'quick-add': {
    title: msg('Quick add'),
    description: msg('How quick add reads what you type, on this device.'),
    learnMore: 'settings/quick-add',
    rows: {
      parse: { label: msg('Parse natural language'), description: msg('Dates and times, {project}, {label}, {p1}–{p4} and {estimate}; "quotes" keep text as is.') },
      order: { label: msg('Numeric dates like 12/11'), description: msg('Set on this device; it wins over your date format.') },
    },
  },
  'voice-settings': {
    title: msg('Voice capture'),
    description: msg('Speak a task instead of typing it, on this device.'),
    learnMore: 'settings/voice',
    rows: {
      dictate: {
        label: msg('Dictate tasks'),
        description: {
          supported: msg('A microphone in quick add, or {kbd}; nothing is saved until you press Enter.'),
          unsupported: msg('This browser has no speech recognition, so voice capture is not available here.'),
        },
      },
      lang: { label: msg('Recognition language') },
    },
  },
  capture: {
    title: msg('Capture'),
    description: msg('Save pages and selected text from your browser as tasks.'),
    learnMore: 'settings/capture',
    rows: {
      bookmarklet: { label: msg('Bookmarklet'), description: msg('Drag <strong>Add to OpenTodo</strong> to your bookmarks bar, then click it on any page.') },
      extension: { label: msg('Browser extension'), description: msg('For Chromium and Firefox, in the repository under {path}.') },
      phone: { label: msg('On a phone'), description: msg("Install the app and use your phone's share menu.") },
    },
    notices: { copied: msg('Copied. Create a bookmark and paste it as the address.') },
  },
  'email-inbox': {
    title: msg('Email to task'),
    description: msg('Send any email to your personal address and it becomes an Inbox task.'),
    learnMore: 'settings/email',
    rows: {
      address: { label: msg('Your address'), description: msg('Keep it private: anyone who knows it can add tasks. If it leaks, make a new one.') },
      create: { label: msg('Create tasks from email'), description: msg('Mail to your address becomes a task. Turn it off to pause and keep the address.') },
    },
    notices: {
      offline: msg('Email to task settings are available when you are online.'),
      operatorOff: msg('The server operator has not enabled email to task. See docs/email.md to set it up.'),
      copied: msg('Copied.'),
    },
  },

  // Settings → About
  about: {
    title: msg('About OpenTodo'),
    description: {
      version: msg('OpenTodo {version} · free and open source · no tracking, no telemetry.'),
      plain: msg('Free and open source · no tracking, no telemetry.'),
    },
    rows: {
      help: { label: msg('Help'), description: msg('The guides of this version, inside the app and offline.') },
      docs: { label: msg('Documentation'), description: msg('The same guides on the website, with setup and self-hosting.') },
      website: { label: msg('Website'), description: msg('News, guides, comparisons and what is new in each release.') },
      feedback: { label: msg('Feedback and problems'), description: msg('Open an issue on GitHub. Every report is read.') },
      community: { label: msg('Community'), description: msg('Questions, ideas and other people who use OpenTodo, on Discord.') },
      source: { label: msg('Source code'), description: msg('A star on GitHub helps other people find it.') },
      welcome: { label: msg('Welcome note'), description: msg('The thank-you shown the first time you opened this server.') },
    },
  },
  'about-support': {
    title: msg('Support OpenTodo'),
    description: msg('No paid plan: if it saves you a subscription, a coffee helps.'),
  },

  // Settings → Integrations
  caldav: {
    title: msg('Calendar apps (CalDAV)'),
    description: msg('Sync your tasks with calendar and reminder apps; each project is a list.'),
    learnMore: 'settings/caldav',
    rows: {
      server: {
        label: msg('On this server'),
        description: { owner: msg('Let calendar apps sync with this server.'), member: msg('Ask the server owner to turn it on.') },
      },
      address: { label: msg('Server address') },
      user: { label: msg('User name'), description: msg('Sign in with an app password, never your account password.') },
    },
    notices: {
      offline: msg('CalDAV status is available when you are online.'),
      encrypted: msg('Not available with end-to-end encryption: calendar apps cannot read encrypted titles.'),
      plainHttp: msg('Plain http: app passwords would travel unencrypted. Use HTTPS outside your home network.'),
    },
  },
  'calendar-feeds': {
    title: msg('Calendar feeds'),
    description: msg('Other calendars in Day and Week, and your tasks in a calendar app.'),
    learnMore: 'settings/calendar-feeds',
    rows: {
      server: {
        label: msg('On this server'),
        description: {
          owner: msg('People can subscribe to calendar addresses and get a private feed of their tasks.'),
          member: msg('The owner has not enabled calendar feeds on this server.'),
        },
      },
      feed: { label: msg('Feed URL') },
    },
    notices: {
      offline: msg('Changing calendar feeds needs a connection. You are seeing the last loaded state.'),
      eventsPlain: msg('Events from other calendars are stored unencrypted on the server.'),
      titlesEncrypted: msg('Titles appear as “Encrypted item” in calendar apps: the server cannot read them.'),
    },
  },
  // Task locations (task-locations D6): the owner's switch and providers, and each user's own switch.
  'maps-server': {
    title: msg('Maps'),
    description: msg('Maps and address search from the provider below, always through this server.'),
    learnMore: 'locations',
  },
  'maps-user': {
    title: msg('Maps'),
    description: msg('Off: no maps or address search on your devices; locations still work.'),
    learnMore: 'locations',
  },
  issues: {
    title: msg('Issues'),
    description: msg('Open GitHub and GitLab issues assigned to you become tasks that follow them.'),
    learnMore: 'settings/issues',
    rows: {
      server: {
        label: msg('On this server'),
        description: {
          owner: msg('People can connect GitHub or GitLab; the server polls their issues.'),
          member: msg('The owner has not enabled issue connections on this server.'),
        },
      },
      connections: { label: msg('Connections'), description: msg('Up to 5. Nothing is ever written back to GitHub or GitLab.') },
    },
    notices: {
      offline: msg('Changing issue connections needs a connection. You are seeing the last loaded state.'),
      encrypted: msg('Not available with end-to-end encryption: polls would store issue text unencrypted.'),
    },
  },
  webhooks: {
    title: msg('Webhooks'),
    description: msg('Notify any HTTP endpoint when tasks and projects change. Requests are signed.'),
    learnMore: 'settings/webhooks',
    rows: {
      private: { label: msg('Allow private network targets'), description: msg('Webhooks, calendar subscriptions and issue connections on your LAN. Off on public servers.') },
      add: { label: msg('Add a webhook'), description: msg('Posts a signed request to your endpoint when tasks or projects change.') },
    },
    notices: {
      offline: msg('Offline: changing or testing webhooks needs a connection. This is the last list fetched.'),
      plainHttp: msg('Plain http://: task content travels unencrypted. Use https:// outside a trusted network.'),
    },
  },
  tokens: {
    title: msg('API tokens'),
    description: msg('For scripts, the ot command and AI assistants. Sent as {header}.'),
    learnMore: 'settings/tokens',
    rows: { new: { label: msg('New token'), description: msg('A token is shown once, when you create it.') } },
  },
  'assistant-settings': {
    title: msg('Assistant'),
    description: msg('Plan and change your tasks by talking. Every change is proposed for review.'),
    learnMore: 'settings/assistant',
    rows: {
      server: { label: msg('On this server') },
      providers: { label: msg('Providers allowed') },
      cap: { label: msg('Monthly tokens per person') },
      memberKeys: { label: msg('Members’ own keys') },
      yours: { label: msg('Your assistant') },
      usage: { label: msg('Usage') },
      auto: { label: msg('Small changes without review'), description: msg('This device: up to 3 existing tasks, done, dates, priority or labels. Undo appears.') },
      conversations: { label: msg('Conversations'), description: msg('Stored only on this device, never on the server.') },
    },
    notices: {
      offline: msg('You are offline. These settings live on the server and need a connection.'),
      encrypted: msg('The assistant cannot read end-to-end encrypted tasks, so it is off for your account.'),
      ownerOff: msg('The server owner has not turned the assistant on.'),
      kept: msg('Your own provider ({provider_label}) is kept but unused: own keys are not allowed now.'),
    },
  },
  assistants: {
    title: msg('AI assistants'),
    description: msg('Let an MCP assistant read your tasks with a token; read-only by default.'),
    learnMore: 'settings/assistants',
    rows: {
      endpoint: {
        label: msg('Allow AI assistants'),
        description: {
          on: msg('Every account can connect an assistant with its own token.'),
          off: msg('The endpoint answers “not found” until turned on.'),
        },
      },
      writes: {
        label: msg('Assistants may make changes'),
        description: {
          on: msg('People can let an assistant with a dedicated token change their tasks.'),
          off: msg('Assistants can only read, whatever people choose.'),
        },
      },
      server: { label: msg('On this server') },
      mine: {
        label: msg('Changes to my tasks'),
        description: {
          on: msg('An assistant with a token for changes can edit your tasks; you can undo each one.'),
          ownerOff: msg('No effect yet: the server owner has not allowed assistants to make changes.'),
        },
      },
      url: { label: msg('Endpoint') },
      token: { label: msg('Token for an assistant'), description: msg('Creates an API token to paste into the assistant. Read-only is the safe default.') },
      // Device relay (mcp-device-relay): the trust model in plain words.
      relay: {
        label: msg('Answer AI connectors here'),
        description: msg('Lets connectors such as Claude.ai read and write your encrypted text through this device.'),
      },
      relayConfirm: { label: msg('Confirm changes first'), description: msg('Each change an AI connector asks for shows here before it is written.') },
      relayDevices: { label: msg('Devices that answer') },
      relayRecent: { label: msg('Recent requests'), description: msg('What this device answered, without the text.') },
    },
    notices: { offline: msg('Offline: these settings live on the server; this is the last state fetched.') },
  },

  // Settings → Data
  data: {
    title: msg('Your data'),
    description: msg('Everything you see is stored on this device and on your server.'),
    learnMore: 'settings/data',
    rows: {
      export: { label: msg('Export'), description: msg('Everything you can see as one JSON file, including the Trash.') },
      attachments: {
        label: msg('Attachments'),
        description: { on: msg('Files may be up to {bytes} each.'), off: msg('Adding files is turned off on this server.') },
      },
      import: { label: msg('Import'), description: msg('An OpenTodo export, a CSV file or another app’s JSON export; open it with {kbd}.') },
      sync: { label: msg('Sync') },
      backups: { label: msg('Backups') },
    },
  },
  projects: {
    title: msg('Projects'),
    description: msg('Deleted items stay in the <a>Trash</a> until restored or purged.'),
    learnMore: 'settings/projects',
    rows: {
      auto: { label: msg('Archive automatically'), description: msg('Archive projects after 30 days without open tasks. Each device keeps its own setting.') },
      archived: { label: msg('Archived projects'), description: msg('Listed on the All projects page, where each can be restored.') },
    },
  },

  // Settings → People
  users: {
    title: msg('Users'),
    description: {
      owner: msg('Everyone with an account; you manage every account and choose admins.'),
      admin: msg('Everyone with an account; admins can deactivate, reset and delete members.'),
    },
    learnMore: 'settings/users',
    rows: { accounts: { label: msg('Accounts') } },
    notices: { offline: msg('Offline: user administration needs a connection; other accounts are not kept here.') },
  },
  members: {
    title: msg('Members'),
    description: msg('Invite someone with a single-use link; sign-up stays closed.'),
    learnMore: 'settings/members',
    rows: { invitations: { label: msg('Invitations'), description: msg("Optionally bind a link to someone's email so only they can use it.") } },
    notices: { offline: msg('Offline: invitations live on the server; this is the last list fetched.') },
  },
  'mfa-policy': {
    title: msg('Two-factor policy'),
    description: msg('Who must use two-factor authentication. API tokens are never affected.'),
    learnMore: 'settings/access',
    rows: { policy: { label: msg('Policy for this server') } },
  },
  sso: {
    title: msg('Single sign-on'),
    description: msg('Sign in with an OpenID Connect provider you run; only that issuer is contacted.'),
    learnMore: 'settings/sso',
    rows: { status: { label: msg('Status') } },
    notices: { offline: msg('Offline: these settings are on the server and read-only until you reconnect.') },
  },
  'project-invite-policy': {
    title: msg('Project invite links'),
    description: msg('Whether project links can also create accounts for new people.'),
    learnMore: 'settings/project-invites',
    rows: { members: { label: msg('Invite new people'), description: msg("Off: members' links only work for people who already have an account.") } },
    notices: { offline: msg('This setting is available when you are online.') },
  },

  // Settings → Server
  backups: {
    title: msg('Backups'),
    description: msg('Scheduled copies of the whole server to a folder, S3 or WebDAV, restored here.'),
    learnMore: 'settings/backups',
    rows: {
      destination: { label: msg('Destination') },
      schedule: { label: msg('Schedule') },
      retention: { label: msg('Retention') },
      encryption: { label: msg('Encryption') },
    },
    notices: { offline: msg('Offline: backups run on the server; the status below is the last one fetched.') },
  },
  'attachments-settings': {
    title: msg('Attachments'),
    description: msg('Files on tasks and comments, stored under the data directory and backed up.'),
    learnMore: 'settings/attachments',
    rows: {
      allow: { label: msg('Allow attachments'), description: msg('When off, nobody can add files or links; existing ones stay and can still be opened.') },
      size: { label: msg('Size per file'), description: msg('In MB, from 1 to {MAX_FILE_MB}. Larger files are refused before they are sent.') },
      quota: { label: msg('Total per account'), description: msg('In MB; 0 means no total. Removing a file frees its space at once.') },
    },
    notices: { offline: msg('You are offline. These settings need a connection to the server.') },
  },
  'outgoing-email': {
    title: msg('Outgoing email'),
    description: msg('Lets this server mail password resets, confirmations and invitations.'),
    learnMore: 'settings/outgoing-email',
    rows: { server: { label: msg('Mail server'), description: msg('Not configured: nobody can reset a password or get an invitation by email.') } },
    notices: {
      offline: msg('Outgoing email settings need a connection to the server.'),
      plainRelay: msg('Messages travel unencrypted to the mail server; use it only for a relay on your network.'),
      noTls: msg('Without encryption, no sign-in can be used and messages travel in the clear.'),
    },
  },
  'server-archive': {
    title: msg('Download your data'),
    description: msg('The whole server as one archive, to restore into your own OpenTodo server.'),
    learnMore: 'settings/server',
    rows: { archive: { label: msg('Server archive'), description: msg('Keep it private: it holds every account’s sign-in data.') } },
    notices: { offline: msg('You are offline. The download needs a connection to the server.') },
  },
  audit: {
    title: msg('Audit log'),
    description: msg('Sign-ins, tokens, invitations, exports and setting changes. Never task content.'),
    learnMore: 'settings/server',
    rows: {
      retention: { label: msg('Keep events for'), description: msg('Between 7 and 3650 days. Older events are deleted.') },
      addresses: { label: msg('Record client addresses (IP)'), description: msg('Off by default; turning it off erases every stored address.') },
    },
    notices: { offline: msg('You are offline. The {what} needs a connection and is not shown until you are back.') },
  },

  // The demo note at the top of a settings page (settings-navigation "Demo instance sections").
  demo: {
    learnMore: 'demo',
    notices: {
      restricted: {
        one: msg('Demo instance: {features} is disabled here.'),
        other: msg('Demo instance: {features} are disabled here.'),
      },
    },
  },
} as const satisfies Readonly<Record<string, CardCopyEntry>>

type Copy = typeof SETTINGS_COPY
export type SettingsCopyId = keyof Copy
type RowsOf<I extends SettingsCopyId> = Copy[I] extends { rows: infer R } ? keyof R & string : never
type NoticesOf<I extends SettingsCopyId> = Copy[I] extends { notices: infer N } ? keyof N & string : never

export interface CopyOptions {
  /** The named variant of a description that depends on state. */
  variant?: string
  values?: TValues
}

/** The source text of an entry, picking its variant. */
export function pickText(text: CopyText | undefined, variant: string | undefined, where: string): string | undefined {
  if (text === undefined || typeof text === 'string') return text
  const v = variant !== undefined ? text[variant] : undefined
  if (v === undefined) throw new Error(`settings copy ${where}: needs one of the variants ${Object.keys(text).join(', ')}`)
  return v
}

const entry = (id: SettingsCopyId): CardCopyEntry => SETTINGS_COPY[id]

/** A card's heading, line, Learn more and heading id, translated, to spread into SettingsSection. */
export function cardCopy(id: SettingsCopyId, opts: CopyOptions = {}): { title: string; description?: string; learnMore?: string; headingId: string } {
  const e = entry(id)
  const description = pickText(e.description, opts.variant, id)
  return {
    title: t(e.title ?? id),
    ...(description !== undefined ? { description: t(description, opts.values) } : {}),
    ...(e.learnMore ? { learnMore: e.learnMore } : {}),
    headingId: `${id}-heading`,
  }
}

/** A row's label and line, translated, to spread into SettingRow. */
export function rowCopy<I extends SettingsCopyId>(id: I, row: RowsOf<I>, opts: CopyOptions = {}): { label: string; description?: string } {
  const r = entry(id).rows?.[row]
  if (!r) throw new Error(`settings copy ${id}: no row ${row}`)
  const description = pickText(r.description, opts.variant, `${id}.${row}`)
  return { label: t(r.label), ...(description !== undefined ? { description: t(description, opts.values) } : {}) }
}

/** A card's one-line notice, translated. */
export function noticeCopy<I extends SettingsCopyId>(id: I, key: NoticesOf<I>, opts: CopyOptions = {}): string {
  const n = entry(id).notices?.[key]
  const text = pickText(n, opts.variant, `${id}.notices.${key}`)
  if (text === undefined) throw new Error(`settings copy ${id}: no notice ${key}`)
  return t(text, opts.values)
}

/** A choice card's option label and line, translated. */
export function optionCopy(id: SettingsCopyId, option: string): { label: string; description: string } {
  const o = entry(id).options?.[option]
  if (!o) throw new Error(`settings copy ${id}: no option ${option}`)
  return { label: t(o.label), description: t(o.description) }
}

/** Every entry of the table, flattened, for the copy lint: where, kind and the English text. */
export function copyEntries(): { where: string; kind: 'title' | 'label' | 'description' | 'option' | 'notice'; text: string }[] {
  const out: ReturnType<typeof copyEntries> = []
  const texts = (text: CopyText | undefined): [string, string][] =>
    text === undefined ? [] : typeof text === 'string' ? [['', text]] : Object.entries(text).map(([k, v]) => [`:${k}`, v])
  for (const [id, raw] of Object.entries(SETTINGS_COPY)) {
    const e = raw as CardCopyEntry
    if (e.title) out.push({ where: id, kind: 'title', text: e.title })
    for (const [k, v] of texts(e.description)) out.push({ where: `${id}${k}`, kind: 'description', text: v })
    for (const [row, r] of Object.entries(e.rows ?? {})) {
      out.push({ where: `${id}.${row}`, kind: 'label', text: r.label })
      for (const [k, v] of texts(r.description)) out.push({ where: `${id}.${row}${k}`, kind: 'description', text: v })
    }
    for (const [opt, o] of Object.entries(e.options ?? {})) {
      out.push({ where: `${id}.options.${opt}`, kind: 'label', text: o.label })
      out.push({ where: `${id}.options.${opt}`, kind: 'option', text: o.description })
    }
    for (const [key, n] of Object.entries(e.notices ?? {})) for (const [k, v] of texts(n)) out.push({ where: `${id}.notices.${key}${k}`, kind: 'notice', text: v })
  }
  return out
}
