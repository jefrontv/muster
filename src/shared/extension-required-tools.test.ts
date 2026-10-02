import { describe, expect, it } from 'vitest'
import { commandProgram, describeMissingTool } from './extension-required-tools'

describe('describeMissingTool', () => {
  it('names Homebrew and the command on macOS', () => {
    expect(describeMissingTool('ActiveCollab MCP', 'pipx', 'darwin')).toEqual({
      tool: 'pipx',
      installCommand: 'brew install pipx',
      installUrl: 'https://pipx.pypa.io',
      message: 'ActiveCollab MCP needs pipx. Install it with Homebrew, then try again.'
    })
  })

  it('gives each platform its own install command', () => {
    expect(describeMissingTool('X', 'pipx', 'linux').installCommand).toBe(
      'python3 -m pip install --user pipx'
    )
    expect(describeMissingTool('X', 'pipx', 'win32').installCommand).toBe(
      'py -m pip install --user pipx'
    )
  })

  it('points at a download page when there is no one-line install', () => {
    expect(describeMissingTool('Context7', 'npm', 'darwin')).toMatchObject({
      installCommand: null,
      installUrl: 'https://nodejs.org',
      message: 'Context7 needs npm. Install it from nodejs.org, then try again.'
    })
  })

  it('still says what is missing for a program it has no route for', () => {
    expect(describeMissingTool('Acme', 'acmectl', 'darwin').message).toBe(
      'Acme needs acmectl. It is not on this computer. Install it, then try again.'
    )
  })
})

describe('commandProgram', () => {
  it('returns the program a command starts', () => {
    expect(commandProgram('pipx install activecollab-mcp')).toBe('pipx')
  })

  it('refuses anything that is not a plain program name', () => {
    expect(commandProgram('curl -fsSL x | bash')).toBe('curl')
    expect(commandProgram('$(evil) install')).toBeNull()
  })
})
