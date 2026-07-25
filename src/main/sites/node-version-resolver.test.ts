import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readNodeVersionFromPackageJson, resolvePinnedNodeVersion } from './node-version-resolver'

describe('readNodeVersionFromPackageJson', () => {
  // `nvm use` wants a version, not a range, so every range shape must reduce to digits.
  it.each([
    ['>=20', '20'],
    ['^18.12.0', '18.12.0'],
    ['~16.4', '16.4'],
    ['18.x', '18'],
    ['>=18 <21', '18'],
    ['20.11.1', '20.11.1'],
    ['  >= 22.0.0  ', '22.0.0'],
    ['v14', '14']
  ])('reduces engines.node %j to %j', (requested, expected) => {
    expect(readNodeVersionFromPackageJson(JSON.stringify({ engines: { node: requested } }))).toBe(
      expected
    )
  })

  it.each([['lts/*'], ['*'], [''], ['node'], ['stable']])(
    'returns null for the non-numeric range %j',
    (requested) => {
      expect(
        readNodeVersionFromPackageJson(JSON.stringify({ engines: { node: requested } }))
      ).toBeNull()
    }
  )

  it('returns null when there is no engines block', () => {
    expect(readNodeVersionFromPackageJson(JSON.stringify({ name: 'theme' }))).toBeNull()
  })

  it('returns null when engines has no node key', () => {
    expect(readNodeVersionFromPackageJson(JSON.stringify({ engines: { npm: '>=9' } }))).toBeNull()
  })

  it('returns null when engines.node is not a string', () => {
    expect(readNodeVersionFromPackageJson(JSON.stringify({ engines: { node: 20 } }))).toBeNull()
    expect(readNodeVersionFromPackageJson(JSON.stringify({ engines: { node: null } }))).toBeNull()
  })

  it('returns null when engines is not an object', () => {
    expect(readNodeVersionFromPackageJson(JSON.stringify({ engines: '>=20' }))).toBeNull()
    expect(readNodeVersionFromPackageJson(JSON.stringify({ engines: ['>=20'] }))).toBeNull()
  })

  it('returns null for malformed JSON instead of throwing', () => {
    expect(readNodeVersionFromPackageJson('{ not json')).toBeNull()
    expect(readNodeVersionFromPackageJson('')).toBeNull()
  })

  it('returns null when the document is not an object', () => {
    expect(readNodeVersionFromPackageJson('[1,2,3]')).toBeNull()
    expect(readNodeVersionFromPackageJson('null')).toBeNull()
    expect(readNodeVersionFromPackageJson('"20"')).toBeNull()
  })
})

describe('resolvePinnedNodeVersion', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'muster-node-version-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('reads engines.node from the directory package.json', async () => {
    await writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ engines: { node: '>=20.11' } })
    )
    await expect(resolvePinnedNodeVersion(directory)).resolves.toBe('20.11')
  })

  it('returns null when package.json is absent', async () => {
    await expect(resolvePinnedNodeVersion(directory)).resolves.toBeNull()
  })

  it('returns null when package.json is unreadable garbage', async () => {
    await writeFile(path.join(directory, 'package.json'), '{{{')
    await expect(resolvePinnedNodeVersion(directory)).resolves.toBeNull()
  })

  it('returns null when the directory does not exist', async () => {
    await expect(resolvePinnedNodeVersion(path.join(directory, 'missing'))).resolves.toBeNull()
  })
})
