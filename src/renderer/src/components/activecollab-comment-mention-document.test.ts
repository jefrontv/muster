// @vitest-environment happy-dom

import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'

import { activeCollabCommentBodyHtml } from './activecollab-comment-body-html'
import { createActiveCollabCommentExtensions } from './activecollab-comment-editor-schema'
import {
  activeCollabEditorMentionToken,
  insertActiveCollabMention
} from './activecollab-comment-mention-document'
import { ACTIVECOLLAB_MENTION_NODE_NAME } from './activecollab-comment-mention-node'

const ADA = { id: 12, name: 'Ada Lovelace' }
const ALAN = { id: 88, name: 'Alan Turing' }

function editor(content = '<p></p>'): Editor {
  return new Editor({
    element: null,
    extensions: createActiveCollabCommentExtensions('placeholder'),
    content
  })
}

/** Types text at the caret the way the author would, then reads the token under it. */
function tokenAfterTyping(text: string): { query: string; from: number; to: number } | null {
  const instance = editor()
  instance.commands.insertContent([{ type: 'text', text }])
  return activeCollabEditorMentionToken(instance)
}

function mentionNames(instance: Editor): { userId: number; name: string }[] {
  const found: { userId: number; name: string }[] = []
  instance.state.doc.descendants((node) => {
    if (node.type.name === ACTIVECOLLAB_MENTION_NODE_NAME) {
      found.push({ userId: Number(node.attrs.userId), name: String(node.attrs.name) })
    }
  })
  return found
}

describe('activeCollabEditorMentionToken', () => {
  it('opens on a bare @ so the author can browse rather than having to guess a name', () => {
    // The range covers the `@` itself, so accepting replaces it rather than leaving it behind.
    expect(tokenAfterTyping('Ping @')).toEqual({ query: '', from: 6, to: 7 })
  })

  it('carries the partial typed after the @', () => {
    expect(tokenAfterTyping('Ping @al')?.query).toBe('al')
  })

  it('stays shut for an @ glued to a word, which is an address and not a mention', () => {
    expect(tokenAfterTyping('mail ada@efront.com.au')).toBeNull()
  })

  it('opens after punctuation, because "(@ada" is still somebody being mentioned', () => {
    expect(tokenAfterTyping('see (@ad')?.query).toBe('ad')
  })

  it('closes once the token runs past a name and into prose', () => {
    expect(tokenAfterTyping(`@${'x'.repeat(31)}`)).toBeNull()
  })

  it('reads the token under the caret, not the end of the draft', () => {
    const instance = editor()
    instance.commands.insertContent([{ type: 'text', text: 'Ping @al and thanks' }])
    // Caret parked immediately after "@al"; the trailing prose must not join the query.
    instance.commands.setTextSelection(9)

    expect(activeCollabEditorMentionToken(instance)?.query).toBe('al')
  })

  it('does not reach back into the paragraph above, so a stale @ cannot follow the author down', () => {
    const instance = editor('<p>Ping @ad</p><p>second line</p>')
    instance.commands.setTextSelection(instance.state.doc.content.size - 1)

    expect(activeCollabEditorMentionToken(instance)).toBeNull()
  })

  it('stays shut while text is selected, because a range is not a caret choosing a person', () => {
    const instance = editor()
    instance.commands.insertContent([{ type: 'text', text: 'Ping @al' }])
    instance.commands.setTextSelection({ from: 6, to: 9 })

    expect(activeCollabEditorMentionToken(instance)).toBeNull()
  })
})

