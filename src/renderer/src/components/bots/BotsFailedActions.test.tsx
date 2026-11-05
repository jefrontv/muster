import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { BotsFailedActions } from './BotsFailedActions'

describe('BotsFailedActions', () => {
  it('offers restart, copy and log actions', () => {
    const markup = renderToStaticMarkup(
      <BotsFailedActions error="The bots server exited (code 1)." onRestart={vi.fn()} />
    )
    expect(markup).toContain('Restart')
    expect(markup).toContain('Copy error')
    expect(markup).toContain('Open log')
  })
})
