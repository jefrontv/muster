import { describe, expect, it } from 'vitest'
import { buildActiveCollabMcpSetupCommand } from './activecollab-mcp-setup-command'

const PIPX_PATH = '/Users/tester/.local/bin/activecollab-mcp'

describe('buildActiveCollabMcpSetupCommand', () => {
  it('runs the absolute detected path, never the bare binary name', () => {
    const command = buildActiveCollabMcpSetupCommand({
      binaryPath: PIPX_PATH,
      platform: 'darwin'
    })

    expect(command).toBe(`'${PIPX_PATH}' setup; exit`)
    expect(command).not.toMatch(/(^|\s)activecollab-mcp setup/)
  })

  it('closes the shell after setup so the card can observe completion', () => {
    for (const platform of ['darwin', 'linux'] as const) {
      expect(buildActiveCollabMcpSetupCommand({ binaryPath: PIPX_PATH, platform })).toMatch(
        /; exit$/
      )
    }
  })

  it('escapes an apostrophe in the path instead of breaking out of the quoted span', () => {
    expect(
      buildActiveCollabMcpSetupCommand({
        binaryPath: "/Users/o'brien/.local/bin/activecollab-mcp",
        platform: 'linux'
      })
    ).toBe(`'/Users/o'\\''brien/.local/bin/activecollab-mcp' setup; exit`)
  })

  it('uses the PowerShell call operator so a quoted path is executed, not echoed', () => {
    expect(
      buildActiveCollabMcpSetupCommand({
        binaryPath: 'C:\\Users\\Test User\\.local\\bin\\activecollab-mcp.exe',
        platform: 'win32',
        windowsShell: 'powershell.exe'
      })
    ).toBe(`& 'C:\\Users\\Test User\\.local\\bin\\activecollab-mcp.exe' setup; exit`)
  })

  it('doubles an apostrophe for PowerShell rather than backslash-escaping it', () => {
    expect(
      buildActiveCollabMcpSetupCommand({
        binaryPath: "C:\\Users\\O'Brien\\activecollab-mcp.exe",
        platform: 'win32',
        windowsShell: 'pwsh.exe'
      })
    ).toBe(`& 'C:\\Users\\O''Brien\\activecollab-mcp.exe' setup; exit`)
  })

  it('separates the cmd.exe exit with & so a failing setup still closes the shell', () => {
    expect(
      buildActiveCollabMcpSetupCommand({
        binaryPath: 'C:\\Users\\Test\\activecollab-mcp.exe',
        platform: 'win32',
        windowsShell: 'cmd.exe'
      })
    ).toBe('"C:\\Users\\Test\\activecollab-mcp.exe" setup & exit')
  })

  it('refuses a cmd.exe path holding characters cmd cannot quote', () => {
    for (const binaryPath of ['C:\\a"b\\activecollab-mcp.exe', 'C:\\100%\\activecollab-mcp.exe']) {
      expect(
        buildActiveCollabMcpSetupCommand({ binaryPath, platform: 'win32', windowsShell: 'cmd.exe' })
      ).toBeNull()
    }
  })

  it('quotes POSIX-style for Git Bash and WSL, which are also Windows shell settings', () => {
    for (const windowsShell of ['C:\\Program Files\\Git\\bin\\bash.exe', 'wsl.exe']) {
      expect(
        buildActiveCollabMcpSetupCommand({
          binaryPath: '/home/tester/.local/bin/activecollab-mcp',
          platform: 'win32',
          windowsShell
        })
      ).toBe(`'/home/tester/.local/bin/activecollab-mcp' setup; exit`)
    }
  })

  it('has no command when the binary was not detected', () => {
    expect(buildActiveCollabMcpSetupCommand({ binaryPath: null, platform: 'darwin' })).toBeNull()
    expect(buildActiveCollabMcpSetupCommand({ binaryPath: '   ', platform: 'darwin' })).toBeNull()
  })

  it('refuses a path with a line break, which would submit a truncated command', () => {
    expect(
      buildActiveCollabMcpSetupCommand({
        binaryPath: '/tmp/evil\nrm -rf ~',
        platform: 'darwin'
      })
    ).toBeNull()
  })
})
