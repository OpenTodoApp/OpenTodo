// A name on a generic element is ignored (OpenSpec assistive-tech-semantics): ARIA
// prohibits aria-label and aria-labelledby on a <span> or <div> without a role, so
// screen readers skip it and the text it carries ("Has notes", "3 comments") is never
// announced. Put visually hidden text inside instead (`<span className="sr-only">`),
// or give the element the role that the name belongs to.
const GENERIC = new Set(['span', 'div'])
const NAMES = new Set(['aria-label', 'aria-labelledby'])

export default {
  meta: {
    type: 'problem',
    docs: { description: 'disallow aria-label and aria-labelledby on a span or div without a role' },
    schema: [],
    messages: { generic: '{{attr}} on a <{{tag}}> without a role is ignored by screen readers: use sr-only text inside, or a role.' },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== 'JSXIdentifier' || !GENERIC.has(node.name.name)) return
        const attrs = node.attributes.filter((a) => a.type === 'JSXAttribute')
        if (attrs.some((a) => a.name.name === 'role')) return
        for (const a of attrs) {
          if (a.name.type === 'JSXIdentifier' && NAMES.has(a.name.name)) {
            context.report({ node: a, messageId: 'generic', data: { attr: a.name.name, tag: node.name.name } })
          }
        }
      },
    }
  },
}
