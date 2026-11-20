// Bare addresses in the rich-text editor (OpenSpec bare-links): an http(s) address
// typed or pasted as text stays text in the note, so editing it changes where it
// points, and reads as a link (Ctrl/Cmd-click opens it, as for any link). The rule
// is markdown.ts bareUrls, the same as the read-only renderer's.
import { type Mark, type Node as PMNode, Fragment, Slice } from 'prosemirror-model'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { bareUrls, LINK_REL } from './markdown'

const key = new PluginKey<DecorationSet>('bareLinks')

/** Link decorations over the bare addresses of a document, outside links and code. */
function decorate(doc: PMNode): DecorationSet {
  const decos: Decoration[] = []
  doc.descendants((node, pos, parent) => {
    if (parent?.type.spec.code) return false
    if (!node.isText || !node.text || node.marks.some((m) => m.type.name === 'link' || m.type.name === 'code' || m.type.spec.code)) return
    for (const u of bareUrls(node.text)) {
      decos.push(Decoration.inline(pos + u.from, pos + u.to, { nodeName: 'a', href: u.href, rel: LINK_REL, target: '_blank', class: 'bare-link' }))
    }
  })
  return DecorationSet.create(doc, decos)
}

/** The editor plugin: bare addresses read as links, kept up to date on every change. */
export function bareLinksPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_, state) => decorate(state.doc),
      apply: (tr, set) => (tr.docChanged ? decorate(tr.doc) : set),
    },
    props: {
      decorations: (state) => key.getState(state),
      // A pasted link whose text is its own address (what browsers and many apps put
      // on the clipboard) is kept as the bare address, so its text and target cannot drift.
      transformPasted: (slice) => withoutSelfLinks(slice),
    },
  })
}

/** Whether a link's text is its own address (a trailing slash aside). */
function selfLink(text: string, mark: Mark): boolean {
  const href = String(mark.attrs.href ?? '')
  const bare = (s: string) => s.trim().replace(/\/$/, '')
  return bare(text) === bare(href)
}

/** The slice with the link mark dropped from every link whose text is its address. */
export function withoutSelfLinks(slice: Slice): Slice {
  const map = (fragment: Fragment): Fragment => {
    const nodes: PMNode[] = []
    fragment.forEach((node) => {
      if (node.isText) {
        const link = node.marks.find((m) => m.type.name === 'link')
        nodes.push(link && selfLink(node.text ?? '', link) ? node.mark(link.removeFromSet(node.marks)) : node)
      } else nodes.push(node.copy(map(node.content)))
    })
    return Fragment.fromArray(nodes)
  }
  return new Slice(map(slice.content), slice.openStart, slice.openEnd)
}
