// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { canonicalActiveCollabCommentHtml } from './activecollab-comment-canonical-html'

describe('canonicalActiveCollabCommentHtml', () => {
  it('keeps what the composer can emit, mentions included', () => {
    const html =
      '<p>Hey <span class="new_mention" data-user-id="12" data-type="user">Felicity</span>, <strong>done</strong> <a href="https://dev.example/x">here</a></p>'
    const out = canonicalActiveCollabCommentHtml(html)
    expect(out).toContain('data-user-id="12"')
    expect(out).toContain('<strong>done</strong>')
    expect(out).toContain('href="https://dev.example/x"')
  })

  it('drops scripts, handlers, unsafe links and unknown tags', () => {
    const out = canonicalActiveCollabCommentHtml(
      '<p onclick="x()">Hi <script>alert(1)</script><img src=x onerror=y><a href="javascript:alert(1)">bad</a><h1>Big</h1></p>'
    )
    expect(out).not.toMatch(/script|onclick|onerror|<img|javascript:|<h1/)
    expect(out).toContain('Hi')
  })
})
