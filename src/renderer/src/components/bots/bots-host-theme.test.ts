// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { botsHostThemeScript, readBotsHostTheme } from './bots-host-theme'

afterEach(() => {
  document.documentElement.className = ''
  document.documentElement.removeAttribute('style')
})

describe('bots host theme', () => {
  it("reads Muster's live tokens and dark flag from <html>", () => {
    const root = document.documentElement
    root.classList.add('dark')
    root.style.setProperty('--background-solid', '#101010')
    root.style.setProperty('--chat-accent', ' #4176e6 ')

    const theme = readBotsHostTheme(root)

    expect(theme.dark).toBe(true)
    expect(theme.tokens['background-solid']).toBe('#101010')
    expect(theme.tokens['chat-accent']).toBe('#4176e6')
    expect(theme.tokens).not.toHaveProperty('terminal-pane-locate')
  })

  it('stores the theme on the guest and asks it to paint', () => {
    const script = botsHostThemeScript({ dark: false, tokens: { foreground: '#0a0a0a' } })
    const guest: { __musterHostTheme?: unknown; __musterApplyHostTheme?: () => void } = {}
    let painted = 0
    guest.__musterApplyHostTheme = () => painted++
    new Function('window', script)(guest)
    expect(guest.__musterHostTheme).toEqual({ dark: false, tokens: { foreground: '#0a0a0a' } })
    expect(painted).toBe(1)
  })
})
