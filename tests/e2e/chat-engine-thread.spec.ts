// Chat mode end to end on the fake Claude CLI: the engine-drawn transcript,
// the seated composer, approvals, failures and long history.

import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { openChatThread, openSeededChatThread } from './helpers/chat-seeded-thread'

function siteFolder(): string {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'muster-chat-e2e-'))
  writeFileSync(path.join(folder, 'style.css'), '.site-header {\n  height: 100vh;\n}\n')
  return folder
}

test.describe('Chat thread on the engine', () => {
  test.skip(process.platform === 'win32', 'Chat mode is hidden on Windows')

  test('sends, streams, asks to approve an edit, then answers', async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await openChatThread(orcaPage, {
      folder: siteFolder(),
      title: 'Header height',
      workspaceName: 'E2E site'
    })
    await expect(orcaPage.getByRole('heading', { name: 'E2E site', level: 2 })).toBeVisible()

    const composer = orcaPage.getByRole('textbox').last()
    await composer.fill('Switch the header to dvh')
    await composer.press('Enter')

    await expect(orcaPage.getByText('Switch the header to dvh')).toBeVisible()
    const approve = orcaPage.getByRole('button', { name: 'Approve' })
    await expect(approve).toBeVisible({ timeout: 30_000 })
    await approve.click()

    await expect(orcaPage.getByText('Done. The header now uses 100dvh.')).toBeVisible()
    await expect(orcaPage.getByRole('button', { name: /^Worked for / })).toBeVisible()
  })

  test('a failed turn shows the error and offers a retry', async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await openChatThread(orcaPage, {
      folder: siteFolder(),
      title: 'Failing turn',
      workspaceName: 'E2E failures'
    })
    const composer = orcaPage.getByRole('textbox').last()
    await composer.fill('Please fail this turn')
    await composer.press('Enter')

    await expect(orcaPage.getByRole('alert')).toBeVisible({ timeout: 30_000 })
    await expect(orcaPage.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  test('long history pages in as the reader scrolls up', async ({ orcaPage, electronApp }) => {
    await waitForSessionReady(orcaPage)
    await openSeededChatThread(orcaPage, electronApp, {
      folder: siteFolder(),
      turns: 45,
      sessionId: 'e2e-seeded-history',
      title: 'Long history',
      workspaceName: 'E2E history'
    })
    await expect(orcaPage.getByText('Turn 45: tighten the spacing in section 45.')).toBeVisible({
      timeout: 30_000
    })
    // Paging renders the newest 30; the first turn is not in the DOM yet.
    const firstTurn = orcaPage
      .locator('section[data-turn-id]')
      .getByText('Turn 1: tighten the spacing in section 1.')
    await expect(firstTurn).toHaveCount(0)

    const scroller = orcaPage.locator('[data-chat-conversation-scroller]')
    await expect
      .poll(async () => {
        await scroller.evaluate((element) => {
          element.scrollTop = 0
        })
        return firstTurn.count()
      })
      .toBe(1)
  })
})
