import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const AGENT_HOOK_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'hooks', 'status'],
    summary: 'Show whether Muster-managed agent status hooks are enabled',
    usage: 'muster agent hooks status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['muster agent hooks status', 'muster agent hooks status --json']
  },
  {
    path: ['agent', 'hooks', 'off'],
    summary: 'Disable Muster-managed agent status hooks and remove local hook entries',
    usage: 'muster agent hooks off [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['muster agent hooks off']
  },
  {
    path: ['agent', 'hooks', 'on'],
    summary: 'Enable Muster-managed agent status hooks',
    usage: 'muster agent hooks on [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['muster agent hooks on']
  }
]
