import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const BROWSER_EXTENSION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['extension', 'list'],
    summary: 'List bundled and loaded browser extensions',
    usage: 'muster extension list [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['extension', 'reload'],
    summary: 'Reload configured extensions into every browser session',
    usage: 'muster extension reload [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['extension', 'install'],
    summary: 'Install and enable a bundled extension',
    usage: 'muster extension install --id <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id']
  },
  {
    path: ['extension', 'disable'],
    summary: 'Stop loading a bundled extension without deleting it',
    usage: 'muster extension disable --id <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id']
  },
  {
    path: ['extension', 'uninstall'],
    summary: 'Remove a bundled extension and its stored credentials',
    usage: 'muster extension uninstall --id <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id']
  },
  {
    path: ['extension', 'wp-login', 'show'],
    summary: 'Show WordPress autofill settings (never prints the password)',
    usage: 'muster extension wp-login show [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['extension', 'wp-login', 'set'],
    summary: 'Set WordPress autofill username, password, or auto-login',
    usage:
      'muster extension wp-login set [--username <name>] [--password-stdin | --password-file <path>] [--auto-login | --no-auto-login] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'username',
      'password-stdin',
      'password-file',
      'auto-login',
      'no-auto-login'
    ]
  },
  {
    path: ['extension', 'wp-login', 'clear-password'],
    summary: 'Forget the stored WordPress password',
    usage: 'muster extension wp-login clear-password [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  }
]
