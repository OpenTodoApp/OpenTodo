// The --ot-* colour tokens of web/src/index.css as a standalone stylesheet (site-bundle D4).
// Shared by scripts/site-bundle.mjs (tokens/tokens.css) and the docs build (docs.css,
// docs-landing-restyle D4), in a module of its own so neither imports the other.
/** Bundle layout version; README.md states the stability rule. */
export const LAYOUT = 1

function block(css, selector) {
  const at = css.indexOf(selector)
  if (at < 0) throw new Error(`token block not found: ${selector}`)
  const open = css.indexOf('{', at)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  throw new Error(`unterminated block: ${selector}`)
}

const declarations = (body) => [...body.matchAll(/--ot-[\w-]+:\s*[^;]+;/g)].map((m) => m[0].replace(/\s+/g, ' '))

/** The three --ot-* blocks of index.css (light, dark by preference, dark by attribute) as a standalone stylesheet. */
export function tokensCss(indexCss, version) {
  const light = declarations(block(indexCss, ':root, [data-theme="light"] {'))
  const darkMedia = declarations(block(indexCss, '@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"])'))
  const darkAttr = declarations(block(indexCss, ':root[data-theme="dark"], [data-theme="dark"] {'))
  const lines = (ds, indent) => ds.map((d) => `${indent}${d}`).join('\n')
  return `/* OpenTodo colour tokens ${version}, generated from web/src/index.css (site bundle layout v${LAYOUT}).
   Light by default; dark follows the system preference unless [data-theme="light"]
   is set on an ancestor, and [data-theme="dark"] forces it. */
:root, [data-theme="light"] {
${lines(light, '  ')}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${lines(darkMedia, '    ')}
  }
}
:root[data-theme="dark"], [data-theme="dark"] {
${lines(darkAttr, '  ')}
}
`
}

