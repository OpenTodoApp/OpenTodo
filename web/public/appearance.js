// Applies the cached appearance before the first paint (OpenSpec theming D7), so
// a dark or themed app never flashes the default. A classic same-origin script:
// the server's CSP forbids inline scripts. The app replaces this with the synced
// preference as soon as it reads it (src/lib/appearance.ts). A custom accent
// (accent-colour D4) comes with its derived values, each checked, never derived here.
// A theme (theme-engine D5) comes resolved from `ot.theme`: the side of the cached
// mode (or of the system scheme), every name and value checked against fixed
// patterns, written as the same rule src/lib/theme/apply.ts writes. Never derived here.
(function () {
  try {
    var a = JSON.parse(localStorage.getItem('ot.appearance') || 'null')
    var themes = {}
    try { themes = JSON.parse(localStorage.getItem('ot.theme') || 'null') || {} } catch (e) { themes = {} }
    if (!a && !themes.light && !themes.dark) return
    a = a || { mode: 'system' }
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
    var theme = function (side) {
      var t = themes[side]
      var name = /^[a-z0-9-]{1,40}$/
      var value = /^(#[0-9a-f]{6}|oklch\([0-9.]+ [0-9.]+ [0-9.]+( \/ [0-9.]+)?\))$/
      if (!t || typeof t !== 'object' || t.kind !== side || typeof t.id !== 'string' || !name.test(t.id) || !hex(t.bar) || !t.tokens || typeof t.tokens !== 'object') return null
      var colours = []
      for (var k in t.tokens) {
        if (!Object.prototype.hasOwnProperty.call(t.tokens, k)) continue
        if (!name.test(k) || typeof t.tokens[k] !== 'string' || !value.test(t.tokens[k])) return null
        colours.push('--ot-' + k + ':' + t.tokens[k])
      }
      var shape = []
      if (t.radius !== undefined) {
        var steps = ['chip', 'control', 'card', 'surface', 'popover']
        for (var i = 0; i < steps.length; i++) {
          var r = t.radius && t.radius[steps[i]]
          if (typeof r !== 'number' || r % 1 !== 0 || r < 0 || r > 20) return null
          shape.push('--ot-radius-' + steps[i] + ':' + r + 'px')
        }
      }
      if (t.font !== undefined) {
        if (typeof t.font !== 'string' || !/^[A-Za-z0-9 ,"-]{1,200}$/.test(t.font)) return null
        shape.push('--ot-font:' + t.font)
      }
      if (t.list !== undefined) {
        if (t.list !== 14 && t.list !== 15) return null
        shape.push('--ot-text-list:' + t.list / 16 + 'rem')
      }
      var css = 'html:root[data-ot-theme]:not([data-contrast="high"]){' + colours.join(';') + ';color-scheme:' + side + '}'
      if (shape.length) css += 'html:root[data-ot-theme]{' + shape.join(';') + '}'
      return { id: t.id, bar: t.bar, css: css }
    }
    var light = theme('light')
    var dark = theme('dark')
    var systemDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    var shown = a.mode === 'dark' || (a.mode !== 'light' && systemDark) ? dark : light
    if (shown) {
      var style = document.createElement('style')
      style.id = 'ot-theme'
      style.textContent = shown.css
      document.head.appendChild(style)
      root.setAttribute('data-theme', shown === dark ? 'dark' : 'light')
      root.setAttribute('data-ot-theme', shown.id)
    }
    var lightBar = light ? light.bar : bar
    var darkBar = dark ? dark.bar : '#0d0e10'
    var metas = document.querySelectorAll('meta[name="theme-color"]')
    for (var m = 0; m < metas.length; m++) metas[m].parentNode.removeChild(metas[m])
    var add = function (content, media) {
      var el = document.createElement('meta')
      el.name = 'theme-color'
      el.content = content
      if (media) el.setAttribute('media', media)
      document.head.appendChild(el)
    }
    if (a.mode === 'dark') add(darkBar)
    else if (a.mode === 'light') add(lightBar || '#0f172a')
    else if (lightBar || dark) { add(lightBar || '#0f172a', '(prefers-color-scheme: light)'); add(darkBar, '(prefers-color-scheme: dark)') }
  } catch (e) {
    // Blocked storage or bad JSON: the defaults apply.
  }
})()
