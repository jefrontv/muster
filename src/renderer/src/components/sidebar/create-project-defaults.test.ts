import { describe, expect, it } from 'vitest'
import {
  formatCreateProjectParentSummary,
  getCreateProjectDefaultParentAutoFill,
  getDefaultCreateProjectParent,
  joinCreateProjectPath
} from './create-project-defaults'

describe('create project defaults', () => {
  it('builds the POSIX default project parent', () => {
    expect(getDefaultCreateProjectParent('/Users/alice')).toBe('/Users/alice/muster/projects')
  })

  it('builds the Windows default project parent', () => {
    expect(getDefaultCreateProjectParent('C:\\Users\\alice')).toBe(
      'C:\\Users\\alice\\muster\\projects'
    )
  })

  it('derives the runtime project default from a resolved server home', () => {
    expect(getDefaultCreateProjectParent('/home/alice')).toBe('/home/alice/muster/projects')
  })

  it('joins path previews without mixing separators', () => {
    expect(joinCreateProjectPath('/home/alice/muster/projects', 'demo')).toBe(
      '/home/alice/muster/projects/demo'
    )
    expect(joinCreateProjectPath('C:\\Users\\alice\\muster\\projects', 'demo')).toBe(
      'C:\\Users\\alice\\muster\\projects\\demo'
    )
  })

  it('auto-fills only the first empty local create step', () => {
    expect(
      getCreateProjectDefaultParentAutoFill({
        step: 'create',
        createParent: '',
        activeRuntimeEnvironmentId: null,
        defaultParent: '/Users/alice/Documents/Sites',
        createStepAutoFilled: false
      })
    ).toEqual({ parent: '/Users/alice/Documents/Sites' })
    expect(
      getCreateProjectDefaultParentAutoFill({
        step: 'create',
        createParent: '/tmp/project',
        activeRuntimeEnvironmentId: null,
        defaultParent: '/Users/alice/Documents/Sites',
        createStepAutoFilled: false
      })
    ).toBeNull()
    expect(
      getCreateProjectDefaultParentAutoFill({
        step: 'create',
        createParent: '',
        activeRuntimeEnvironmentId: null,
        defaultParent: '/Users/alice/Documents/Sites',
        createStepAutoFilled: true
      })
    ).toBeNull()
  })

  it('does not apply a local default while a runtime environment is active', () => {
    expect(
      getCreateProjectDefaultParentAutoFill({
        step: 'create',
        createParent: '',
        activeRuntimeEnvironmentId: 'env-1',
        defaultParent: '/Users/alice/Documents/Sites',
        createStepAutoFilled: false
      })
    ).toBeNull()
  })

  // Why: the summary used to print a hardcoded '~/orca/projects' whenever the parent matched the
  // default. The default is now whichever site root the host reported, so a fixed string would name
  // a folder the project would not land in.
  it('shows the resolved parent path so the summary names the real destination', () => {
    expect(formatCreateProjectParentSummary({ parent: '/Users/alice/Documents/Sites' })).toBe(
      '/Users/alice/Documents/Sites'
    )
    expect(formatCreateProjectParentSummary({ parent: '/Users/alice/muster/projects' })).toBe(
      '/Users/alice/muster/projects'
    )
    expect(
      formatCreateProjectParentSummary({
        parent: '/Users/alice/Documents/Sites',
        isRemoteHost: true
      })
    ).toBe('/Users/alice/Documents/Sites')
  })

  it('reports the missing-location label per host kind when nothing is resolved yet', () => {
    expect(formatCreateProjectParentSummary({ parent: '  ' })).toBe('location not selected')
    expect(formatCreateProjectParentSummary({ parent: '', runtimeEnvironmentId: 'env-1' })).toBe(
      'host folder not selected'
    )
    expect(formatCreateProjectParentSummary({ parent: '', isRemoteHost: true })).toBe(
      'host folder not selected'
    )
  })
})
