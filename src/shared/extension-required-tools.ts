// What to tell the user when an extension's install command needs a tool this computer lacks.
//
// Shared so main can build the message when it refuses to run, and the renderer can show the
// install command with a Copy button. A missing pipx used to surface as "exited with code 127".

export type ExtensionMissingTool = {
  tool: string
  /** The command that installs the tool on this platform, or null when it has no one-liner. */
  installCommand: string | null
  /** Where to get the tool when there is no command, for example nodejs.org. */
  installUrl: string | null
  message: string
}

type ToolInstallRoute = {
  /** Per platform; a platform left out has no known one-liner. */
  commands?: Partial<Record<'darwin' | 'linux' | 'win32', { command: string; via?: string }>>
  url?: string
}

const TOOL_INSTALL_ROUTES: Record<string, ToolInstallRoute> = {
  pipx: {
    commands: {
      darwin: { command: 'brew install pipx', via: 'Homebrew' },
      linux: { command: 'python3 -m pip install --user pipx' },
      win32: { command: 'py -m pip install --user pipx' }
    },
    url: 'https://pipx.pypa.io'
  },
  npm: { url: 'https://nodejs.org' },
  node: { url: 'https://nodejs.org' },
  brew: { url: 'https://brew.sh' }
}

function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

export function describeMissingTool(
  extensionName: string,
  tool: string,
  platform: string
): ExtensionMissingTool {
  const route = TOOL_INSTALL_ROUTES[tool]
  const platformCommand =
    platform === 'darwin' || platform === 'linux' || platform === 'win32'
      ? route?.commands?.[platform]
      : undefined
  const needs = `${extensionName} needs ${tool}.`
  if (platformCommand) {
    const how = platformCommand.via ? `with ${platformCommand.via}` : 'with the command below'
    return {
      tool,
      installCommand: platformCommand.command,
      installUrl: route?.url ?? null,
      message: `${needs} Install it ${how}, then try again.`
    }
  }
  if (route?.url) {
    return {
      tool,
      installCommand: null,
      installUrl: route.url,
      message: `${needs} Install it from ${hostOf(route.url)}, then try again.`
    }
  }
  return {
    tool,
    installCommand: null,
    installUrl: null,
    message: `${needs} It is not on this computer. Install it, then try again.`
  }
}

/** The program a shell command starts, e.g. `pipx` for "pipx install activecollab-mcp". */
export function commandProgram(command: string): string | null {
  const first = command.trim().split(/\s+/)[0] ?? ''
  return /^[A-Za-z0-9._-]+$/.test(first) ? first : null
}
