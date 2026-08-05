import { describe, expect, it } from 'vitest'

import { guiLaunchArgsFromMcpArgv, isSiteMcpInvocation } from './site-mcp-entry'

describe('guiLaunchArgsFromMcpArgv', () => {
  // Why: the activate trampoline relaunches the GUI with these args; leaking --site-mcp would
  // spawn another headless server instead of a window, reproducing the very bug it fixes.
  it('drops the flag for a packaged invocation', () => {
    expect(
      guiLaunchArgsFromMcpArgv(['/Applications/Muster.app/Contents/MacOS/Muster', '--site-mcp'])
    ).toEqual([])
  })

  it('keeps the dev app path but not the flag', () => {
    expect(guiLaunchArgsFromMcpArgv(['/n/electron', '/repo', '--site-mcp'])).toEqual(['/repo'])
  })

  it('never includes anything after the flag', () => {
    expect(guiLaunchArgsFromMcpArgv(['/bin', '/repo', '--site-mcp', '--extra'])).toEqual(['/repo'])
  })
})

describe('isSiteMcpInvocation', () => {
  it('detects the flag anywhere in argv', () => {
    expect(isSiteMcpInvocation(['/bin', '/repo', '--site-mcp'])).toBe(true)
    expect(isSiteMcpInvocation(['/bin'])).toBe(false)
  })
})
