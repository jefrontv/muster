// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { SourceControlNoMatchingFiles } from './source-control-no-matching-files'

afterEach(() => {
  cleanup()
})

describe('SourceControlNoMatchingFiles', () => {
  it('names the query and clears the filter', () => {
    const onClearFilter = vi.fn()
    const { getByText, getByRole } = render(
      <SourceControlNoMatchingFiles query="auth" onClearFilter={onClearFilter} />
    )
    expect(getByText('No matching files')).toBeTruthy()
    expect(getByText('No changed files match "auth"')).toBeTruthy()
    fireEvent.click(getByRole('button', { name: 'Clear filter' }))
    expect(onClearFilter).toHaveBeenCalledTimes(1)
  })
})
