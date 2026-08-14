import { describe, expect, it } from 'vitest'
import { DEFAULT_ACTIVECOLLAB_INSTANCE_URL } from './activecollab-instance'

describe('DEFAULT_ACTIVECOLLAB_INSTANCE_URL', () => {
  it('points at the efront ActiveCollab instance', () => {
    expect(DEFAULT_ACTIVECOLLAB_INSTANCE_URL).toBe('https://projects.efront.com.au')
  })
})
