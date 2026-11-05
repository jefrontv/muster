// Ported from the muster-bots fork (src/lib/live-activity.ts), Apache-2.0.
// What the presence line says a running turn is doing, with alternates it rotates through.

import { translate } from '@/i18n/i18n'
import type { ChatEngineItem, ChatEngineTurn } from '../../../../shared/chat-engine-types'
import type { ChatToolItem } from '@/components/chat-thread/chat-tool-input'
import { inputText } from '@/components/chat-thread/chat-tool-input'
import { mcpToolParts } from '@/components/chat-thread/chat-tool-row-model'

export type ChatTurnPhrases = {
  /** Rotation restarts when this changes: a new step, not a new word. */
  phase: string
  phrases: string[]
  /** The whole command, file or address behind the phrase, for its tooltip. */
  hover?: string
}

function thinkingPhrases(): string[] {
  return [
    translate('components.chat-conversation.presence.thinking', 'Thinking'),
    translate('components.chat-conversation.presence.mullingItOver', 'Mulling it over'),
    translate('components.chat-conversation.presence.piecingItTogether', 'Piecing it together'),
    translate('components.chat-conversation.presence.workingItOut', 'Working it out'),
    translate('components.chat-conversation.presence.weighingOptions', 'Weighing options'),
    translate('components.chat-conversation.presence.diggingIn', 'Digging in'),
    translate('components.chat-conversation.presence.liningThingsUp', 'Lining things up')
  ]
}

const basename = (path: string): string => path.split(/[\\/]/).findLast(Boolean) ?? path

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Null while the call's input still streams, so a half-written path never shows. */
function fileTarget(item: ChatToolItem): string | null {
  if (item.status === 'streaming') {
    return null
  }
  return inputText(item.input, 'file_path') ?? inputText(item.input, 'notebook_path')
}

