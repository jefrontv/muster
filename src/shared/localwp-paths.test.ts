import { describe, expect, it } from 'vitest'
import path from 'node:path'
import {
  localWpConfigPath,
  localWpWordPressRoot,
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
