// Applies the cached appearance before the first paint (OpenSpec theming D7), so
// a dark or themed app never flashes the default. A classic same-origin script:
// the server's CSP forbids inline scripts. The app replaces this with the synced
// preference as soon as it reads it (src/lib/appearance.ts). A custom accent
// (accent-colour D4) comes with its derived values, each checked, never derived here.
(function () {
  try {
    var a = JSON.parse(localStorage.getItem('ot.appearance') || 'null')
    if (!a) return
    var root = document.documentElement
    var hex = function (v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) }
    if (a.mode === 'light' || a.mode === 'dark') root.setAttribute('data-theme', a.mode)
    var c = a.custom
    var custom = a.accent === 'custom' && c && hex(c.light) && hex(c.dark) && hex(c.on) && (c.button === undefined || hex(c.button))
    if (a.accent === 'custom') {
      if (custom) {
        root.style.setProperty('--ot-al-accent', c.light)
        root.style.setProperty('--ot-ad-accent-text', c.dark)
        root.style.setProperty('--ot-a-on-accent', c.on)
        if (c.button) root.style.setProperty('--ot-ad-accent', c.button)
        root.setAttribute('data-accent', 'custom')
      }
    } else if (typeof a.accent === 'string' && /^[a-z]+$/.test(a.accent) && a.accent !== 'emerald') root.setAttribute('data-accent', a.accent)
    // A malformed custom cache shows the defaults, bar included.
    var bar = hex(a.bar) && (a.accent !== 'custom' || custom) ? a.bar : null
    var metas = document.querySelectorAll('meta[name="theme-color"]')
    for (var i = 0; i < metas.length; i++) metas[i].parentNode.removeChild(metas[i])
    var add = function (content, media) {
      var m = document.createElement('meta')
      m.name = 'theme-color'
      m.content = content
      if (media) m.media = media
      document.head.appendChild(m)
    }
    if (a.mode === 'dark') add('#0d0e10')
    else if (a.mode === 'light') add(bar || '#0f172a')
    else if (bar) { add(bar, '(prefers-color-scheme: light)'); add('#0d0e10', '(prefers-color-scheme: dark)') }
  } catch (e) {
    // Blocked storage or bad JSON: the defaults apply.
  }
})()
