// Where VS Code and Cursor keep their themes and their settings, per platform.
//
// Two locations per editor, and both are needed. Extension themes sit under `~/.vscode/extensions`,
// which is the obvious one; the built-in themes live inside the application bundle and are not in
// that folder at all. That second one is not an edge case — `workbench.colorTheme` on the machine
// this was written against reads `Visual Studio Dark`, a built-in — so an extensions-only scan
// misses the theme the user is actually looking at.
//
// Pure apart from the injected environment, so the path logic for three platforms is testable on
// one. Cursor is a VS Code fork and mirrors the whole layout under its own names.

import { delimiter } from 'node:path'

export type EditorKind = 'vscode' | 'cursor'

export type EditorInstallPaths = {
  kind: EditorKind
  /** Shown in the picker so two themes of the same name stay tellable apart. */
  label: string
  /** `<home>/.vscode/extensions`, where installed theme extensions live. */
  extensionsDir: string
  /** Theme JSON shipped inside the app, or null when the app is not where we look. */
  builtinThemesDirs: string[]
  /** `settings.json`, for `workbench.colorTheme`. */
  settingsFile: string
}

export type EditorInstallEnv = {
  homeDir: string
  platform: NodeJS.Platform
  /** `process.env`, read for APPDATA and LOCALAPPDATA on Windows. */
  env: Record<string, string | undefined>
}

const EDITORS: readonly {
  kind: EditorKind
  label: string
  extensionsDirName: string
  /** The directory name under Application Support / .config / APPDATA. */
  configDirName: string
  macAppName: string
  linuxAppDirs: readonly string[]
  windowsAppDirs: readonly string[]
}[] = [
  {
    kind: 'vscode',
    label: 'VS Code',
    extensionsDirName: '.vscode',
    configDirName: 'Code',
    macAppName: 'Visual Studio Code',
    linuxAppDirs: ['/usr/share/code', '/opt/visual-studio-code', '/usr/lib/code'],
    windowsAppDirs: ['Programs/Microsoft VS Code']
  },
  {
    kind: 'cursor',
    label: 'Cursor',
    extensionsDirName: '.cursor',
    configDirName: 'Cursor',
    macAppName: 'Cursor',
    linuxAppDirs: ['/usr/share/cursor', '/opt/cursor'],
    windowsAppDirs: ['Programs/cursor', 'Programs/Cursor']
  }
]

/** Joined with forward slashes throughout: `path.join` is applied by the caller that touches disk. */
function join(...parts: string[]): string {
  return parts.filter((part) => part.length > 0).join('/')
}

/** The bundled theme extensions, which are the same set in every VS Code build. */
const BUNDLED_THEME_EXTENSIONS = [
  'theme-defaults',
  'theme-abyss',
  'theme-monokai',
  'theme-monokai-dimmed',
  'theme-solarized-dark',
  'theme-solarized-light',
  'theme-quietlight',
  'theme-red',
  'theme-tomorrow-night-blue',
  'theme-kimbie-dark'
]

/**
 * The bundled theme directories under an app root.
 *
 * `resourcesDir` is a parameter because macOS capitalises it and the others do not: the real path
 * on a Mac is `Contents/Resources/app/extensions/...`, while a Linux install is
 * `/usr/share/code/resources/app/extensions/...`. It reads as a nicety on a stock Mac, where APFS
 * is case-insensitive and either spelling opens the same directory, and stops being one the moment
 * somebody runs a case-sensitive volume, where the wrong case finds nothing at all.
 */
function bundledThemeDirs(appRoot: string, resourcesDir: string): string[] {
  return BUNDLED_THEME_EXTENSIONS.map((extension) =>
    join(appRoot, resourcesDir, 'app/extensions', extension, 'themes')
  )
}

function macBundledDirs(appName: string): string[] {
  return bundledThemeDirs(`/Applications/${appName}.app/Contents`, 'Resources')
}

export function editorInstallPaths(env: EditorInstallEnv): EditorInstallPaths[] {
  return EDITORS.map((editor) => {
    const extensionsDir = join(env.homeDir, editor.extensionsDirName, 'extensions')
    if (env.platform === 'darwin') {
      return {
        kind: editor.kind,
        label: editor.label,
        extensionsDir,
        builtinThemesDirs: macBundledDirs(editor.macAppName),
        settingsFile: join(
          env.homeDir,
          'Library/Application Support',
          editor.configDirName,
          'User/settings.json'
        )
      }
    }
    if (env.platform === 'win32') {
      const appData = env.env.APPDATA ?? join(env.homeDir, 'AppData/Roaming')
      const localAppData = env.env.LOCALAPPDATA ?? join(env.homeDir, 'AppData/Local')
      return {
        kind: editor.kind,
        label: editor.label,
        extensionsDir,
        builtinThemesDirs: editor.windowsAppDirs.flatMap((dir) =>
          bundledThemeDirs(join(localAppData, dir), 'resources')
        ),
        settingsFile: join(appData, editor.configDirName, 'User/settings.json')
      }
    }
    return {
      kind: editor.kind,
      label: editor.label,
      extensionsDir,
      builtinThemesDirs: editor.linuxAppDirs.flatMap((dir) => bundledThemeDirs(dir, 'resources')),
      // XDG_CONFIG_HOME before ~/.config, which is what the editors themselves honour.
      settingsFile: join(
        env.env.XDG_CONFIG_HOME ?? join(env.homeDir, '.config'),
        editor.configDirName,
        'User/settings.json'
      )
    }
  })
}

/** Only useful for reporting which editors were actually found; `delimiter` keeps Windows honest. */
export function describeSearchPaths(paths: readonly EditorInstallPaths[]): string {
  return paths.map((entry) => entry.extensionsDir).join(delimiter)
}
