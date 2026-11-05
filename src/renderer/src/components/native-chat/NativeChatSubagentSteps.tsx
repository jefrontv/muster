// A Code panel subagent's own steps, read from its sidechain transcript and tailed while it runs.

import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { translate } from '@/i18n/i18n'
import type { AgentType } from '../../../../shared/native-chat-types'
import type { ChatAgentItem } from '../chat-conversation/chat-subagent-focus'
import { ChatProcessItems } from '../chat-conversation/ChatProcessItems'
import { getNativeChatSessionTransport } from './native-chat-session-transport'
import { useNativeChatLiveSession } from './use-native-chat-live-session'
import { nativeChatEngineTurns } from './native-chat-engine-turns'

/** The sidechain appears a moment after launch; look again this often while the agent runs. */
const RETRY_MS = 1500

export type NativeChatSubagentSource = {
  paneKey: string
  agent: AgentType
  sessionId: string
  transcriptPath: string | null
  runtimeEnvironmentId: string | null
}

const note = (text: string): React.JSX.Element => (
  <p className="text-[13px] text-chat-ink-tertiary">{text}</p>
)

function SidechainSteps(props: {
  source: NativeChatSubagentSource
  path: string
  running: boolean
}): React.JSX.Element {
  const { source } = props
  const session = useNativeChatLiveSession({
    // Its own key: a subagent has no hook status of its own.
    paneKey: `${source.paneKey}#subagent:${props.path}`,
    agent: source.agent,
    sessionId: source.sessionId,
    transcriptPath: props.path,
    runtimeEnvironmentId: source.runtimeEnvironmentId
  })
  const items = useMemo(
    () =>
      nativeChatEngineTurns(
        {
          agent: source.agent,
          messages: session.messages,
          isWorking: props.running,
          awaitingUser: false,
          failedDeliveryText: '',
          now: 0
        },
        null
      ).turns.flatMap((turn) => turn.items),
    [session.messages, source.agent, props.running]
  )
  return items.length > 0 ? (
    <ChatProcessItems items={items} />
  ) : (
    note(translate('components.chat-conversation.focus.noSteps', 'Waiting for its first step'))
  )
}

export function NativeChatSubagentSteps(props: {
  source: NativeChatSubagentSource
  agent: ChatAgentItem
}): React.JSX.Element {
  const { source, agent } = props
  const running = agent.status === 'running'
  const [path, setPath] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    const transport = getNativeChatSessionTransport(source.runtimeEnvironmentId)
    const look = async (): Promise<void> => {
      const found = await transport.resolveSubagentTranscript({
        agent: source.agent,
        sessionId: source.sessionId,
        ...(source.transcriptPath ? { transcriptPath: source.transcriptPath } : {}),
        toolUseId: agent.id
      })
      if (cancelled) {
        return
      }
      setPath(found)
      if (!found && running) {
        timer = window.setTimeout(() => void look(), RETRY_MS)
      }
    }
    void look()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    source.agent,
    source.sessionId,
    source.transcriptPath,
    source.runtimeEnvironmentId,
    agent.id,
    running
  ])

  if (path) {
    return <SidechainSteps source={source} path={path} running={running} />
  }
  if (path === undefined || running) {
    return note(
      translate('components.chat-conversation.focus.noSteps', 'Waiting for its first step')
    )
  }
  return note(
    translate(
      'components.chat-conversation.focus.noSidechain',
      "This agent's steps weren't saved with the session."
    )
  )
}
