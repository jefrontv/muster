import { describe, expect, it } from 'vitest'
import { probeBinary, type BinaryProbeEnv } from './binary-probe'

function env(overrides: Partial<BinaryProbeEnv> = {}): BinaryProbeEnv {
  const files = new Map<string, string>()
  return {
    homeDir: '/home/dev',
    platform: 'darwin',
    pathEntries: ['/usr/bin'],
    isExecutableFile: () => false,
    realPath: (path) => path,
    readText: (path) => files.get(path) ?? null,
    listDirectory: () => [],
    ...overrides
  }
}

describe('probeBinary', () => {
  it('reports absence without inventing a path', () => {
    expect(probeBinary('acme', env())).toEqual({
      found: false,
      path: null,
      realPath: null,
      version: null,
      versionSource: null
    })
  })

  it('finds a binary on PATH', () => {
    const result = probeBinary(
      'acme',
      env({ isExecutableFile: (path) => path === '/usr/bin/acme' })
    )
    expect(result.found).toBe(true)
    expect(result.path).toBe('/usr/bin/acme')
  })

  it('finds an npm global install under nvm, which no GUI app PATH knows about', () => {
    const result = probeBinary(
      'acme',
      env({
        pathEntries: [],
        listDirectory: (path) => (path.endsWith('.nvm/versions/node') ? ['v22.14.0', 'v24.18.0'] : []),
        isExecutableFile: (path) =>
          path === '/home/dev/.nvm/versions/node/v24.18.0/bin/acme'
      })
    )
    expect(result.path).toBe('/home/dev/.nvm/versions/node/v24.18.0/bin/acme')
  })

  it('prefers the newest node version when two of them carry the binary', () => {
    const seen: string[] = []
    probeBinary(
      'acme',
      env({
        pathEntries: [],
        listDirectory: (path) => (path.endsWith('.nvm/versions/node') ? ['v22.14.0', 'v24.18.0'] : []),
        isExecutableFile: (path) => {
          seen.push(path)
          return false
        }
      })
    )
    expect(seen.find((path) => path.includes('.nvm'))).toContain('v24.18.0')
  })

  it('treats a broken symlink as not installed, because it is', () => {
    const result = probeBinary(
      'acme',
      // isExecutableFile follows the link, so a dangling one never reports true.
      env({ pathEntries: ['/usr/bin'], isExecutableFile: () => false })
    )
    expect(result.found).toBe(false)
  })

  it('falls back to ~/.local/bin, which a GUI app PATH routinely omits', () => {
    const result = probeBinary(
      'acme',
      env({ pathEntries: [], isExecutableFile: (path) => path === '/home/dev/.local/bin/acme' })
    )
    expect(result.path).toBe('/home/dev/.local/bin/acme')
  })

  // Paths are joined with the HOST path module, so this asserts the candidate NAMES rather than
  // the separator: on Windows the same call produces a backslash path.
  it('tries Windows console-script extensions', () => {
    const seen: string[] = []
    const result = probeBinary(
      'acme',
      env({
        platform: 'win32',
        pathEntries: ['/bin'],
        isExecutableFile: (path) => {
          seen.push(path)
          return path.endsWith('acme.cmd')
        }
      })
    )
    expect(seen[0]).toContain('acme.exe')
    expect(result.path).toContain('acme.cmd')
  })

  it('reads a pipx version from metadata rather than running the binary', () => {
    const result = probeBinary(
      'acme',
      env({
        isExecutableFile: (path) => path === '/home/dev/.local/bin/acme',
        pathEntries: [],
        readText: (path) =>
          path === '/home/dev/.local/pipx/venvs/acme/pipx_metadata.json'
            ? JSON.stringify({ main_package: { package_version: '1.4.2' } })
            : null
      })
    )
    expect(result.version).toBe('1.4.2')
    expect(result.versionSource).toBe('pipx')
  })

  it('reads an npm global version from the nearest package.json', () => {
    const result = probeBinary(
      'acme',
      env({
        isExecutableFile: (path) => path === '/usr/bin/acme',
        realPath: () => '/usr/lib/node_modules/acme/dist/index.js',
        readText: (path) =>
          path === '/usr/lib/node_modules/acme/package.json'
            ? JSON.stringify({ version: '0.2.0' })
            : null
      })
    )
    expect(result.version).toBe('0.2.0')
    expect(result.versionSource).toBe('package-json')
  })

  it('treats found-but-unversioned as installed, not as missing', () => {
    const result = probeBinary('acme', env({ isExecutableFile: (path) => path === '/usr/bin/acme' }))
    expect(result.found).toBe(true)
    expect(result.version).toBeNull()
  })

  it('stops walking up before it reaches the filesystem root', () => {
    const readText = (path: string): string | null =>
      path === '/package.json' ? JSON.stringify({ version: '9.9.9' }) : null
    const result = probeBinary(
      'acme',
      env({
        isExecutableFile: (path) => path === '/usr/bin/acme',
        realPath: () => '/a/b/c/d/e/f/g/acme',
        readText
      })
    )
    expect(result.version).toBeNull()
  })
})
