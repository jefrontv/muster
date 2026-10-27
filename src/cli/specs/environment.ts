import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const ENVIRONMENT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['environment', 'add'],
    summary: 'Save a remote Muster runtime environment from a pairing code',
    usage: 'muster environment add --name <name> --pairing-code <code> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name'],
    examples: ['muster environment add --name work-laptop --pairing-code orca://pair?code=...']
  },
  {
    path: ['environment', 'list'],
    summary: 'List saved Muster runtime environments',
    usage: 'muster environment list [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['environment', 'show'],
    summary: 'Show one saved Muster runtime environment',
    usage: 'muster environment show --environment <selector> [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['environment', 'rm'],
    destructive: true,
    summary: 'Remove one saved Muster runtime environment',
    usage: 'muster environment rm --environment <selector> [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  }
]
