import { describe, expect, it } from 'vitest'
import path from 'node:path'
import {
  isLocalWpSiteShell,
  isLocalWpWordPressRootPath,
  localWpConfigPath,
  localWpWordPressRoot,
  looksLikeWordPressRoot,
  resolveLocalWpImportProjectPath
} from './localwp-paths'

const SITE = path.join('/Users/me/Local Sites', 'acme')

describe('localwp-paths', () => {
  it('builds the WordPress root and config paths under the site folder', () => {
    expect(localWpWordPressRoot(SITE)).toBe(path.join(SITE, 'app', 'public'))
    expect(localWpConfigPath(SITE)).toBe(path.join(SITE, 'app', 'public', 'wp-config.php'))
  })

  it('leaves ordinary project paths alone', () => {
    const exists = () => false
    expect(resolveLocalWpImportProjectPath('/repos/acme', exists)).toEqual({
      projectPath: '/repos/acme',
      displayNameSourcePath: '/repos/acme',
      remappedToWordPressRoot: false
    })
  })

  it('remaps a LocalWP site folder to app/public while naming from the site folder', () => {
    const config = localWpConfigPath(SITE)
    const exists = (target: string) => target === config
    expect(resolveLocalWpImportProjectPath(SITE, exists)).toEqual({
      projectPath: path.join(SITE, 'app', 'public'),
      displayNameSourcePath: SITE,
      remappedToWordPressRoot: true
    })
  })

  it('does not double-nest when the user already picked app/public', () => {
    const appPublic = localWpWordPressRoot(SITE)
    const exists = () => false
    expect(resolveLocalWpImportProjectPath(appPublic, exists)).toEqual({
      projectPath: appPublic,
      displayNameSourcePath: appPublic,
      remappedToWordPressRoot: false
    })
  })
})

describe('LocalWP site detection without app/public/wp-config.php', () => {
  const at = (...segments: string[]) => path.join(SITE, ...segments)
  const onDisk =
    (...targets: string[]) =>
    (target: string) =>
      targets.includes(target)

  it.each([
    ['wp-config gitignored, repo in app/public', [at('app', 'public'), at('conf'), at('logs')]],
    ['wp-config one level up', [at('app', 'public'), at('app', 'wp-config.php')]],
    ['Bedrock in app/public', [at('app', 'public'), at('app', 'public', 'web', 'wp-config.php')]],
    ['WordPress core, no config yet', [at('app', 'public'), at('app', 'public', 'wp-includes')]]
  ])('treats %s as a LocalWP site and remaps to app/public', (_name, targets) => {
    const exists = onDisk(...targets)
    expect(isLocalWpSiteShell(SITE, exists)).toBe(true)
    expect(isLocalWpWordPressRootPath(localWpWordPressRoot(SITE), exists)).toBe(true)
    expect(resolveLocalWpImportProjectPath(SITE, exists)).toEqual({
      projectPath: localWpWordPressRoot(SITE),
      displayNameSourcePath: SITE,
      remappedToWordPressRoot: true
    })
  })

  it('does not treat a bare app/public as a LocalWP site', () => {
    const exists = onDisk(at('app', 'public'), at('composer.json'))
    expect(isLocalWpSiteShell(SITE, exists)).toBe(false)
    expect(resolveLocalWpImportProjectPath(SITE, exists).remappedToWordPressRoot).toBe(false)
  })

  it('recognises WordPress roots by any core marker', () => {
    expect(looksLikeWordPressRoot('/w/x', onDisk(path.join('/w/x', 'wp-load.php')))).toBe(true)
    expect(looksLikeWordPressRoot('/w/x', onDisk(path.join('/w/x', 'wp-content')))).toBe(true)
    expect(looksLikeWordPressRoot('/w/x', onDisk(path.join('/w/x', 'package.json')))).toBe(false)
  })
})
