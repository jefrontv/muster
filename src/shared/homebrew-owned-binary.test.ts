import { describe, expect, it } from 'vitest'
import { homebrewFormulaFromPath, homebrewUpgradeCommand } from './homebrew-owned-binary'

describe('homebrewFormulaFromPath', () => {
  it('reads the formula from an Apple silicon Cellar path', () => {
    expect(
      homebrewFormulaFromPath('/opt/homebrew/Cellar/agent-local/0.32.1/bin/agent-local')
    ).toBe('agent-local')
  })

  it('reads the formula from an Intel Cellar path', () => {
    expect(homebrewFormulaFromPath('/usr/local/Cellar/agent-local/0.32.1/bin/agent-local')).toBe(
      'agent-local'
    )
  })

  it('reads a cask', () => {
    expect(homebrewFormulaFromPath('/opt/homebrew/Caskroom/some-app/1.0/bin/some-app')).toBe(
      'some-app'
    )
  })

  it('reads a formula whose name differs from the binary', () => {
    expect(homebrewFormulaFromPath('/opt/homebrew/Cellar/node@20/20.11.0/bin/node')).toBe('node@20')
  })

  it('rejects a curl install in the same bin directory', () => {
    // The whole reason the resolved path is the signal: this sits beside a Homebrew shim and
    // Homebrew does not own it, so `brew upgrade` would fail on it.
    expect(homebrewFormulaFromPath('/usr/local/bin/agent-local')).toBeNull()
  })

  it('rejects a user-local install', () => {
    expect(homebrewFormulaFromPath('/Users/someone/.local/bin/agent-local')).toBeNull()
  })

  it('answers null for no path', () => {
    expect(homebrewFormulaFromPath(null)).toBeNull()
  })

  it('answers null when Cellar is the last segment with nothing after it', () => {
    expect(homebrewFormulaFromPath('/opt/homebrew/Cellar/')).toBeNull()
  })
})

describe('homebrewUpgradeCommand', () => {
  it('is the command Agent Local itself tells the user to run', () => {
    expect(homebrewUpgradeCommand('agent-local')).toBe('brew upgrade agent-local')
  })
})