/** The words for one live tool call. */
export function toolPhrases(item: ChatToolItem): ChatTurnPhrases {
  const phase = `tool:${item.id}`
  if (item.status === 'awaiting-approval') {
    return {
      phase: `${phase}:approval`,
      phrases: [
        translate(
          'components.chat-conversation.presence.awaitingApproval',
          'Waiting for your approval'
        )
      ]
    }
  }
  const file = fileTarget(item)
  const named = (lead: (file: string) => string, alternates: string[]): ChatTurnPhrases =>
    file
      ? { phase, phrases: [lead(basename(file)), ...alternates], hover: file }
      : { phase, phrases: alternates }
  switch (item.name) {
    case 'Read':
    case 'NotebookRead':
      return named(
        (name) =>
          translate('components.chat-conversation.presence.readingFile', 'Reading {{file}}', {
            file: name
          }),
        [
          translate('components.chat-conversation.presence.readingThrough', 'Reading through'),
          translate('components.chat-conversation.presence.lookingItOver', 'Looking it over')
        ]
      )
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return named(
        (name) =>
          translate('components.chat-conversation.presence.editingFile', 'Editing {{file}}', {
            file: name
          }),
        [translate('components.chat-conversation.presence.makingChanges', 'Making changes')]
      )
    case 'Write':
      return named(
        (name) =>
          translate('components.chat-conversation.presence.writingFile', 'Writing {{file}}', {
            file: name
          }),
        [translate('components.chat-conversation.presence.draftingIt', 'Drafting it')]
      )
    case 'Grep':
    case 'Glob':
    case 'LS':
      return {
        phase,
        phrases: [
          translate('components.chat-conversation.presence.searchingFiles', 'Searching files'),
          translate('components.chat-conversation.presence.narrowingItDown', 'Narrowing it down')
        ],
        hover: inputText(item.input, 'pattern') ?? undefined
      }
    case 'Bash':
    case 'BashOutput': {
      const command = inputText(item.input, 'command')
      const description = item.status === 'streaming' ? null : inputText(item.input, 'description')
      return {
        phase,
        phrases: [
          description ??
            translate('components.chat-conversation.presence.runningCommand', 'Running a command'),
          translate(
            'components.chat-conversation.presence.checkingTheOutput',
            'Checking the output'
          )
        ],
        hover: command ?? undefined
      }
    }
    case 'WebSearch':
      return {
        phase,
        phrases: [
          translate('components.chat-conversation.presence.searchingWeb', 'Searching the web'),
          translate('components.chat-conversation.presence.lookingItUp', 'Looking it up'),
          translate(
            'components.chat-conversation.presence.goingThroughResults',
            'Going through results'
          )
        ],
        hover: inputText(item.input, 'query') ?? undefined
      }
    case 'WebFetch': {
      const url = inputText(item.input, 'url')
      return {
        phase,
        phrases: [
          url
            ? translate('components.chat-conversation.presence.readingSite', 'Reading {{site}}', {
                site: domainOf(url)
              })
            : translate('components.chat-conversation.presence.readingPage', 'Reading a page'),
          translate('components.chat-conversation.presence.skimmingThePage', 'Skimming the page')
        ],
        hover: url ?? undefined
      }
    }
    case 'Task':
    case 'Agent':
      return {
        phase,
        phrases: [
          translate('components.chat-conversation.presence.handingOff', 'Handing it to a subagent'),
          translate('components.chat-conversation.presence.passingItAlong', 'Passing it along')
        ]
      }
    case 'TodoWrite':
      return {
        phase,
        phrases: [
          translate('components.chat-conversation.presence.planningSteps', 'Planning the steps'),
          translate('components.chat-conversation.presence.liningThingsUp', 'Lining things up')
        ]
      }
    case 'AskUserQuestion':
      return {
        phase,
        phrases: [
          translate('components.chat-conversation.presence.askingYou', 'Asking you a question')
        ]
      }
  }
  const mcp = mcpToolParts(item.name)
  if (mcp) {
    return {
      phase,
      phrases: [
        translate('components.chat-conversation.presence.usingServer', 'Using {{server}}', {
          server: mcp.server
        })
      ]
    }
  }
  return {
    phase,
    phrases: [
      translate('components.chat-conversation.presence.usingTool', 'Using {{tool}}', {
        tool: item.name
      })
    ]
  }
}

function lastLiveTool(items: ChatEngineItem[]): ChatToolItem | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]!
    if (item.kind === 'tool' && item.status !== 'done' && item.status !== 'error') {
      if (item.status === 'denied' || item.status === 'interrupted') {
        continue
      }
      return item
    }
    if (item.kind === 'agent' && item.status === 'running') {
      return lastLiveTool(item.items)
    }
  }
  return null
}

/** The running turn's "now": its live tool call, else thinking. */
export function turnNowPhrases(turn: Pick<ChatEngineTurn, 'id' | 'items'>): ChatTurnPhrases {
  const live = lastLiveTool(turn.items)
  return live ? toolPhrases(live) : { phase: `think:${turn.id}`, phrases: thinkingPhrases() }
}

/** Presence steps aside once the answer starts streaming, as in Bots. */
export function turnIsAnswering(turn: Pick<ChatEngineTurn, 'items'>): boolean {
  const last = turn.items.at(-1)
  return last?.kind === 'text' && last.text.trim() !== ''
}

function hash(value: string): number {
  let h = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Step 0 is the lead phrase; later steps walk the alternates in a seeded order, then the lead again. */
export function phraseAt(phrases: readonly string[], seed: string, step: number): string {
  if (phrases.length < 2 || step <= 0) {
    return phrases[0] ?? ''
  }
  const order = phrases
    .slice(1)
    .map((phrase, index) => ({ phrase, rank: hash(`${seed}|${index}`) }))
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.phrase)
  const cycle = [...order, phrases[0]!]
  return cycle[(step - 1) % cycle.length]!
}

/** Each phrase holds 4 to 6 seconds, so the line never ticks like a clock. */
export function phraseHoldMs(seed: string, step: number): number {
  return 4000 + (hash(`${seed}#${step}`) % 2001)
}
