import { describe, expect, it } from 'vitest'
import { themesForEditor, themesForEditors, type ThemeCatalogEnv } from './theme-catalog'
import type { EditorInstallPaths } from './editor-installs'

function env(files: Record<string, string>, dirs: Record<string, string[]> = {}): ThemeCatalogEnv {
  return {
    listDirectory: async (path) => dirs[path] ?? [],
    readTextFile: async (path) => files[path] ?? null
  }
}

function install(overrides: Partial<EditorInstallPaths> = {}): EditorInstallPaths {
  return {
    kind: 'vscode',
    label: 'VS Code',
    extensionsDir: '/home/.vscode/extensions',
    builtinThemesDirs: [],
    settingsFile: '/home/settings.json',
    ...overrides
  }
}

const MANIFEST = JSON.stringify({
  name: 'winteriscoming',
  displayName: 'Winter is Coming Theme',
  contributes: {
    themes: [
      { label: 'Winter is Coming (Light)', uiTheme: 'vs', path: './themes/light.json' },
      { label: 'Winter is Coming (Dark)', uiTheme: 'vs-dark', path: './themes/dark.json' }
    ]
  }
})

describe('themesForEditor', () => {
  it('reads every theme an extension declares', async () => {
    const themes = await themesForEditor(
      install(),
      env(
        { '/home/.vscode/extensions/winter-1.0.0/package.json': MANIFEST },
        { '/home/.vscode/extensions': ['winter-1.0.0'] }
      )
    )
    expect(themes.map((theme) => theme.name)).toEqual([
      'Winter is Coming (Light)',
      'Winter is Coming (Dark)'
    ])
    expect(themes[0]).toMatchObject({
      source: 'vscode',
      sourceLabel: 'Winter is Coming Theme',
      filePath: '/home/.vscode/extensions/winter-1.0.0/themes/light.json',
      themesDir: '/home/.vscode/extensions/winter-1.0.0/themes',
      uiTheme: 'vs'
    })
  })

  it('resolves an NLS placeholder name', async () => {
    // Every theme VS Code ships names itself this way; without this the picker shows the key.
    const themes = await themesForEditor(
      install(),
      env(
        {
          '/home/.vscode/extensions/defaults/package.json': JSON.stringify({
            displayName: '%displayName%',
            contributes: {
              themes: [{ label: '%darkPlusColorThemeLabel%', path: './themes/dark_plus.json' }]
            }
          }),
          '/home/.vscode/extensions/defaults/package.nls.json': JSON.stringify({
            displayName: 'Default Themes',
            darkPlusColorThemeLabel: 'Dark+'
          })
        },
        { '/home/.vscode/extensions': ['defaults'] }
      )
    )
    expect(themes[0]).toMatchObject({ name: 'Dark+', sourceLabel: 'Default Themes' })
  })

  it('resolves the object form of an NLS entry', async () => {
    const themes = await themesForEditor(
      install(),
      env(
        {
          '/home/.vscode/extensions/x/package.json': JSON.stringify({
            displayName: 'X',
            contributes: { themes: [{ label: '%lbl%', path: './t.json' }] }
          }),
          '/home/.vscode/extensions/x/package.nls.json': JSON.stringify({
            lbl: { message: 'Translated', comment: ['for translators'] }
          })
        },
        { '/home/.vscode/extensions': ['x'] }
      )
    )
    expect(themes[0].name).toBe('Translated')
  })

  it('leaves an unresolvable placeholder visible rather than blanking the row', async () => {
    const themes = await themesForEditor(
      install(),
      env(
        {
          '/home/.vscode/extensions/x/package.json': JSON.stringify({
            displayName: 'X',
            contributes: { themes: [{ label: '%missing%', path: './t.json' }] }
          })
        },
        { '/home/.vscode/extensions': ['x'] }
      )
    )
    expect(themes[0].name).toBe('%missing%')
  })

  it('keeps the declared id, which is what settings.json stores', async () => {
    // The built-in dark theme is id "Visual Studio Dark" with label "Dark (Visual Studio)".
    // Matching the setting against the label alone leaves the user's current theme unmarked.
    const themes = await themesForEditor(
      install(),
      env(
        {
          '/home/.vscode/extensions/defaults/package.json': JSON.stringify({
            displayName: 'Default Themes',
            contributes: {
              themes: [
                {
                  id: 'Visual Studio Dark',
                  label: 'Dark (Visual Studio)',
                  uiTheme: 'vs-dark',
                  path: './themes/dark_vs.json'
                }
              ]
            }
          })
        },
        { '/home/.vscode/extensions': ['defaults'] }
      )
    )
    expect(themes[0]).toMatchObject({
      name: 'Dark (Visual Studio)',
      declaredId: 'Visual Studio Dark'
    })
  })

  it('omits declaredId when the declaration has none', async () => {
    const themes = await themesForEditor(
      install(),
      env(
        {
          '/home/.vscode/extensions/winter-1.0.0/package.json': MANIFEST
        },
        { '/home/.vscode/extensions': ['winter-1.0.0'] }
      )
    )
    expect(themes[0].declaredId).toBeUndefined()
  })

  it('ignores an extension that declares no themes', async () => {
    const themes = await themesForEditor(
      install(),
      env(
        {
          '/home/.vscode/extensions/lint/package.json': JSON.stringify({
            displayName: 'Linter',
            contributes: { commands: [] }
          })
        },
        { '/home/.vscode/extensions': ['lint'] }
      )
    )
    expect(themes).toEqual([])
  })

  it('ignores a directory with no manifest at all', async () => {
    expect(
      await themesForEditor(install(), env({}, { '/home/.vscode/extensions': ['stray'] }))
    ).toEqual([])
  })

  it('refuses a declared path that climbs out of the extension', async () => {
    const themes = await themesForEditor(
      install(),
      env(
        {
          '/home/.vscode/extensions/evil/package.json': JSON.stringify({
            displayName: 'Evil',
            contributes: { themes: [{ label: 'Evil', path: '../../../etc/passwd' }] }
          })
        },
        { '/home/.vscode/extensions': ['evil'] }
      )
    )
    expect(themes).toEqual([])
  })

  it('skips a declaration with no path or no label', async () => {
    const themes = await themesForEditor(
      install(),
      env(
        {
          '/home/.vscode/extensions/x/package.json': JSON.stringify({
            displayName: 'X',
            contributes: { themes: [{ label: 'No path' }, { path: './t.json' }] }
          })
        },
        { '/home/.vscode/extensions': ['x'] }
      )
    )
    expect(themes).toEqual([])
  })

  it('finds built-ins through the manifest beside their themes folder', async () => {
    // The bundled dirs point at `<extension>/themes`, so the manifest is one level up.
    const themes = await themesForEditor(
      install({ builtinThemesDirs: ['/apps/Code/resources/app/extensions/theme-defaults/themes'] }),
      env({
        '/apps/Code/resources/app/extensions/theme-defaults/package.json': JSON.stringify({
          displayName: 'Default Themes',
          contributes: { themes: [{ label: 'Dark Modern', path: './themes/dark_modern.json' }] }
        })
      })
    )
    expect(themes[0]).toMatchObject({
      name: 'Dark Modern',
      sourceLabel: 'Default Themes',
      filePath: '/apps/Code/resources/app/extensions/theme-defaults/themes/dark_modern.json'
    })
  })

  it('does not list the same theme twice when a directory is scanned twice', async () => {
    const themes = await themesForEditor(
      install({
        builtinThemesDirs: [
          '/apps/Code/resources/app/extensions/theme-defaults/themes',
          '/apps/Code/resources/app/extensions/theme-defaults/themes'
        ]
      }),
      env({
        '/apps/Code/resources/app/extensions/theme-defaults/package.json': JSON.stringify({
          displayName: 'Default Themes',
          contributes: { themes: [{ label: 'Dark Modern', path: './themes/dark_modern.json' }] }
        })
      })
    )
    expect(themes).toHaveLength(1)
  })

  it('answers empty when the editor is not installed', async () => {
    expect(await themesForEditor(install(), env({}))).toEqual([])
  })
})

describe('themesForEditors', () => {
  it('keeps the same theme from two editors apart', async () => {
    // Cursor mirrors VS Code's layout, so the same extension is commonly installed in both.
    const files = {
      '/home/.vscode/extensions/winter-1.0.0/package.json': MANIFEST,
      '/home/.cursor/extensions/winter-1.0.0/package.json': MANIFEST
    }
    const dirs = {
      '/home/.vscode/extensions': ['winter-1.0.0'],
      '/home/.cursor/extensions': ['winter-1.0.0']
    }
    const themes = await themesForEditors(
      [
        install(),
        install({ kind: 'cursor', label: 'Cursor', extensionsDir: '/home/.cursor/extensions' })
      ],
      env(files, dirs)
    )
    expect(themes).toHaveLength(4)
    expect(new Set(themes.map((theme) => theme.id)).size).toBe(4)
    expect(themes.filter((theme) => theme.source === 'cursor')).toHaveLength(2)
  })
})
