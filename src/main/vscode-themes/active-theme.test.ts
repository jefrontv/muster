import { describe, expect, it } from 'vitest'
import { activeThemeNameSet, readActiveThemeNames, type ActiveThemeEnv } from './active-theme'
import type { EditorInstallPaths } from './editor-installs'

const INSTALL: EditorInstallPaths = {
  kind: 'vscode',
  label: 'VS Code',
  extensionsDir: '/home/.vscode/extensions',
  builtinThemesDirs: [],
  settingsFile: '/home/settings.json'
}

function env(contents: string | null): ActiveThemeEnv {
  return { readTextFile: async () => contents }
}

describe('readActiveThemeNames', () => {
  it('reads the current theme', async () => {
    const names = await readActiveThemeNames(
      INSTALL,
      env('{"workbench.colorTheme": "Visual Studio Dark"}')
    )
    expect(names).toEqual({
      kind: 'vscode',
      colorTheme: 'Visual Studio Dark',
      preferredDark: null,
      preferredLight: null
    })
  })

  it('reads a settings file with comments and a trailing comma', async () => {
    // VS Code writes settings.json with comments, so strict JSON is not an option here.
    const names = await readActiveThemeNames(
      INSTALL,
      env('{\n  // my theme\n  "workbench.colorTheme": "Bluloco Light",\n}')
    )
    expect(names.colorTheme).toBe('Bluloco Light')
  })

  it('reads both preferences when the editor follows the system', async () => {
    const names = await readActiveThemeNames(
      INSTALL,
      env(
        '{"workbench.preferredDarkColorTheme":"Dark Modern","workbench.preferredLightColorTheme":"Light Modern"}'
      )
    )
    expect(names.preferredDark).toBe('Dark Modern')
    expect(names.preferredLight).toBe('Light Modern')
  })

  it('answers nulls when the editor is not installed', async () => {
    const names = await readActiveThemeNames(INSTALL, env(null))
    expect(names.colorTheme).toBeNull()
  })

  it('answers nulls for a settings file too broken to parse', async () => {
    expect((await readActiveThemeNames(INSTALL, env('{"a":'))).colorTheme).toBeNull()
  })

  it('ignores a blank or non-string value', async () => {
    expect((await readActiveThemeNames(INSTALL, env('{"workbench.colorTheme":"  "}'))).colorTheme).toBeNull()
    expect((await readActiveThemeNames(INSTALL, env('{"workbench.colorTheme":42}'))).colorTheme).toBeNull()
  })
})

describe('activeThemeNameSet', () => {
  it('includes every theme in play, not just the visible one', async () => {
    const set = activeThemeNameSet({
      kind: 'vscode',
      colorTheme: 'Dark Modern',
      preferredDark: 'Dark Modern',
      preferredLight: 'Light Modern'
    })
    expect(set).toEqual(new Set(['Dark Modern', 'Light Modern']))
  })

  it('is empty when nothing is set', () => {
    expect(
      activeThemeNameSet({ kind: 'cursor', colorTheme: null, preferredDark: null, preferredLight: null })
    ).toEqual(new Set())
  })
})
