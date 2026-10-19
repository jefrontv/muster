// Opens a chat thread on a synthetic Claude transcript, so visual and perf specs get
// deterministic history with no model. The transcript goes under the e2e's isolated HOME, where
// the engine's transcript lookup finds it by session id.

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import type { GlobalSettings } from '../../../src/shared/types'

const FAKE_CLAUDE = path.resolve(__dirname, '../fixtures/fake-claude-stream.cjs')

/** Claude transcript JSONL: per turn a prompt, an Edit with its patch, a markdown answer. */
export function chatTranscriptJsonl(folder: string, turns: number): string {
  const lines: unknown[] = []
  let at = Date.parse('2026-09-01T00:00:00Z')
  const stamp = (): string => new Date((at += 1_500)).toISOString()
  for (let turn = 1; turn <= turns; turn += 1) {
    const file = path.join(folder, `src/section-${turn % 12}.scss`)
    lines.push({
      type: 'user',
      uuid: `u${turn}`,
      message: { role: 'user', content: `Turn ${turn}: tighten the spacing in section ${turn}.` },
      timestamp: stamp()
    })
    lines.push({
      type: 'assistant',
      message: {
        id: `m${turn}`,
        role: 'assistant',
        content: [
          { type: 'text', text: `Checking section ${turn} first.` },
          {
            type: 'tool_use',
            id: `tool${turn}`,
            name: 'Edit',
            input: { file_path: file, old_string: 'gap: 24px;', new_string: 'gap: 16px;' }
          }
        ]
      },
      timestamp: stamp()
    })
    lines.push({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: `tool${turn}`, content: `Updated ${file}` }]
      },
      toolUseResult: {
        filePath: file,
        structuredPatch: [
          {
            oldStart: 4,
            oldLines: 3,
            newStart: 4,
            newLines: 3,
            lines: [' .section {', '-  gap: 24px;', '+  gap: 16px;', ' }']
          }
        ]
      },
      timestamp: stamp()
    })
    lines.push({
      type: 'assistant',
      message: {
        id: `m${turn}b`,
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: [
              `Section ${turn} now uses a **16px** gap.`,
              '',
              '- Matches the grid rhythm',
              '- Leaves the mobile breakpoint alone',
              '',
              '```scss',
              '.section {',
              '  gap: 16px;',
              '}',
              '```'
            ].join('\n')
          }
        ]
      },
      timestamp: stamp()
    })
    lines.push({ type: 'system', subtype: 'turn_duration', durationMs: 4_200, timestamp: stamp() })
  }
  return `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`
}

export async function openSeededChatThread(
  page: Page,
  electronApp: ElectronApplication,
  seed: { folder: string; turns: number; sessionId: string; title: string; workspaceName: string }
): Promise<void> {
  const home = await electronApp.evaluate(({ app }) => app.getPath('home'))
  const projectDir = path.join(home, '.claude', 'projects', 'e2e-seeded')
  mkdirSync(projectDir, { recursive: true })
  writeFileSync(
    path.join(projectDir, `${seed.sessionId}.jsonl`),
    chatTranscriptJsonl(seed.folder, seed.turns)
  )
  await openChatThread(page, seed)
}

/** A chat thread on the fake CLI; with a session id it resumes that transcript. */
export async function openChatThread(
  page: Page,
  seed: { folder: string; title: string; workspaceName: string; sessionId?: string }
): Promise<void> {
  const command = `'${process.execPath}' '${FAKE_CLAUDE}'`
  await page.evaluate(
    async ({ seed, command }) => {
      const settings = await window.api.settings.set({
        experimentalChatMode: true,
        agentCmdOverrides: { claude: command }
      } as Partial<GlobalSettings>)
      const store = window.__store
      if (!store) {
        throw new Error('Store unavailable')
      }
      store.setState({ settings: settings as GlobalSettings })
      await store.getState().hydrateChatMode()
      const workspace = await store
        .getState()
        .createChatWorkspace({ name: seed.workspaceName, directories: [seed.folder] })
      const thread = await store.getState().createChatThread(workspace.id, seed.title, {
        activate: false
      })
      if (!thread) {
        throw new Error('Thread not created')
      }
      if (seed.sessionId) {
        await store.getState().updateChatThread(thread.id, { claudeSessionId: seed.sessionId })
      }
      store.getState().setActiveChatThread(thread.id)
      store.getState().setActiveView('chat')
    },
    { seed, command }
  )
}
