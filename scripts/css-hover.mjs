// Hover needs a pointer that hovers (touch-input-mode D1): a `:hover` selector in the
// web app's CSS sits inside `@media (hover: hover)` or `@media (pointer: fine)`, or a
// tap leaves its look stuck on a phone. Tailwind's `hover:` variant is guarded already.

const GUARD = /^@media\b[^{]*\((hover:\s*hover|pointer:\s*fine)\)/

/** Each unguarded `:hover` selector in `css`, with its line. */
export function unguardedHover(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  const stack = []
  const out = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === ';') start = i + 1
    else if (ch === '}') { stack.pop(); start = i + 1 }
    else if (ch === '{') {
      const prelude = text.slice(start, i).trim()
      if (!prelude.startsWith('@') && /:hover\b/.test(prelude) && !stack.some((p) => GUARD.test(p))) {
        out.push({ line: text.slice(0, start).split('\n').length + (text.slice(start, i).match(/^\s*/)[0].split('\n').length - 1), selector: prelude.replace(/\s+/g, ' ') })
      }
      stack.push(prelude)
      start = i + 1
    }
  }
  return out
}
