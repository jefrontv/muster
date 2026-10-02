// Tools that reach beyond the workspace: the web, helper agents, MCP servers,
// and anything without its own description.

import {
  DESCRIBE_BASE as base,
  type NativeChatDescribe as Describe
} from './native-chat-tool-activity-types'
import {
  mcpChatLiveLabel,
  mcpChatSentence,
  parseMcpToolName
} from './native-chat-tool-activity-mcp'
import { inputField, lowerFirst, urlDomain } from './native-chat-tool-input-fields'

export const describeWeb: Describe = ({ call, result, surface, t }) => {
  const url = inputField(call.input, 'url')
  const sources =
    result?.detail?.sources ?? (url ? [{ url, title: null as string | null }] : undefined)
  if (call.name === 'WebFetch') {
    const domain = url ? urlDomain(url) : ''
    return {
      ...base,
      group: 'web',
      icon: 'globe',
      verb:
        surface === 'chat'
          ? t('components.native-chat.activity.read', 'Read')
          : t('components.native-chat.activity.fetched', 'Fetched'),
      object: domain,
      detail: sources ? 'sources' : 'none',
      ...(sources ? { sources } : {}),
      liveLabel: t('components.native-chat.activity.readingPage', 'Reading {{site}}', {
        site: domain
      })
    }
  }
  return {
    ...base,
    group: 'web',
    icon: 'globe',
    verb: t('components.native-chat.activity.searchedWeb', 'Searched the web'),
    // The query is the model's wording; Chat shows where it looked instead.
    object: surface === 'code' ? (inputField(call.input, 'query') ?? '') : '',
    detail: sources ? 'sources' : 'none',
    ...(sources ? { sources } : {}),
    liveLabel: t('components.native-chat.activity.searchingWeb', 'Searching the web')
  }
}

export const describeAgent: Describe = ({ call, result, surface, t }) => {
  const task = inputField(call.input, 'description') ?? ''
  return {
    ...base,
    group: 'agent',
    icon: 'bot',
    verb: task
      ? t('components.native-chat.activity.askedHelper', 'Asked a helper to')
      : t('components.native-chat.activity.askedHelperPlain', 'Asked a helper'),
    object: lowerFirst(task),
    detail: surface === 'code' && result ? 'text' : 'none',
    liveLabel: task
      ? t('components.native-chat.activity.askingHelper', 'Asking a helper to {{task}}', {
          task: lowerFirst(task)
        })
      : t('components.native-chat.activity.askingHelperPlain', 'Asking a helper')
  }
}

export const describeOther: Describe = ({ call, surface, t }) => {
  const mcp = parseMcpToolName(call.name)
  if (mcp) {
    return surface === 'chat'
      ? {
          ...base,
          group: 'mcp',
          icon: 'plug',
          verb: mcpChatSentence(mcp, call.input, t),
          object: '',
          liveLabel: mcpChatLiveLabel(mcp, t)
        }
      : {
          ...base,
          group: 'mcp',
          icon: 'plug',
          verb: `${mcp.server}:`,
          object: mcp.tool,
          detail: 'fields',
          liveLabel: `${mcp.server}: ${mcp.tool}`
        }
  }
  switch (call.name) {
    case 'AskUserQuestion':
      return {
        ...base,
        group: 'question',
        icon: 'question',
        verb: t('components.native-chat.activity.askedYou', 'Asked you a question'),
        object: '',
        liveLabel: t('components.native-chat.activity.waitingForYou', 'Waiting for your answer')
      }
    case 'ExitPlanMode':
      return {
        ...base,
        group: 'other',
        icon: 'sparkles',
        verb: t('components.native-chat.activity.proposedPlan', 'Proposed a plan'),
        object: '',
        liveLabel: t('components.native-chat.activity.planning', 'Planning')
      }
    case 'Skill': {
      const skill = inputField(call.input, 'skill') ?? inputField(call.input, 'name') ?? ''
      return {
        ...base,
        group: 'other',
        icon: 'sparkles',
        verb: t('components.native-chat.activity.usedSkill', 'Used the {{skill}} skill', { skill }),
        object: '',
        liveLabel: t('components.native-chat.activity.usingSkill', 'Using a skill')
      }
    }
    default: {
      const verb =
        surface === 'chat'
          ? t('components.native-chat.activity.usedTool', 'Used {{tool}}', { tool: call.name })
          : call.name
      return {
        ...base,
        group: 'other',
        icon: 'tool',
        verb,
        object: '',
        detail: surface === 'code' ? 'fields' : 'none',
        liveLabel: t('components.native-chat.activity.working', 'Working')
      }
    }
  }
}
