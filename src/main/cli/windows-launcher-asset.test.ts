import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('packaged Windows CLI launcher asset', () => {
  it('keeps the batch compatibility shim behind the newline-safe native launcher', () => {
    const launcherPath = join(process.cwd(), 'resources', 'win32', 'bin', 'muster.cmd')
    const launcher = readFileSync(launcherPath, 'utf8')

    expect(launcher).toContain('set "LAUNCHER=%SCRIPT_DIR%muster.exe"')
    expect(launcher).toContain('muster.cmd cannot safely forward orchestration message bodies')
    expect(launcher).not.toContain('"%ELECTRON%" "%CLI%" %*')
  })
})
