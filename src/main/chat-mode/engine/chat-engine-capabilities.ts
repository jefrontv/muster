// Reads the CLI's `initialize` response into the composer's command, model and
// agent lists.

import type {
  ChatEngineCapabilities,
  ChatEngineEffort,
  ChatEngineModelOption
} from '../../../shared/chat-engine-types'
import { asRecord, asString, strings } from './chat-engine-records'

const EFFORTS = new Set<ChatEngineEffort>(['low', 'medium', 'high', 'xhigh', 'max'])

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const record = asRecord(entry)
        return record ? [record] : []
      })
    : []
}

function modelOption(model: Record<string, unknown>): ChatEngineModelOption[] {
  const value = asString(model.value)
  if (!value) {
    return []
  }
  return [
    {
      value,
      resolved: asString(model.resolvedModel),
      displayName: asString(model.displayName) ?? value,
      description: asString(model.description) ?? '',
      effortLevels:
        model.supportsEffort === false
          ? []
          : strings(model.supportedEffortLevels).filter((level): level is ChatEngineEffort =>
              EFFORTS.has(level as ChatEngineEffort)
            )
    }
  ]
}

export function parseChatEngineCapabilities(response: unknown): ChatEngineCapabilities {
  const fields = asRecord(response) ?? {}
  const account = asRecord(fields.account) ?? {}
  return {
    commands: records(fields.commands).flatMap((command) => {
      const name = asString(command.name)
      return name
        ? [
            {
              name,
              description: asString(command.description) ?? '',
              argumentHint: asString(command.argumentHint) ?? ''
            }
          ]
        : []
    }),
    models: records(fields.models).flatMap(modelOption),
    agents: records(fields.agents).flatMap((agent) => {
      const name = asString(agent.name)
      return name ? [{ name, description: asString(agent.description) ?? '' }] : []
    }),
    account: {
      email: asString(account.email),
      organization: asString(account.organization),
      plan: asString(account.subscriptionType)
    }
  }
}
