import { describe, expect, it } from 'vitest'
import { composeActiveTerminalTheme } from './terminal-appearance'
import type { GlobalSettings } from '../../../../shared/types'

describe('composeActiveTerminalTheme', () => {
  function settingsWith(partial: Partial<GlobalSettings>): GlobalSettings {
    return {
      terminalColorOverrides: undefined,
      terminalCursorOpacity: undefined,
      terminalBackgroundOpacity: undefined,
      ...partial
    } as GlobalSettings
  }

  it('layers terminal scrollbar defaults under the base theme', () => {
    const base = { background: '#101010', foreground: '#fafafa', cursor: '#fafafa' }
    const result = composeActiveTerminalTheme(base, settingsWith({}))
    expect(result).toEqual({
      overviewRulerBorder: 'transparent',
      scrollbarSliderBackground: 'rgba(180, 180, 185, 0.4)',
      scrollbarSliderHoverBackground: 'rgba(180, 180, 185, 0.6)',
      scrollbarSliderActiveBackground: 'rgba(180, 180, 185, 0.8)',
      ...base
    })
  })

  it('lets the base theme override terminal scrollbar defaults', () => {
    const result = composeActiveTerminalTheme(
      {
        background: '#101010',
        overviewRulerBorder: '#222222',
        scrollbarSliderBackground: 'rgba(1, 2, 3, 0.4)'
      },
      settingsWith({})
    )

    expect(result!.overviewRulerBorder).toBe('#222222')
    expect(result!.scrollbarSliderBackground).toBe('rgba(1, 2, 3, 0.4)')
  })

  it('layers terminalColorOverrides on top of the base theme', () => {
    const base = { background: '#101010', foreground: '#fafafa' }
    const result = composeActiveTerminalTheme(
      base,
      settingsWith({ terminalColorOverrides: { foreground: '#00ff00' } })
    )
    expect(result!.foreground).toBe('#00ff00')
    expect(result!.background).toBe('#101010')
  })

  it('applies background opacity by converting the hex background to rgba', () => {
    const base = { background: '#112233' }
    const result = composeActiveTerminalTheme(
      base,
      settingsWith({ terminalBackgroundOpacity: 0.5 })
    )
    expect(result!.background).toBe('rgba(17, 34, 51, 0.5)')
  })

  it('honors a zero background opacity', () => {
    // Why: pin against a regression where the guard becomes truthy-only
    // (e.g. `if (settings.terminalBackgroundOpacity)`) and silently drops
    // the user's intent to make the background fully transparent.
    const base = { background: '#112233' }
    const result = composeActiveTerminalTheme(base, settingsWith({ terminalBackgroundOpacity: 0 }))
    expect(result!.background).toBe('rgba(17, 34, 51, 0)')
  })

  it('applies cursor opacity only when the cursor is a hex color', () => {
    const base = { cursor: '#ffffff' }
    const result = composeActiveTerminalTheme(base, settingsWith({ terminalCursorOpacity: 0.3 }))
    expect(result!.cursor).toBe('rgba(255, 255, 255, 0.3)')
  })

  it('leaves named CSS cursor colors untouched when applying opacity', () => {
    const base = { cursor: 'red' }
    const result = composeActiveTerminalTheme(base, settingsWith({ terminalCursorOpacity: 0.3 }))
    expect(result!.cursor).toBe('red')
  })

  it('returns null when given a null base theme', () => {
    expect(composeActiveTerminalTheme(null, settingsWith({}))).toBeNull()
  })
})

describe('composeActiveTerminalTheme cursor color from theme', () => {
  function settingsWith(partial: Partial<GlobalSettings>): GlobalSettings {
    return { ...partial } as GlobalSettings
  }

  const THEMED = { background: '#101010', foreground: '#fafafa', cursor: '#528bff' }

  it('keeps the theme cursor while the setting is absent, so an upgrade changes nothing', () => {
    const result = composeActiveTerminalTheme(THEMED, settingsWith({}))
    expect(result!.cursor).toBe('#528bff')
    expect(result!.cursorAccent).toBeUndefined()
  })

  it('keeps the theme cursor while the setting is explicitly on', () => {
    const result = composeActiveTerminalTheme(
      THEMED,
      settingsWith({ terminalCursorUseThemeColor: true })
    )
    expect(result!.cursor).toBe('#528bff')
  })

  it('falls back to reverse video when opted out', () => {
    const result = composeActiveTerminalTheme(
      THEMED,
      settingsWith({ terminalCursorUseThemeColor: false })
    )
    // The theme's accent-blue cursor is gone; text colour on background is what a terminal does.
    expect(result!.cursor).toBe('#fafafa')
    expect(result!.cursorAccent).toBe('#101010')
  })

  it('never emits an undefined cursor, which xterm would paint white on a light theme', () => {
    // A base theme carrying neither foreground nor background is the trap: dropping the keys would
    // hand xterm its hardcoded #ffffff.
    const result = composeActiveTerminalTheme(
      { cursor: '#528bff' },
      settingsWith({ terminalCursorUseThemeColor: false })
    )
    expect(result!.cursor).toBe('#ffffff')
    expect(result!.cursorAccent).toBe('#000000')
  })

  it('lets an explicit cursor override win over the opt-out', () => {
    const result = composeActiveTerminalTheme(
      THEMED,
      settingsWith({
        terminalCursorUseThemeColor: false,
        terminalColorOverrides: { cursor: '#ff00ff' }
      })
    )
    // Precedence is override > opt-out > theme: turning the theme's cursor off must not silently
    // discard a colour the user typed in the advanced overrides.
    expect(result!.cursor).toBe('#ff00ff')
    expect(result!.cursorAccent).toBe('#101010')
  })

  it('measures reverse video against an overridden foreground, not the theme underneath', () => {
    const result = composeActiveTerminalTheme(
      THEMED,
      settingsWith({
        terminalCursorUseThemeColor: false,
        terminalColorOverrides: { foreground: '#00ff00', background: '#000033' }
      })
    )
    // The point of the opt-out is that the cursor matches the text on screen. Reading the base
    // theme here would give '#fafafa' against green text.
    expect(result!.cursor).toBe('#00ff00')
    expect(result!.cursorAccent).toBe('#000033')
  })

  it('still applies cursor opacity to the fallback colour', () => {
    const result = composeActiveTerminalTheme(
      THEMED,
      settingsWith({ terminalCursorUseThemeColor: false, terminalCursorOpacity: 0.3 })
    )
    expect(result!.cursor).toBe('rgba(250, 250, 250, 0.3)')
  })
})
