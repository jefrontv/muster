// Downloads the pinned Muster Bots core artifact (config/muster-bots.json) into resources/muster-bots.
// The repo is private: uses the gh CLI, authenticated by `gh auth login` locally or GH_TOKEN in CI.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..', '..')
const pin = JSON.parse(readFileSync(path.join(root, 'config', 'muster-bots.json'), 'utf8'))
const target = path.join(root, 'resources', 'muster-bots')
const manifestPath = path.join(target, 'manifest.json')

if (existsSync(manifestPath)) {
  const installed = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (installed.version === pin.version && !process.argv.includes('--force')) {
    console.log(`muster-bots ${pin.version} already in resources/muster-bots`)
    process.exit(0)
  }
}

const name = `muster-bots-${pin.version}-core`
const work = mkdtempSync(path.join(tmpdir(), 'muster-bots-'))
try {
  execFileSync(
    'gh',
    [
      'release',
      'download',
      `v${pin.version}`,
      '--repo',
      pin.repo,
      '--pattern',
      `${name}.tar.gz`,
      '--dir',
      work
    ],
    { stdio: 'inherit' }
  )
  const tarball = path.join(work, `${name}.tar.gz`)
  const sha256 = createHash('sha256').update(readFileSync(tarball)).digest('hex')
  if (sha256 !== pin.sha256) {
    throw new Error(`checksum mismatch for ${name}.tar.gz: got ${sha256}, pinned ${pin.sha256}`)
  }
  execFileSync('tar', ['-xzf', tarball, '-C', work])
  rmSync(target, { recursive: true, force: true })
  renameSync(path.join(work, name), target)
  console.log(`muster-bots ${pin.version} installed in resources/muster-bots`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
