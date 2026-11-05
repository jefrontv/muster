// Chat mode end to end on the fake Claude CLI: the engine-drawn transcript,
// the seated composer, approvals, failures and long history.

import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { openChatThread, openSeededChatThread } from './helpers/chat-seeded-thread'

function siteFolder(): string {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'muster-chat-e2e-'))
  writeFileSync(path.join(folder, 'style.css'), '.site-header {\n  height: 100vh;\n}\n')
  return folder
}

async function send(page: Page, text: string): Promise<void> {
  const composer = page.getByRole('textbox').last()
  await composer.fill(text)
  await composer.press('Enter')
}

const FIRST_REPLY = 'I will switch the header to 100dvh.'

test.describe('Chat thread on the engine', () => {
  test.skip(process.platform === 'win32', 'Chat mode is hidden on Windows')

  test.beforeEach(async ({ orcaPage }) => {
    // The host's extension inventory can raise an update card over the composer.
    const card = orcaPage.getByTestId('extension-updates-card')
    await orcaPage.addLocatorHandler(card, () =>
      card.getByRole('button', { name: 'Later' }).click()
    )
  })

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
    const approve = orcaPage.getByRole('button', { name: 'Allow', exact: true })
    await expect(approve).toBeVisible({ timeout: 30_000 })
    await approve.click()

    await expect(orcaPage.getByText('Done. The header now uses 100dvh.')).toBeVisible()
    await expect(orcaPage.getByRole('button', { name: /^Worked/ })).toBeVisible()
  })

  test('streams the reply into its card a word at a time', async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await openChatThread(orcaPage, {
      folder: siteFolder(),
      title: 'Streaming',
      workspaceName: 'E2E streaming'
    })
    await expect(orcaPage.getByRole('heading', { name: 'E2E streaming', level: 2 })).toBeVisible()
    // Every text the first reply card shows, so a partial frame can be asserted after the fact.
    await orcaPage.evaluate(() => {
      const seen: string[] = []
      ;(window as unknown as { __replyFrames: string[] }).__replyFrames = seen
      new MutationObserver(() => {
        const text = document.querySelector('[data-chat-reply]')?.textContent?.trim() ?? ''
        if (text && seen.at(-1) !== text) {
          seen.push(text)
        }
      }).observe(document.body, { subtree: true, childList: true, characterData: true })
    })

    await send(orcaPage, 'Stream this slowly please')

    const reply = orcaPage.locator('[data-chat-reply]').first()
    await expect(reply).toHaveText(FIRST_REPLY, { timeout: 30_000 })
    const frames = await orcaPage.evaluate(
      () => (window as unknown as { __replyFrames: string[] }).__replyFrames
    )
    expect(
      frames.some((frame) => frame.length < FIRST_REPLY.length && FIRST_REPLY.startsWith(frame))
    ).toBe(true)
  })

  test('folds finished steps into pills and offers the reply tray', async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await openChatThread(orcaPage, {
      folder: siteFolder(),
      title: 'Full check',
      workspaceName: 'E2E steps'
    })
    await send(orcaPage, 'Run the full check')

    await orcaPage.getByRole('button', { name: 'Allow', exact: true }).click({ timeout: 30_000 })
    const turn = orcaPage.locator('section[data-turn-id]').last()
    await expect(turn.getByText('Done. The header now uses 100dvh.')).toBeVisible()

    // Done turns start folded: the run of read-only calls sits behind the turn pill.
    const run = turn.getByRole('button', { name: '3 steps: Read, Bash, WebSearch' })
    await expect(run).toHaveCount(0)
    await turn.getByRole('button', { name: /^Worked/ }).click()
    await expect(run).toBeVisible()
    await expect(turn.locator('[data-chat-tool-card]')).toHaveCount(1)
    await run.click()
    await expect(turn.locator('[data-chat-tool-card]')).toHaveCount(4)

    const replyRow = turn.locator('div:has(> [data-chat-reply])').last()
    await expect(replyRow.getByRole('button', { name: 'Copy message' })).toBeVisible()
    await expect(replyRow.getByRole('button', { name: 'Reply', exact: true })).toBeVisible()
    await expect(replyRow.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  test('the approval card takes the composer until it is answered', async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await openChatThread(orcaPage, {
      folder: siteFolder(),
      title: 'Declined edit',
      workspaceName: 'E2E approval'
    })
    await send(orcaPage, 'Switch the header to dvh')

    const reject = orcaPage.getByRole('button', { name: 'Reject', exact: true })
    await expect(reject).toBeVisible({ timeout: 30_000 })
    await expect(orcaPage.getByPlaceholder('Reply…')).toHaveCount(0)
    await reject.click()

    const turn = orcaPage.locator('section[data-turn-id]').last()
    await expect(turn.getByText('Understood, I left style.css unchanged.')).toBeVisible()
    await expect(orcaPage.getByPlaceholder('Reply…')).toBeVisible()
    await expect(turn.getByRole('button', { name: 'Undo changes' })).toHaveCount(0)
  })

  test('stop ends a running turn', async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await openChatThread(orcaPage, {
      folder: siteFolder(),
      title: 'Stopped turn',
      workspaceName: 'E2E stop'
    })
    await send(orcaPage, 'Read the stylesheet and hang')

    const turn = orcaPage.locator('section[data-turn-id]').last()
    await expect(turn.locator('[data-turn-status]')).toContainText('Working', { timeout: 30_000 })
    await expect(turn.locator('[data-turn-now]')).toHaveText('Reading style.css')

    await orcaPage.getByRole('button', { name: 'Stop the agent' }).click()
    // first(): the outcome announcement repeats "Stopped" in an sr-only status.
    await expect(turn.getByText('Stopped', { exact: true }).first()).toBeVisible()
    await expect(turn.locator('[data-turn-status]')).toHaveCount(0)
    await expect(orcaPage.getByRole('button', { name: 'Send' })).toBeVisible()
  })

  test('a reload mid-turn still shows the turn working', async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await openChatThread(orcaPage, {
      folder: siteFolder(),
      title: 'Reloaded turn',
      workspaceName: 'E2E reload'
    })
    await send(orcaPage, 'Read the stylesheet and hang')
    const status = orcaPage.locator('section[data-turn-id] [data-turn-status]')
    await expect(status).toBeVisible({ timeout: 30_000 })
    const threadId = await orcaPage.evaluate(() => window.__store?.getState().activeChatThreadId)

    await orcaPage.reload()
    await orcaPage.waitForFunction(() => Boolean(window.__store), null, { timeout: 30_000 })
    await waitForSessionReady(orcaPage)
    await orcaPage.evaluate(async (id) => {
      const store = window.__store!
      await store.getState().hydrateChatMode()
      store.getState().setActiveChatThread(id ?? null)
      store.getState().setActiveView('chat')
    }, threadId)

    await expect(orcaPage.getByText('Read the stylesheet and hang')).toBeVisible()
    await expect(status).toBeVisible({ timeout: 30_000 })
    await expect(orcaPage.locator('[data-turn-now]')).toHaveText('Reading style.css')

    // Focusing the composer adopts the still-running CLI, so stop reaches the same turn.
    await orcaPage.getByRole('textbox').last().focus()
    await orcaPage.getByRole('button', { name: 'Stop the agent' }).click()
    await expect(orcaPage.getByText('Stopped', { exact: true }).first()).toBeVisible()
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
