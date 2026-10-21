// Messages open in a web mail client (OpenSpec change extension-v2, design D5;
// share-capture "Mail message recognition"). The subject comes from the tab's
// title, the message id and permalink from the tab's address, and the sender from
// the message header, read by one script on the user's click (readMailHeader,
// run through scripting.executeScript under activeTab). The body is never read,
// and the extension holds no permission for any mail host.

/** The clients: host match, title suffixes, id from the address, header selectors. */
export const MAIL_CLIENTS = [
  {
    provider: 'gmail',
    hosts: ['mail.google.com'],
    // "Boiler service quote - me@gmail.com - Gmail"; list views are "Inbox (3) - … - Gmail".
    // The account never holds " - "; the subject may.
    title: /^(.*) - (?:(?! - ).)+ - Gmail$/,
    // #inbox/FMfcgz…, #label/Work/FMfcgz…, #search/boiler/FMfcgz…: the last part is the conversation.
    id: (u) => {
      const parts = u.hash.replace(/^#/, '').split('/').filter(Boolean)
      return parts.length >= 2 ? decodeURIComponent(parts[parts.length - 1]) : ''
    },
  },
  {
    provider: 'outlook',
    hosts: ['outlook.office.com', 'outlook.office365.com', 'outlook.live.com'],
    // "Invoice 42 - Jane Doe - Outlook" or "Invoice 42 - Outlook"; the list is "Mail - Jane Doe - Outlook".
    // A name like "Anne-Marie Dupont" holds a hyphen but never " - ".
    title: /^(.*?)(?: - (?:(?! - ).)+)? - Outlook$/,
    // /mail/inbox/id/AAQk…, /mail/id/AAQk…, /mail/deeplink/read/AAQk…
    id: (u) => {
      const m = u.pathname.match(/\/(?:id|read)\/([^/]+)/)
      return m ? decodeURIComponent(m[1]) : ''
    },
  },
]

/**
 * The selectors of the sender in an open message, per client; the first match
 * wins. When a client changes its page, a capture simply has no "From:" line and
 * the fixtures in testdata/mail fail: update this table then.
 */
export const HEADER_SELECTORS = {
  gmail: { sender: ['h3.iw span[email]', 'span.gD[email]'], name: 'name', email: 'email' },
  outlook: { sender: ['[role="main"] [data-testid="SenderPersona"] span[title*="@"]', '[role="main"] span[title*="@"]'], title: 'title' },
}

/** The client a tab address belongs to, or null. */
export function mailClientOf(url) {
  let u
  try {
    u = new URL(url)
  } catch {
    return null
  }
  return MAIL_CLIENTS.find((c) => c.hosts.includes(u.hostname.toLowerCase())) ?? null
}

/** "Acme Heating <quotes@acme.example>", or "" when neither part is known. */
export function senderLine(header) {
  const name = String(header?.name ?? '').trim()
  const email = String(header?.email ?? '').trim()
  if (name && email && name !== email) return `${name} <${email}>`
  return email || name
}

/**
 * Recognise an open message from the tab: null for any other page, a list view or
 * a draft without an id. Otherwise {subject, from, origin}: the origin is
 * {kind: 'email', provider, id, url, title}; `from` is "" when the header could not be read.
 */
export function recognizeMail({ url, title, header } = {}) {
  const client = mailClientOf(url)
  if (!client) return null
  const u = new URL(url)
  const id = client.id(u)
  if (!id) return null
  const m = String(title ?? '').match(client.title)
  const subject = (m?.[1] ?? '').trim()
  if (!subject || /^(mail|inbox|posta in arrivo|posteingang|boîte de réception|bandeja de entrada|caixa de entrada)( \(\d+\))?$/i.test(subject)) return null
  const origin = { kind: 'email', provider: client.provider, id: id.slice(0, 512), url, title: subject.slice(0, 500) }
  return { subject, from: senderLine(header), origin }
}

/**
 * Runs in the mail tab (serialised by scripting.executeScript): the sender of the
 * open message per the selector table, or null. Reads attributes of the header
 * only, never the message body.
 */
export function readMailHeader(selectors) {
  try {
    for (const sel of selectors.sender) {
      const all = document.querySelectorAll(sel)
      const el = all[all.length - 1]
      if (!el) continue
      if (selectors.email) return { name: el.getAttribute(selectors.name) ?? el.textContent ?? '', email: el.getAttribute(selectors.email) ?? '' }
      const t = el.getAttribute(selectors.title) ?? ''
      const m = t.match(/[^\s<>]+@[^\s<>]+/)
      return { name: (el.textContent ?? '').trim(), email: m ? m[0] : '' }
    }
  } catch {
    // A page that changed its structure: no From line.
  }
  return null
}
