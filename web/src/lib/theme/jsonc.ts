// A small JSON-with-comments reader (OpenSpec change theme-editor, design D12): the
// dialect VS Code allows in colour theme files, `//` and `/* */` comments and
// trailing commas, turned into plain JSON and parsed. No dependency; strings are
// copied as they are, so a `//` inside a string stays text.

/** The text with comments blanked and trailing commas removed; offsets and lines are kept. */
export function stripJsonc(text: string): string {
  let out = ''
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (c === '"') {
      let j = i + 1
      while (j < n && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j + 1
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') { out += ' '; i++ }
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end < 0 ? n : end + 2
      out += text.slice(i, stop).replace(/[^\n]/g, ' ')
      i = stop
    } else {
      out += c
      i++
    }
  }
  // A comma followed only by blanks before a closing bracket (strings already copied, so look outside them).
  let result = ''
  let inString = false
  for (let k = 0; k < out.length; k++) {
    const c = out[k]
    if (inString) {
      result += c
      if (c === '\\') { result += out[k + 1] ?? ''; k++ } else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    if (c === ',') {
      let j = k + 1
      while (j < out.length && /\s/.test(out[j])) j++
      if (out[j] === '}' || out[j] === ']') { result += ' '; continue }
    }
    result += c
  }
  return result
}

/** Parses JSON with comments and trailing commas; throws like JSON.parse. */
export function parseJsonc(text: string): unknown {
  return JSON.parse(stripJsonc(text.replace(/^﻿/, '')))
}
