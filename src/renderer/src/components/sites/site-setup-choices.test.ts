import { describe, expect, it } from 'vitest'
import { resolveSetupEnvironment } from './site-setup-choices'

describe('resolveSetupEnvironment', () => {
  it('takes the link over the plan, because the link is where the credentials land', () => {
    // Why: siteBind.confirm writes the link's host/user/root to the environment the link names.
    // Following the plan instead pointed the toggle write and the import run at a different
    // environment, so the run connected with the host that was already on record.
    expect(
      resolveSetupEnvironment({
        linkEnvironment: 'master',
        planEnvironment: 'main',
        isLink: true
      })
    ).toBe('master')
  })

  it('falls back to the plan when the link omits an environment', () => {
    expect(
      resolveSetupEnvironment({ linkEnvironment: '', planEnvironment: 'staging', isLink: true })
    ).toBe('staging')
  })

  it('falls back to the default name for a link with nothing to go on', () => {
    expect(
      resolveSetupEnvironment({ linkEnvironment: '', planEnvironment: '', isLink: true })
    ).toBe('main')
  })

  it('names nothing for a bare clone, which carries no server configuration', () => {
    expect(
      resolveSetupEnvironment({ linkEnvironment: '', planEnvironment: '', isLink: false })
    ).toBe('')
  })

  it('still uses an existing site’s own resolved environment', () => {
    expect(
      resolveSetupEnvironment({ linkEnvironment: '', planEnvironment: 'production', isLink: false })
    ).toBe('production')
  })
})
