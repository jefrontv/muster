// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SiteImportLargeFilesPrompt } from '../../../../shared/site-import-file-rules'
import { SiteImportLargeFilesDialog } from './SiteImportLargeFilesDialog'

const GB = 1024 ** 3
const PROMPT: SiteImportLargeFilesPrompt = {
  promptId: 'p1',
  runId: 'run1',
  siteId: 's1',
  siteName: 'AIDC',
  environment: 'production',
  entries: [
    { path: 'wp-content/ai1wm-backups', kind: 'folder', bytes: 4 * GB },
    { path: 'wp-content/ai1wm-backups/site.wpress', kind: 'file', bytes: 3 * GB },
    { path: 'error_log', kind: 'file', bytes: GB / 2 }
  ]
}

function mount(): { respond: ReturnType<typeof vi.fn> } {
  const respond = vi.fn(async () => true)
  Object.assign(window, {
    api: { siteImportLargeFiles: { respond }, siteRuns: { cancel: vi.fn() } }
  })
  render(<SiteImportLargeFilesDialog prompt={PROMPT} waitingAfter={0} />)
  return { respond }
}

afterEach(cleanup)

describe('SiteImportLargeFilesDialog', () => {
  it('ticks the top-level items and carries a file with its ticked folder', () => {
    mount()
    expect(screen.getByRole('checkbox', { name: /ai1wm-backups\// })).toBeChecked()
    const nested = screen.getByRole('checkbox', { name: /site\.wpress/ })
    expect(nested).toBeChecked()
    expect(nested).toBeDisabled()
    expect(screen.getByText('4.5 GB will stay on the server.')).toBeInTheDocument()
  })

  it('sends each skipped path once and remembers by default', () => {
    const { respond } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Skip 2 selected' }))
    expect(respond).toHaveBeenCalledWith('p1', {
      skip: ['wp-content/ai1wm-backups', 'error_log'],
      remember: true
    })
  })

  it('lets one file go while the rest of its folder is copied', () => {
    const { respond } = mount()
    fireEvent.click(screen.getByRole('checkbox', { name: /ai1wm-backups\// }))
    fireEvent.click(screen.getByRole('checkbox', { name: /error_log/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /site\.wpress/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Remember/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip 1 selected' }))
    expect(respond).toHaveBeenCalledWith('p1', {
      skip: ['wp-content/ai1wm-backups/site.wpress'],
      remember: false
    })
  })

  it('copies everything without skipping anything', () => {
    const { respond } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Copy everything' }))
    expect(respond).toHaveBeenCalledWith('p1', { skip: [], remember: true })
  })
})
