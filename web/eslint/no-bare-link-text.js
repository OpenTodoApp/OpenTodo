// A link says where it goes in its own words (OpenSpec accessibility "Location and
// link purpose", WCAG 2.4.9 Link Purpose (Link Only); accessibility-aaa D8): a link or
// anchor whose whole text is "here", "more", "Learn more", "click here" or "read more"
// tells a screen-reader user listing the links nothing. Put the subject in the text
// ("Learn more about backups"), or use the LearnMore element, which carries it.
const BARE = new Set(['here', 'more', 'learn more', 'click here', 'read more', 'link', 'this'])
const LINKS = new Set(['a', 'Link'])

function literalOf(node) {
  if (!node) return null
  if (node.type === 'JSXText') return node.value
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis.map((q) => q.value.cooked).join('')
  if (node.type === 'JSXExpressionContainer') return literalOf(node.expression)
  // t('Learn more') and msg('here'): the first argument is the English text.
  if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && ['t', 'msg'].includes(node.callee.name)) return literalOf(node.arguments[0])
  return null
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'disallow a link whose whole text is a bare phrase such as "here" or "Learn more"' },
    schema: [],
    messages: { bare: 'the link text "{{text}}" does not say where the link goes: name the subject in the text, or use the LearnMore element.' },
  },
  create(context) {
    return {
      JSXElement(node) {
        const name = node.openingElement.name
        if (name.type !== 'JSXIdentifier' || !LINKS.has(name.name)) return
        const children = node.children.filter((c) => !(c.type === 'JSXText' && !c.value.trim()))
        if (children.length !== 1) return
        const text = literalOf(children[0])
        if (text === null) return
        const words = text.trim().replace(/\s+/g, ' ').replace(/[.!…:]+$/, '').toLowerCase()
        if (BARE.has(words)) context.report({ node: children[0], messageId: 'bare', data: { text: text.trim() } })
      },
    }
  },
}
