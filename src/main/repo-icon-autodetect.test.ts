import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gitExecFileAsync } from './git/runner'
import { fetchFaviconAsDataUrl } from './favicon-fetch'
import { getRepoHomepage } from './github/repo-homepage'
import { detectRepoIcon, detectRepoIconAndUpstream } from './repo-icon-autodetect'

// Icon detection reaches the network twice: the repo's GitHub homepage, and the
// favicon behind whatever website it names. Both are stubbed so these stay offline.
vi.mock('./favicon-fetch', () => ({ fetchFaviconAsDataUrl: vi.fn() }))
vi.mock('./github/repo-homepage', () => ({ getRepoHomepage: vi.fn() }))

const mockFetchFavicon = vi.mocked(fetchFaviconAsDataUrl)
const mockRepoHomepage = vi.mocked(getRepoHomepage)

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

const FAVICON_DATA_URL = `data:image/png;base64,${PNG_1X1_BASE64}`

const tempDirs: string[] = []

async function makeTempRepoDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orca-repo-icon-'))
  tempDirs.push(dir)
  return dir
}

beforeEach(() => {
  mockFetchFavicon.mockResolvedValue({ ok: true, dataUrl: FAVICON_DATA_URL })
  mockRepoHomepage.mockResolvedValue(null)
})

