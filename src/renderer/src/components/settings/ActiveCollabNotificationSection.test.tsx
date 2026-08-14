// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi, type MockedFunction } from 'vitest'
import type { GlobalSettings } from '../../../../shared/types'
import { ActiveCollabNotificationSection } from './ActiveCollabNotificationSection'
import { getNotificationsPaneSearchEntries } from './notifications-search'

type NotificationSettings = GlobalSettings['notifications']

const TOGGLES = [
  { key: 'activeCollabAssigned', label: 'Task Assigned To You' },
  { key: 'activeCollabComments', label: 'New Comments' },
  { key: 'activeCollabDue', label: 'Due Date Getting Closer' },
  { key: 'activeCollabUpdated', label: 'Task Details Edited' }
] as const satisfies readonly { key: keyof NotificationSettings; label: string }[]

function createNotificationSettings(
  overrides: Partial<NotificationSettings> = {}
): NotificationSettings {
  return {
    enabled: true,
    agentTaskComplete: true,
    terminalBell: true,
    siteRunComplete: true,
    activeCollabAssigned: false,
    activeCollabComments: false,
    activeCollabDue: false,
    activeCollabUpdated: false,
    suppressWhenFocused: true,
    activeCollabSoundId: 'global',
    activeCollabSoundPath: null,
    activeCollabStyle: 'detailed',
    customSoundId: 'system',
    customSoundPath: null,
    customSoundVolume: 50,
    ...overrides
  }
}

type UpdateNotificationSettingsSpy = MockedFunction<
  (updates: Partial<NotificationSettings>) => Promise<void>
>

type RenderedSection = { onUpdate: UpdateNotificationSettingsSpy }

function renderSection(overrides: Partial<NotificationSettings> = {}): RenderedSection {
  const notificationSettings = createNotificationSettings(overrides)
  const onUpdate = vi.fn(async () => {})
  render(
    <ActiveCollabNotificationSection
      notificationSettings={notificationSettings}
      notificationsEnabled={notificationSettings.enabled}
      onUpdateNotificationSettings={onUpdate}
      pollIntervalMs={null}
      onPollIntervalChange={() => undefined}
    />
  )
  return { onUpdate }
}

describe('ActiveCollabNotificationSection', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders every ActiveCollab toggle under one group', () => {
    renderSection()

    expect(screen.getByText('ActiveCollab Tasks')).toBeInTheDocument()
    for (const toggle of TOGGLES) {
      expect(screen.getByRole('switch', { name: toggle.label })).toBeInTheDocument()
    }
  })

  it('names the polling cost, because these alerts hit a third-party server on a timer', () => {
    renderSection()

    expect(
      screen.getByText(
        'ActiveCollab has no webhooks, so Muster checks your ActiveCollab server every minute in the background while any of these are on.'
      )
    ).toBeInTheDocument()
  })

  it('describes what each toggle actually notifies about', () => {
    renderSection()

    expect(
      screen.getByText(
        'A task you were not assigned before shows up on your ActiveCollab task list.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText('Someone posts a comment on a task assigned to you.')
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'An assigned task moves into a nearer due window — this week, then tomorrow, then today, then overdue.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'An assigned task is edited without a new comment — renamed, re-described, re-labelled, or its due date changed.'
      )
    ).toBeInTheDocument()
  })

  it('reflects persisted state per toggle', () => {
    renderSection({ activeCollabComments: true, activeCollabDue: true })

    expect(screen.getByRole('switch', { name: 'Task Assigned To You' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
    expect(screen.getByRole('switch', { name: 'New Comments' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByRole('switch', { name: 'Due Date Getting Closer' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByRole('switch', { name: 'Task Details Edited' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
  })

  for (const toggle of TOGGLES) {
    it(`writes only ${toggle.key} when its switch is clicked`, async () => {
      const user = userEvent.setup()
      const { onUpdate } = renderSection()

      await user.click(screen.getByRole('switch', { name: toggle.label }))

      // A single-key patch is the assertion: the other three must not ride along,
      // or a stale render would silently revert a sibling toggle.
      expect(onUpdate).toHaveBeenCalledTimes(1)
      expect(onUpdate).toHaveBeenCalledWith({ [toggle.key]: true })
    })
  }

  it('flips a persisted-on toggle back off without touching its siblings', async () => {
    const user = userEvent.setup()
    const { onUpdate } = renderSection({ activeCollabDue: true })

    await user.click(screen.getByRole('switch', { name: 'Due Date Getting Closer' }))

    expect(onUpdate).toHaveBeenCalledWith({ activeCollabDue: false })
  })

  it('follows the master enable switch rather than a second disabled rule', async () => {
    const user = userEvent.setup()
    const { onUpdate } = renderSection({ enabled: false, activeCollabAssigned: true })

    for (const toggle of TOGGLES) {
      expect(screen.getByRole('switch', { name: toggle.label })).toBeDisabled()
    }

    await user.click(screen.getByRole('switch', { name: 'Task Assigned To You' }))
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('leaves every toggle interactive while notifications are enabled', () => {
    renderSection()

    for (const toggle of TOGGLES) {
      expect(screen.getByRole('switch', { name: toggle.label })).toBeEnabled()
    }
  })
})

describe('ActiveCollab notification settings search', () => {
  it('reaches every toggle from settings search', () => {
    const titles = getNotificationsPaneSearchEntries().map((entry) => entry.title)

    expect(titles).toEqual(expect.arrayContaining(TOGGLES.map((toggle) => toggle.label)))
  })

  it('matches the product name and per-toggle terms', () => {
    const entries = getNotificationsPaneSearchEntries().filter((entry) =>
      TOGGLES.some((toggle) => toggle.label === entry.title)
    )

    expect(entries).toHaveLength(TOGGLES.length)
    for (const entry of entries) {
      expect(entry.keywords).toEqual(expect.arrayContaining(['activecollab', 'notifications']))
      expect(entry.description).toContain('ActiveCollab')
    }

    const keywordsFor = (title: string): string[] =>
      entries.find((entry) => entry.title === title)?.keywords ?? []
    expect(keywordsFor('Task Assigned To You')).toContain('assigned')
    expect(keywordsFor('New Comments')).toContain('comments')
    expect(keywordsFor('Due Date Getting Closer')).toContain('overdue')
    expect(keywordsFor('Task Details Edited')).toContain('edited')
  })
})
