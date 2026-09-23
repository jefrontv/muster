import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import StatusIndicator, { type Status } from './StatusIndicator'

function renderMarkup(status: Status): string {
  return renderToStaticMarkup(React.createElement(StatusIndicator, { status }))
}

function renderDotClassNames(status: Status): string[] {
  const markup = renderMarkup(status)
  const dotClassName = markup.match(/<svg[^>]*class="([^"]*fill-[^"]*)"/)?.[1]

  expect(dotClassName).toBeDefined()

  return dotClassName!.split(/\s+/)
}

describe('StatusIndicator', () => {
  it('renders working as a clock-driven yellow spinner ring', () => {
    const markup = renderMarkup('working')

    expect(markup).toContain('agent-working-spinner')
    // Why: rotation comes from the shared agent-spinner clock, not a
    // per-element CSS animation that would keep the compositor awake.
    expect(markup).toContain('data-agent-spinner')
    // Why: under reduced motion the top border is filled so the static ring
    // reads as a complete marker, not a broken partial spinner (#9515).
    expect(markup).toContain('motion-reduce:opacity-100')
    expect(markup).not.toContain('animate-spin')
    expect(markup).not.toContain('animation:spin')
  })

  it('renders permission as an amber question glyph', () => {
    const markup = renderMarkup('permission')

    expect(markup).toContain('lucide-message-circle-question-mark')
    expect(markup).toContain('text-status-attention')
    expect(markup).not.toContain('bg-status-attention')
    expect(markup).not.toContain('data-agent-spinner')
  })

  it('renders active as full emerald dot', () => {
    const classNames = renderDotClassNames('active')

    expect(classNames).toContain('fill-status-success')
  })

  it('renders done as an emerald dot', () => {
    const classNames = renderDotClassNames('done')

    expect(classNames).toContain('fill-status-success')
  })
})
