import { describe, expect, it } from 'vitest'
import { editorInstallPaths, type EditorInstallEnv } from './editor-installs'

function env(overrides: Partial<EditorInstallEnv> = {}): EditorInstallEnv {
  return { homeDir: '/Users/someone', platform: 'darwin', env: {}, ...overrides }
}

function forKind(paths: ReturnType<typeof editorInstallPaths>, kind: 'vscode' | 'cursor') {
  const found = paths.find((entry) => entry.kind === kind)
  if (!found) {
    throw new Error(`no paths for ${kind}`)
  }
  return found
}

describe('editorInstallPaths', () => {
  it('covers both editors', () => {
    expect(editorInstallPaths(env()).map((entry) => entry.kind)).toEqual(['vscode', 'cursor'])
  })

  it('finds extensions in the home directory on macOS', () => {
    expect(forKind(editorInstallPaths(env()), 'vscode').extensionsDir).toBe(
      '/Users/someone/.vscode/extensions'
    )
    expect(forKind(editorInstallPaths(env()), 'cursor').extensionsDir).toBe(
      '/Users/someone/.cursor/extensions'
    )
  })

  it('finds macOS settings under Application Support', () => {
    expect(forKind(editorInstallPaths(env()), 'vscode').settingsFile).toBe(
      '/Users/someone/Library/Application Support/Code/User/settings.json'
    )
  })

  it('finds the macOS bundled theme-defaults directory', () => {
    // The real path on this machine, and the one an extensions-only scan misses.
    expect(forKind(editorInstallPaths(env()), 'vscode').builtinThemesDirs).toContain(
      '/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/theme-defaults/themes'
    )
  })

  it('uses the Cursor app name for Cursor built-ins', () => {
    expect(forKind(editorInstallPaths(env()), 'cursor').builtinThemesDirs).toContain(
      '/Applications/Cursor.app/Contents/Resources/app/extensions/theme-defaults/themes'
    )
  })

  it('capitalises Resources on macOS and not elsewhere', () => {
    // Verified against the real install: macOS is Contents/Resources, Linux is lowercase
    // resources. Only matters on a case-sensitive volume, where the wrong case finds nothing.
    const mac = forKind(editorInstallPaths(env()), 'vscode').builtinThemesDirs[0]
    const linux = forKind(editorInstallPaths(env({ platform: 'linux' })), 'vscode')
      .builtinThemesDirs[0]
    expect(mac).toContain('/Contents/Resources/app/')
    expect(linux).toContain('/resources/app/')
  })

  it('reads Linux settings from ~/.config by default', () => {
    const paths = editorInstallPaths(env({ platform: 'linux' }))
    expect(forKind(paths, 'vscode').settingsFile).toBe(
      '/Users/someone/.config/Code/User/settings.json'
    )
  })

  it('honours XDG_CONFIG_HOME on Linux', () => {
    const paths = editorInstallPaths(
      env({ platform: 'linux', env: { XDG_CONFIG_HOME: '/custom/config' } })
    )
    expect(forKind(paths, 'vscode').settingsFile).toBe('/custom/config/Code/User/settings.json')
  })

  it('looks in the usual Linux install roots for built-ins', () => {
    const dirs = forKind(editorInstallPaths(env({ platform: 'linux' })), 'vscode').builtinThemesDirs
    expect(dirs).toContain('/usr/share/code/resources/app/extensions/theme-defaults/themes')
    expect(dirs).toContain('/opt/visual-studio-code/resources/app/extensions/theme-defaults/themes')
  })

  it('reads Windows settings from APPDATA', () => {
    const paths = editorInstallPaths(
      env({ platform: 'win32', env: { APPDATA: 'C:/Users/someone/AppData/Roaming' } })
    )
    expect(forKind(paths, 'vscode').settingsFile).toBe(
      'C:/Users/someone/AppData/Roaming/Code/User/settings.json'
    )
  })

  it('falls back to the conventional Windows paths when the variables are unset', () => {
    const paths = editorInstallPaths(env({ platform: 'win32' }))
    expect(forKind(paths, 'vscode').settingsFile).toBe(
      '/Users/someone/AppData/Roaming/Code/User/settings.json'
    )
    expect(forKind(paths, 'vscode').builtinThemesDirs[0]).toContain(
      'AppData/Local/Programs/Microsoft VS Code'
    )
  })

  it('keeps extensions in the home directory on every platform', () => {
    for (const platform of ['darwin', 'linux', 'win32'] as NodeJS.Platform[]) {
      expect(forKind(editorInstallPaths(env({ platform })), 'vscode').extensionsDir).toBe(
        '/Users/someone/.vscode/extensions'
      )
    }
  })
})
