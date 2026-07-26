import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const AGENT_HOOK_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'hooks', 'status'],
    summary: 'Show whether Muster-managed agent status hooks are enabled',
    usage: 'orca agent hooks status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['orca agent hooks status', 'orca agent hooks status --json']
  },
  {
    path: ['agent', 'hooks', 'off'],
    summary: 'Disable Muster-managed agent status hooks and remove local hook entries',
    usage: 'orca agent hooks off [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['orca agent hooks off']
  },
  {
    path: ['agent', 'hooks', 'on'],
    summary: 'Enable Muster-managed agent status hooks',
    usage: 'orca agent hooks on [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['orca agent hooks on']
  }
]