describe('insertActiveCollabMention', () => {
  it('replaces the whole token with one mention node, leaving the surrounding prose intact', () => {
    const instance = editor()
    instance.commands.insertContent([{ type: 'text', text: 'Ping @ad' }])
    const token = activeCollabEditorMentionToken(instance)

    insertActiveCollabMention(instance, token!, ADA)

    expect(mentionNames(instance)).toEqual([{ userId: 12, name: 'Ada Lovelace' }])
    expect(activeCollabCommentBodyHtml(instance.state.doc)).toBe(
      '<p>Ping <span class="new_mention" data-user-id="12" data-type="user">Ada Lovelace</span></p>'
    )
  })

  it('leaves the rest of the draft untouched when accepting mid-sentence, and adds no second space', () => {
    const instance = editor()
    instance.commands.insertContent([{ type: 'text', text: 'Ping @ad about the header' }])
    instance.commands.setTextSelection(9)

    insertActiveCollabMention(instance, activeCollabEditorMentionToken(instance)!, ADA)

    expect(activeCollabCommentBodyHtml(instance.state.doc)).toBe(
      '<p>Ping <span class="new_mention" data-user-id="12" data-type="user">Ada Lovelace</span>' +
        ' about the header</p>'
    )
  })

  it('separates the chip from whatever the author types next', () => {
    const instance = editor()
    instance.commands.insertContent([{ type: 'text', text: '@ad' }])
    insertActiveCollabMention(instance, activeCollabEditorMentionToken(instance)!, ADA)
    instance.commands.insertContent([{ type: 'text', text: 'thanks' }])

    expect(activeCollabCommentBodyHtml(instance.state.doc)).toBe(
      '<p><span class="new_mention" data-user-id="12" data-type="user">Ada Lovelace</span> thanks</p>'
    )
  })

  it('opens a fresh token for an @ typed straight after a chip', () => {
    // The chip counts as exactly one position, which is what keeps the scanner's string offsets and
    // the document's positions in step; get that wrong and the second @ addresses the wrong place.
    const instance = editor()
    instance.commands.insertContent([{ type: 'text', text: '@ad' }])
    insertActiveCollabMention(instance, activeCollabEditorMentionToken(instance)!, ADA)
    instance.commands.insertContent([{ type: 'text', text: '@al' }])

    const second = activeCollabEditorMentionToken(instance)
    expect(second?.query).toBe('al')

    insertActiveCollabMention(instance, second!, ALAN)
    expect(mentionNames(instance)).toEqual([
      { userId: 12, name: 'Ada Lovelace' },
      { userId: 88, name: 'Alan Turing' }
    ])
  })

  it('addresses two people who share a first name without either eating the other', () => {
    // Name substitution had to sort by length to stop "Jake" consuming "Jake Varrese". Nodes have
    // no such ordering problem: each one is already its own object.
    const instance = editor()
    instance.commands.insertContent([{ type: 'text', text: '@jak' }])
    insertActiveCollabMention(instance, activeCollabEditorMentionToken(instance)!, {
      id: 407,
      name: 'Jake Varrese'
    })
    instance.commands.insertContent([{ type: 'text', text: 'and @jak' }])
    insertActiveCollabMention(instance, activeCollabEditorMentionToken(instance)!, {
      id: 900,
      name: 'Jake'
    })

    expect(activeCollabCommentBodyHtml(instance.state.doc)).toBe(
      '<p><span class="new_mention" data-user-id="407" data-type="user">Jake Varrese</span> and ' +
        '<span class="new_mention" data-user-id="900" data-type="user">Jake</span></p>'
    )
  })
})

describe('deleting a mention', () => {
  it('removes it from the posted body, because the mention IS the node', () => {
    // The improvement over name substitution: there is no separate pick list that can disagree with
    // what the author can see, so a deleted chip cannot notify anybody.
    const instance = editor()
    instance.commands.insertContent([{ type: 'text', text: 'Ping @ad' }])
    insertActiveCollabMention(instance, activeCollabEditorMentionToken(instance)!, ADA)
    instance.commands.insertContent([{ type: 'text', text: 'never mind' }])

    expect(activeCollabCommentBodyHtml(instance.state.doc)).toContain('new_mention')

    const chipAt = instance.state.doc.content.firstChild!.content.firstChild!.nodeSize + 1
    instance.chain().setNodeSelection(chipAt).deleteSelection().run()

    expect(mentionNames(instance)).toEqual([])
    const html = activeCollabCommentBodyHtml(instance.state.doc)
    expect(html).not.toContain('new_mention')
    expect(html).not.toContain('Ada Lovelace')
    // Two spaces: deleting a word from between two of them leaves both, exactly as deleting any
    // other word would, and HTML collapses the run on render. Rewriting the author's spacing to
    // tidy the string would be the composer editing their prose behind their back.
    expect(html).toBe('<p>Ping  never mind</p>')
  })

  it('drops only the deleted one when two are addressed', () => {
    const instance = editor()
    instance.commands.insertContent([{ type: 'text', text: '@ad' }])
    insertActiveCollabMention(instance, activeCollabEditorMentionToken(instance)!, ADA)
    instance.commands.insertContent([{ type: 'text', text: '@al' }])
    insertActiveCollabMention(instance, activeCollabEditorMentionToken(instance)!, ALAN)

    instance.chain().setNodeSelection(1).deleteSelection().run()

    expect(mentionNames(instance)).toEqual([{ userId: 88, name: 'Alan Turing' }])
    expect(activeCollabCommentBodyHtml(instance.state.doc)).toBe(
      '<p><span class="new_mention" data-user-id="88" data-type="user">Alan Turing</span></p>'
    )
  })
})
