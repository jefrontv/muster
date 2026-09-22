import { describe, expect, it } from 'vitest'
import { editorThemeTerminalColors } from './vscode-theme-to-terminal'

const ANSI = {
  'terminal.ansiBlack': '#000000',
  'terminal.ansiRed': '#ff0000',
  'terminal.ansiGreen': '#00ff00',
  'terminal.ansiYellow': '#ffff00',
  'terminal.ansiBlue': '#0000ff',
  'terminal.ansiMagenta': '#ff00ff',
  'terminal.ansiCyan': '#00ffff',
  'terminal.ansiWhite': '#ffffff'
}

describe('editorThemeTerminalColors', () => {
  it('maps the eight base ANSI colours', () => {
    expect(editorThemeTerminalColors(ANSI)).toMatchObject({
      black: '#000000',
      red: '#ff0000',
      green: '#00ff00',
      yellow: '#ffff00',
      blue: '#0000ff',
      magenta: '#ff00ff',
      cyan: '#00ffff',
      white: '#ffffff'
    })
  })

  it('maps the bright set too', () => {
    const result = editorThemeTerminalColors({
      ...ANSI,
      'terminal.ansiBrightBlack': '#666666',
      'terminal.ansiBrightRed': '#ff6666'
    })
    expect(result).toMatchObject({ brightBlack: '#666666', brightRed: '#ff6666' })
  })

  it('maps the cursor and selection keys', () => {
    const result = editorThemeTerminalColors({
      ...ANSI,
      'terminalCursor.foreground': '#aabbcc',
      'terminal.selectionBackground': '#112233'
    })
    expect(result).toMatchObject({ cursor: '#aabbcc', selectionBackground: '#112233' })
  })

  it('answers null when the base ANSI set is incomplete', () => {
    // Half a palette is worse than none: the terminal would take the rest from the old theme.
    const { 'terminal.ansiBlue': _removed, ...partial } = ANSI
    expect(editorThemeTerminalColors(partial)).toBeNull()
  })

  it('answers null for a theme with no terminal colours at all', () => {
    expect(editorThemeTerminalColors({ 'editor.background': '#1e1e1e' })).toBeNull()
  })

  it('falls back to the editor background, which is what VS Code shows', () => {
    const result = editorThemeTerminalColors({ ...ANSI, 'editor.background': '#1e1e1e' })
    expect(result?.background).toBe('#1e1e1e')
  })

  it('prefers an explicit terminal background over the editor one', () => {
    const result = editorThemeTerminalColors({
      ...ANSI,
      'terminal.background': '#101010',
      'editor.background': '#1e1e1e'
    })
    expect(result?.background).toBe('#101010')
  })

  it('falls back to the editor foreground', () => {
    const result = editorThemeTerminalColors({ ...ANSI, 'editor.foreground': '#d4d4d4' })
    expect(result?.foreground).toBe('#d4d4d4')
  })

  it('drops alpha, because a translucent ANSI red is not red', () => {
    const result = editorThemeTerminalColors({ ...ANSI, 'terminal.ansiRed': '#ff000080' })
    expect(result?.red).toBe('#ff0000')
  })

  it('expands a short colour', () => {
    const result = editorThemeTerminalColors({ ...ANSI, 'terminal.ansiRed': '#f00' })
    expect(result?.red).toBe('#ff0000')
  })
})
