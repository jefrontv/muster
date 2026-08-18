// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RepoIcon } from '../../../../shared/repo-icon'
import { RepoIconGlyph, maskedIconStyle } from './repo-icon'

const SRC = 'data:image/png;base64,AAAA'
const FAVICON: RepoIcon = { type: 'image', src: SRC, source: 'favicon' }

let container: HTMLDivElement
let root: Root

function render(icon: RepoIcon): void {
  act(() => root.render(<RepoIconGlyph repoIcon={icon} />))
}

describe('RepoIconGlyph image tint', () => {
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('renders the artwork as-is when no tint is set', () => {
    render(FAVICON)
    expect(container.querySelector(`img[src="${SRC}"]`)).not.toBeNull()
  })

  it('paints the tint through the artwork instead of drawing the image', () => {
    render({ ...FAVICON, tint: '#ef4444' })
    // The <img> must go: an image layered under a mask would still show through.
    expect(container.querySelector('img')).toBeNull()
    const masked = container.querySelector<HTMLElement>('span > span')
    expect(masked?.style.backgroundColor).toBe('#ef4444')
    expect(masked?.style.getPropertyValue('mask')).toContain(SRC)
  })

  it('quotes a src that would otherwise break out of the mask url()', () => {
    const style = maskedIconStyle('https://x.test/a".png', '#000000')
    expect(String(style.mask)).toContain('%22')
    expect(String(style.mask)).not.toContain('a".png')
  })
})
