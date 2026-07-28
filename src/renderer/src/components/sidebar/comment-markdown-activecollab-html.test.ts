import { describe, expect, it } from 'vitest'

import {
  ACTIVECOLLAB_CALLOUT_TAG,
  ACTIVECOLLAB_IMAGE_TAG,
  ACTIVECOLLAB_MENTION_TAG,
  isUnauthenticableInstanceImage,
  rehypeActiveCollabHtml
} from './comment-markdown-activecollab-html'

const INSTANCE = 'https://projects.efront.com.au'

type TestNode = {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: TestNode[]
}

function element(tagName: string, properties: Record<string, unknown>, ...children: TestNode[]) {
  return { type: 'element', tagName, properties, children }
}

function run(tree: TestNode, instanceUrl: string | null = INSTANCE): TestNode {
  rehypeActiveCollabHtml({ instanceUrl })()(tree)
  return tree
}

describe('isUnauthenticableInstanceImage', () => {
  it('suppresses instance, relative and sentinel sources', () => {
    for (const src of [
      `${INSTANCE}/api/v1/attachments/249086/download`,
      '/uploads/inline.png',
      'inline.png',
      `${INSTANCE}/attachments/249086/download?intent=--DOWNLOAD-TOKEN--`,
      'https://cdn.example.com/x.png?token=--THUMBNAIL-TOKEN--',
      '',
      undefined
    ]) {
      expect(isUnauthenticableInstanceImage(src, INSTANCE), String(src)).toBe(true)
    }
  })

  it('leaves third-party and already-inlined sources alone', () => {
    for (const src of [
      'https://cdn.example.com/logo.png',
      'http://other.example/logo.png',
      'data:image/png;base64,AAAA',
      'blob:https://projects.efront.com.au/abc'
    ]) {
      expect(isUnauthenticableInstanceImage(src, INSTANCE), src).toBe(false)
    }
  })

  it('still catches relative sources before the connection reports an instance', () => {
    expect(isUnauthenticableInstanceImage('/uploads/inline.png', null)).toBe(true)
    // With no instance to compare against, a real third-party host is not claimed as one.
    expect(isUnauthenticableInstanceImage('https://cdn.example.com/logo.png', null)).toBe(false)
  })
})

describe('rehypeActiveCollabHtml', () => {
  it('retags a mention span and drops its class', () => {
    const mention = element('span', { className: ['mention', 'mention-user'] })
    run({ type: 'root', children: [element('p', {}, mention)] })

    expect(mention.tagName).toBe(ACTIVECOLLAB_MENTION_TAG)
    expect(mention.properties).toEqual({})
  })

  it('retags a callout aside and drops its class', () => {
    const callout = element('aside', { className: ['callout-wrapper', 'aside-note'] })
    run({ type: 'root', children: [callout] })

    expect(callout.tagName).toBe(ACTIVECOLLAB_CALLOUT_TAG)
    expect(callout.properties).toEqual({})
  })

  it('leaves unrelated spans and asides untouched, so no other class is consumed', () => {
    const span = element('span', { className: ['bg-destructive'] })
    const aside = element('aside', { className: ['sidebar'] })
    run({ type: 'root', children: [span, aside] })

    expect(span.tagName).toBe('span')
    expect(aside.tagName).toBe('aside')
  })

  it('demotes provider HTML that mints the private ac-* tags itself', () => {
    const forged = element(ACTIVECOLLAB_MENTION_TAG, {})
    const forgedCallout = element(ACTIVECOLLAB_CALLOUT_TAG, {})
    const forgedImage = element(ACTIVECOLLAB_IMAGE_TAG, {}, {
      type: 'text',
      value: '249016'
    } as TestNode)
    run({ type: 'root', children: [forged, forgedCallout, forgedImage] })

    expect(forged.tagName).toBe('span')
    expect(forgedCallout.tagName).toBe('span')
    expect(forgedImage.tagName).toBe('span')
  })

  it('retags an attachment image onto the stated id, dropping every attribute', () => {
    const image = element('img', {
      src: `/proxy.php?i=--THUMBNAIL-TOKEN--`,
      alt: 'unnamed.png',
      'image-type': 'attachment',
      'object-id': '249016',
      onerror: 'window.stolen = 1'
    })
    run({ type: 'root', children: [element('p', {}, image)] })

    expect(image.tagName).toBe(ACTIVECOLLAB_IMAGE_TAG)
    expect(image.properties).toEqual({})
    expect(image.children).toEqual([{ type: 'text', value: '249016 unnamed.png' }])
  })

  it('carries the bare id when the attachment image is unnamed', () => {
    const image = element('img', { 'image-type': 'attachment', 'object-id': '7' })
    run({ type: 'root', children: [element('p', {}, image)] })

    expect(image.children).toEqual([{ type: 'text', value: '7' }])
  })

  it('still suppresses an instance image whose id is missing or unusable', () => {
    const tree = run({
      type: 'root',
      children: [
        element(
          'p',
          {},
          element('img', { src: '/uploads/relative.png' }),
          element('img', { src: '/uploads/a.png', 'object-id': '249016' }),
          element('img', { src: '/uploads/b.png', 'image-type': 'avatar', 'object-id': '4' }),
          element('img', { src: '/uploads/c.png', 'image-type': 'attachment', 'object-id': '0' }),
          element('img', { src: '/uploads/d.png', 'image-type': 'attachment', 'object-id': 'x' })
        )
      ]
    })

    expect(tree.children?.[0]?.children).toEqual([])
  })

  it('refills a whitespace-only paragraph so the blank line keeps a line box', () => {
    const tree = run({
      type: 'root',
      children: [
        element('p', {}, { type: 'text', value: ' ' } as TestNode),
        element('p', {}),
        element('p', {}, { type: 'text', value: '\u00a0' } as TestNode),
        element('p', {}, { type: 'text', value: '  Real copy  ' } as TestNode)
      ]
    })

    expect(tree.children?.map((child) => child.children)).toEqual([
      [{ type: 'text', value: '\u00a0' }],
      [{ type: 'text', value: '\u00a0' }],
      [{ type: 'text', value: '\u00a0' }],
      [{ type: 'text', value: '  Real copy  ' }]
    ])
  })

  it('leaves a paragraph holding an element alone, even when its text is blank', () => {
    const spacerImage = element('img', { 'image-type': 'attachment', 'object-id': '5' })
    const tree = run({ type: 'root', children: [element('p', {}, spacerImage)] })

    expect(tree.children?.[0]?.children).toEqual([spacerImage])
  })

  it('removes instance images at any depth while keeping third-party ones', () => {
    const tree = run({
      type: 'root',
      children: [
        element(
          'p',
          {},
          element('img', { src: `${INSTANCE}/attachments/1/download` }),
          element('img', { src: 'https://cdn.example.com/logo.png' })
        )
      ]
    })

    const paragraph = tree.children?.[0]
    expect(paragraph?.children?.map((child) => child.properties?.src)).toEqual([
      'https://cdn.example.com/logo.png'
    ])
  })

  it('keeps text nodes and never rebuilds a childless element', () => {
    const tree = run({
      type: 'root',
      children: [element('p', {}, { type: 'text', value: 'plain' } as TestNode)]
    })

    expect(tree.children?.[0]?.children).toEqual([{ type: 'text', value: 'plain' }])
  })
})
