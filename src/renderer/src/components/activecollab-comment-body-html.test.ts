// @vitest-environment happy-dom
//
// Exercised through a REAL editor rather than hand-built ProseMirror documents: the claim being
// defended is about what the composer can post, and half of that guarantee lives in the schema
// rejecting content on the way in. Hand-assembling a doc would test the walker against documents
// the editor could never hold, and quietly stop testing the gate that matters.

import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'

import {
  ACTIVECOLLAB_COMMENT_ALLOWED_TAGS,
  activeCollabCommentBodyHtml,
  safeActiveCollabCommentHref
} from './activecollab-comment-body-html'
import { createActiveCollabCommentExtensions } from './activecollab-comment-editor-schema'
import { ACTIVECOLLAB_MENTION_NODE_NAME } from './activecollab-comment-mention-node'

type Insertable = string | Record<string, unknown> | Record<string, unknown>[]

function editorWith(content: Insertable): Editor {
  return new Editor({
    element: null,
    extensions: createActiveCollabCommentExtensions('placeholder'),
    content: content as never
  })
}

/** What the composer would POST for this document. */
function posted(content: Insertable): string {
  return activeCollabCommentBodyHtml(editorWith(content).state.doc)
}

/** Typed as characters, not parsed as markup — what a person hitting `<`, `b`, `>` produces. */
function typedLiterally(text: string): string {
  return posted({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
  })
}

function mentionParagraph(userId: number, name: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: ACTIVECOLLAB_MENTION_NODE_NAME, attrs: { userId, name } }]
      }
    ]
  }
}

/** Every tag name the string opens or closes, so the allowlist can be asserted as a whole. */
function tagsIn(html: string): string[] {
  return [...html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)/g)].map((match) => match[1].toLowerCase())
}

describe('activeCollabCommentBodyHtml formatting', () => {
  it('emits bold as <strong> and nothing else', () => {
    expect(posted('<p>say <strong>this</strong></p>')).toBe('<p>say <strong>this</strong></p>')
  })

  it('emits italics as <em> and nothing else', () => {
    expect(posted('<p>say <em>this</em></p>')).toBe('<p>say <em>this</em></p>')
  })

  it('emits a link as a bare href anchor, dropping every other anchor attribute', () => {
    // target/rel/class/title are all things TipTap or a paste can attach; none of them are the
    // author's intent and none of them are in the allowlist.
    const html = posted(
      '<p><a href="https://efront.com.au/x" target="_blank" rel="noopener" class="x" title="t">docs</a></p>'
    )

    expect(html).toBe('<p><a href="https://efront.com.au/x">docs</a></p>')
  })

  it('nests overlapping marks in one fixed order, so the same document always posts the same bytes', () => {
    const html = posted(
      '<p><a href="https://efront.com.au/"><strong><em>all three</em></strong></a></p>'
    )

    expect(html).toBe(
      '<p><a href="https://efront.com.au/"><strong><em>all three</em></strong></a></p>'
    )
  })

  it('keeps a soft line break as <br> and a blank line as a new paragraph', () => {
    expect(posted('<p>one<br>two</p><p>three</p>')).toBe('<p>one<br>two</p><p>three</p>')
  })

  it('drops paragraphs the author only pressed Enter on', () => {
    expect(posted('<p>one</p><p></p><p>   </p><p>two</p>')).toBe('<p>one</p><p>two</p>')
  })

  it('posts nothing at all for an empty document', () => {
    expect(posted('<p></p>')).toBe('')
  })
})

describe('activeCollabCommentBodyHtml tag allowlist', () => {
  it('emits only allowlisted tags for content well outside the allowlist', () => {
    // Everything here is something a paste from a browser, a doc, or an email can carry.
    const html = posted(
      '<h1>Heading</h1>' +
        '<ul><li>first</li><li>second</li></ul>' +
        '<table><tbody><tr><td>cell</td></tr></tbody></table>' +
        '<blockquote>quoted</blockquote>' +
        '<pre><code>code()</code></pre>' +
        '<img src="https://efront.com.au/x.png">' +
        '<hr>' +
        '<div onclick="steal()" style="position:fixed">divided</div>' +
        '<p>kept</p>'
    )

    expect(new Set(tagsIn(html))).toEqual(new Set(['p']))
    for (const tag of tagsIn(html)) {
      expect(ACTIVECOLLAB_COMMENT_ALLOWED_TAGS).toContain(tag)
    }
    // Dropping the tag must not throw away what the author pasted.
    expect(html).toContain('Heading')
    expect(html).toContain('first')
    expect(html).toContain('kept')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('style=')
  })

  it('never emits an image, however it was pasted', () => {
    const html = posted('<p>before<img src="data:image/png;base64,AAAA">after</p>')

    expect(html).not.toContain('<img')
    expect(html).not.toContain('base64')
  })

  it('renders a strikethrough as plain text, because the composer does not offer one', () => {
    const html = posted('<p><s>gone</s> <u>under</u> <code>mono</code></p>')

    expect(new Set(tagsIn(html))).toEqual(new Set(['p']))
    expect(html).toBe('<p>gone under mono</p>')
  })

  it('turns a pasted script into text rather than markup', () => {
    const html = posted('<p>hi</p><script>steal()</script>')

    expect(html).not.toContain('<script')
    expect(
      tagsIn(html).every((tag) =>
        (ACTIVECOLLAB_COMMENT_ALLOWED_TAGS as readonly string[]).includes(tag)
      )
    ).toBe(true)
  })
})