afterEach(async () => {
  vi.clearAllMocks()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('detectRepoIcon', () => {
  it('uses a small repo-local favicon PNG first', async () => {
    const repoPath = await makeTempRepoDir()
    await writeFile(join(repoPath, 'favicon.png'), Buffer.from(PNG_1X1_BASE64, 'base64'))
    await writeFile(
      join(repoPath, 'package.json'),
      JSON.stringify({ homepage: 'https://example.com' })
    )

    await expect(detectRepoIcon({ repoPath, kind: 'folder' })).resolves.toEqual({
      type: 'image',
      src: `data:image/png;base64,${PNG_1X1_BASE64}`,
      source: 'file',
      label: 'favicon.png'
    })
  })

  it('uses a package homepage favicon when no local icon file exists', async () => {
    const repoPath = await makeTempRepoDir()
    await writeFile(
      join(repoPath, 'package.json'),
      JSON.stringify({ homepage: 'https://app.example.com/docs' })
    )

    await expect(detectRepoIcon({ repoPath, kind: 'folder' })).resolves.toEqual({
      type: 'image',
      src: FAVICON_DATA_URL,
      source: 'favicon',
      label: 'Website favicon'
    })
    expect(mockFetchFavicon).toHaveBeenCalledWith('https://app.example.com/docs')
  })

  it('resolves declared icon hrefs from project source files', async () => {
    const repoPath = await makeTempRepoDir()
    await writeFile(join(repoPath, 'index.html'), '<link rel="icon" href="/brand/icon.png">')
    await mkdir(join(repoPath, 'public', 'brand'), { recursive: true })
    await writeFile(
      join(repoPath, 'public', 'brand', 'icon.png'),
      Buffer.from(PNG_1X1_BASE64, 'base64')
    )

    await expect(detectRepoIcon({ repoPath, kind: 'folder' })).resolves.toEqual({
      type: 'image',
      src: `data:image/png;base64,${PNG_1X1_BASE64}`,
      source: 'file',
      label: 'public/brand/icon.png'
    })
  })

  it('resolves relative declared icon hrefs from nested source files', async () => {
    const repoPath = await makeTempRepoDir()
    await mkdir(join(repoPath, 'src', 'routes', 'brand'), { recursive: true })
    await writeFile(
      join(repoPath, 'src', 'routes', '__root.tsx'),
      'export const links = () => [{ rel: "icon", href: "./brand/icon.png" }]'
    )
    await writeFile(
      join(repoPath, 'src', 'routes', 'brand', 'icon.png'),
      Buffer.from(PNG_1X1_BASE64, 'base64')
    )

    await expect(detectRepoIcon({ repoPath, kind: 'folder' })).resolves.toEqual({
      type: 'image',
      src: `data:image/png;base64,${PNG_1X1_BASE64}`,
      source: 'file',
      label: 'src/routes/brand/icon.png'
    })
  })

  it('skips oversized source files when looking for declared icon hrefs', async () => {
    const repoPath = await makeTempRepoDir()
    await writeFile(
      join(repoPath, 'index.html'),
      `${'x'.repeat(256 * 1024 + 1)}<link rel="icon" href="/brand/icon.png">`
    )
    await mkdir(join(repoPath, 'public', 'brand'), { recursive: true })
    await writeFile(
      join(repoPath, 'public', 'brand', 'icon.png'),
      Buffer.from(PNG_1X1_BASE64, 'base64')
    )

    await expect(detectRepoIcon({ repoPath, kind: 'folder' })).resolves.toBeUndefined()
  })

  it('does not resolve declared icon hrefs outside the repo', async () => {
    const parentPath = await makeTempRepoDir()
    const repoPath = join(parentPath, 'repo')
    await mkdir(repoPath)
    await writeFile(join(parentPath, 'outside.png'), Buffer.from(PNG_1X1_BASE64, 'base64'))
    await writeFile(join(repoPath, 'index.html'), '<link rel="icon" href="../outside.png">')

    await expect(detectRepoIcon({ repoPath, kind: 'folder' })).resolves.toBeUndefined()
  })

  it('fetches the favicon of the website the GitHub repo links to', async () => {
    const repoPath = await makeTempRepoDir()
    await gitExecFileAsync(['init'], { cwd: repoPath })
    await gitExecFileAsync(['remote', 'add', 'origin', 'git@github.com:stablyai/orca.git'], {
      cwd: repoPath
    })
    mockRepoHomepage.mockResolvedValue('https://orca.computer')

    await expect(detectRepoIcon({ repoPath, kind: 'git' })).resolves.toEqual({
      type: 'image',
      src: FAVICON_DATA_URL,
      source: 'favicon',
      label: 'Website favicon'
    })
    expect(mockFetchFavicon).toHaveBeenCalledWith('https://orca.computer')
  })

  it('leaves the icon unset when a GitHub repo names no website', async () => {
    const repoPath = await makeTempRepoDir()
    await gitExecFileAsync(['init'], { cwd: repoPath })
    await gitExecFileAsync(['remote', 'add', 'origin', 'git@github.com:stablyai/orca.git'], {
      cwd: repoPath
    })

    await expect(detectRepoIcon({ repoPath, kind: 'git' })).resolves.toBeUndefined()
    expect(mockFetchFavicon).not.toHaveBeenCalled()
  })

  it('leaves the icon unset when the site has no fetchable favicon', async () => {
    const repoPath = await makeTempRepoDir()
    await writeFile(
      join(repoPath, 'package.json'),
      JSON.stringify({ homepage: 'https://app.example.com/docs' })
    )
    mockFetchFavicon.mockResolvedValue({ ok: false, error: 'No favicon found.' })

    await expect(detectRepoIcon({ repoPath, kind: 'folder' })).resolves.toBeUndefined()
  })

  it('skips code-host package homepages so GitHub remotes stay repo-specific', async () => {
    const repoPath = await makeTempRepoDir()
    await writeFile(
      join(repoPath, 'package.json'),
      JSON.stringify({ homepage: 'https://github.com/stablyai/orca' })
    )
    await gitExecFileAsync(['init'], { cwd: repoPath })
    await gitExecFileAsync(['remote', 'add', 'origin', 'https://github.com/stablyai/orca.git'], {
      cwd: repoPath
    })

    await expect(detectRepoIcon({ repoPath, kind: 'git' })).resolves.toBeUndefined()
    expect(mockFetchFavicon).not.toHaveBeenCalled()
  })

  it('stores a null upstream marker for git repos without a resolved fork parent', async () => {
    const repoPath = await makeTempRepoDir()
    await gitExecFileAsync(['init'], { cwd: repoPath })

    await expect(detectRepoIconAndUpstream({ repoPath, kind: 'git' })).resolves.toEqual({
      upstream: null
    })
  })

  it('uses the resolved fork upstream for the stored git metadata', async () => {
    const repoPath = await makeTempRepoDir()
    await gitExecFileAsync(['init'], { cwd: repoPath })
    await gitExecFileAsync(['remote', 'add', 'origin', 'git@github.com:tmchow/orca.git'], {
      cwd: repoPath
    })
    await gitExecFileAsync(['remote', 'add', 'upstream', 'git@github.com:stablyai/orca.git'], {
      cwd: repoPath
    })

    await expect(detectRepoIconAndUpstream({ repoPath, kind: 'git' })).resolves.toEqual({
      gitRemoteIdentity: {
        canonicalKey: 'github.com/stablyai/orca',
        remoteName: 'upstream',
        remoteUrl: 'git@github.com:stablyai/orca.git'
      },
      // Why: fork parents resolve host-qualified so links stay on the fork's server.
      upstream: { owner: 'stablyai', repo: 'orca', host: 'github.com' }
    })
  })

  it('detects a provider-neutral git remote identity for non-GitHub remotes', async () => {
    const repoPath = await makeTempRepoDir()
    await gitExecFileAsync(['init'], { cwd: repoPath })
    await gitExecFileAsync(
      ['remote', 'add', 'origin', 'git@git.company.test:platform/tools/sample-app.git'],
      { cwd: repoPath }
    )

    await expect(detectRepoIconAndUpstream({ repoPath, kind: 'git' })).resolves.toMatchObject({
      gitRemoteIdentity: {
        canonicalKey: 'git.company.test/platform/tools/sample-app',
        remoteName: 'origin',
        remoteUrl: 'git@git.company.test:platform/tools/sample-app.git'
      },
      upstream: null
    })
  })
})
