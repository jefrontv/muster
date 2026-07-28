// A mention as a document NODE rather than a name the serialiser hunts for in text.
//
// The previous composer carried picks as {name, id} and substituted them BY NAME when posting,
// which meant a second, hand-typed `@Jake Varrese` anywhere in the body also became a mention for
// the picked Jake — including when the author meant a different one. An atom node ends that class
// of bug outright: the mention IS an object at one position in the document, so there is nothing to
// match, deleting it deletes the mention, and typing the same name again is just text.
//
// Atom and not editable-inline on purpose: a mention must be indivisible. Backspacing into a
// half-deleted "Ada Lov" that still addresses user 12 is the failure mode this prevents.

import { Node } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export const ACTIVECOLLAB_MENTION_NODE_NAME = 'activeCollabMention'

const USER_ID_ATTRIBUTE = 'data-activecollab-mention-id'
const NAME_ATTRIBUTE = 'data-activecollab-mention-name'

/** Who a mention addresses, and the display name shown in its place. */
export type ActiveCollabMentionAttributes = {
  userId: number
  name: string
}

/**
 * Read a mention node's attributes back as trustworthy values.
 *
 * Node attributes are `any` at the ProseMirror boundary and can arrive from pasted HTML, so the id
 * is narrowed to a positive safe integer here rather than at each call site. A non-conforming id
 * yields 0, which the serialiser treats as "not addressable" and writes as plain text.
 */
export function readActiveCollabMentionAttributes(
  node: ProseMirrorNode
): ActiveCollabMentionAttributes {
  const rawId = Number(node.attrs.userId)
  const userId = Number.isSafeInteger(rawId) && rawId > 0 ? rawId : 0
  return { userId, name: String(node.attrs.name ?? '') }
}

/**
 * The in-editor mention chip.
 *
 * `renderHTML` here is DISPLAY ONLY and deliberately not the wire format: what gets POSTed is built
 * by the doc serialiser, so the editor's styling hooks can never leak onto the instance and the
 * allowlist stays a property of one module. The `@` lives in the rendered text rather than the
 * stored name so the chip reads the way it was typed while `name` stays exactly the person's name.
 */
export const ActiveCollabMentionNode = Node.create({
  name: ACTIVECOLLAB_MENTION_NODE_NAME,
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      userId: {
        default: 0,
        parseHTML: (element: HTMLElement) => Number(element.getAttribute(USER_ID_ATTRIBUTE) ?? 0),
        renderHTML: (attributes: Record<string, unknown>) => ({
          [USER_ID_ATTRIBUTE]: String(attributes.userId ?? 0)
        })
      },
      name: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute(NAME_ATTRIBUTE) ?? '',
        renderHTML: (attributes: Record<string, unknown>) => ({
          [NAME_ATTRIBUTE]: String(attributes.name ?? '')
        })
      }
    }
  },

  parseHTML() {
    return [{ tag: `span[${USER_ID_ATTRIBUTE}]` }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      { ...HTMLAttributes, class: 'activecollab-comment-mention' },
      `@${String(node.attrs.name ?? '')}`
    ]
  },

  // Why: `getText()` powers the empty-draft check, so a comment that is only a mention has to read
  // as text the author wrote.
  renderText({ node }) {
    return `@${String(node.attrs.name ?? '')}`
  }
})