describe('activeCollabCommentBodyHtml link safety', () => {
  it('never lets a javascript: href reach the output, while keeping the words', () => {
    const html = posted('<p><a href="javascript:alert(1)">click me</a></p>')

    expect(html).toBe('<p>click me</p>')
    expect(html).not.toContain('javascript')
  })

  it('never lets a data: href reach the output', () => {
    expect(posted('<p><a href="data:text/html,<script>steal()</script>">x</a></p>')).not.toContain(
      'data:'
    )
  })

  it('rejects a scheme obfuscated with whitespace the URL parser strips', () => {
    // A regex on the raw string sees "java\tscript:" and passes it; the parser resolves it to
    // javascript: and so does the browser that eventually renders the comment.
    expect(safeActiveCollabCommentHref('java\tscript:alert(1)')).toBeNull()
    expect(safeActiveCollabCommentHref('\u0001javascript:alert(1)')).toBeNull()
    expect(safeActiveCollabCommentHref('  JavaScript:alert(1)  ')).toBeNull()
    expect(safeActiveCollabCommentHref('vbscript:x')).toBeNull()
  })

  it('keeps the hrefs a comment legitimately carries, byte for byte', () => {
    expect(safeActiveCollabCommentHref('https://projects.efront.com.au/projects/5937')).toBe(
      'https://projects.efront.com.au/projects/5937'
    )
    expect(safeActiveCollabCommentHref('mailto:ada@efront.com.au')).toBe('mailto:ada@efront.com.au')
    expect(safeActiveCollabCommentHref('  https://x.test/a  ')).toBe('https://x.test/a')
  })

  it('escapes a quote inside an href so it cannot break out of the attribute', () => {
    const html = posted('<p><a href="https://x.test/?q=&quot;a">q</a></p>')

    expect(html).toBe('<p><a href="https://x.test/?q=&quot;a">q</a></p>')
  })
})

describe('activeCollabCommentBodyHtml escaping', () => {
  it('escapes typed markup so a literal tag cannot become live HTML on the instance', () => {
    expect(typedLiterally('<b>bold</b> & "quoted"')).toBe(
      '<p>&lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot;</p>'
    )
  })

  it('escapes a typed script tag rather than emitting one', () => {
    const html = typedLiterally('<script>steal()</script>')

    expect(html).toBe('<p>&lt;script&gt;steal()&lt;/script&gt;</p>')
    expect(tagsIn(html)).toEqual(['p', 'p'])
  })
})

describe('activeCollabCommentBodyHtml mentions', () => {
  it('writes the new_mention span the server recognises', () => {
    expect(posted(mentionParagraph(12, 'Ada Lovelace'))).toBe(
      '<p><span class="new_mention" data-user-id="12" data-type="user">Ada Lovelace</span></p>'
    )
  })

  it('escapes the name inside the span, so a name cannot smuggle markup into the body', () => {
    expect(posted(mentionParagraph(5, 'A<b>&"c'))).toBe(
      '<p><span class="new_mention" data-user-id="5" data-type="user">A&lt;b&gt;&amp;&quot;c</span></p>'
    )
  })

  it('degrades an unaddressable mention to plain text rather than notifying nobody', () => {
    for (const userId of [0, -1, 1.5, Number.NaN]) {
      const html = posted(mentionParagraph(userId, 'Ada Lovelace'))

      expect(html).toBe('<p>Ada Lovelace</p>')
      expect(html).not.toContain('new_mention')
    }
  })

  it('is the only thing that ever emits a span, and only with the three expected attributes', () => {
    const html = posted(mentionParagraph(407, 'Jake Varrese'))
    const spanAttributes = /<span ([^>]*)>/.exec(html)?.[1]

    expect(spanAttributes).toBe('class="new_mention" data-user-id="407" data-type="user"')
  })

  it('does NOT emit the read format, which renders as text and notifies nobody', () => {
    expect(posted(mentionParagraph(12, 'Ada Lovelace'))).not.toContain('mention-user')
  })

  it('carries a mention through the surrounding prose in document order', () => {
    const html = posted({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Ping ' },
            { type: ACTIVECOLLAB_MENTION_NODE_NAME, attrs: { userId: 12, name: 'Ada Lovelace' } },
            { type: 'text', text: ' please look at ' },
            { type: 'text', marks: [{ type: 'bold' }], text: 'this' }
          ]
        }
      ]
    })

    expect(html).toBe(
      '<p>Ping <span class="new_mention" data-user-id="12" data-type="user">Ada Lovelace</span>' +
        ' please look at <strong>this</strong></p>'
    )
  })

  it('mints a mention only from a real node, never from a hand-typed @Name', () => {
    // The old composer substituted picked names by text, so this string alone produced a mention —
    // and produced one for EVERY repetition of the name. There is nothing to match any more.
    const html = typedLiterally('@Ada Lovelace and also @Ada Lovelace')

    expect(html).toBe('<p>@Ada Lovelace and also @Ada Lovelace</p>')
    expect(html).not.toContain('new_mention')
  })
})
