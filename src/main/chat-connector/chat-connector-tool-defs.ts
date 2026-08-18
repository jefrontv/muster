// The muster MCP tool catalog (names + JSON-Schema inputs). Handlers live in
// chat-connector-tools; keep the shapes here so the list stays scannable.

import type { Tool } from '@modelcontextprotocol/sdk/types.js'

export const CHAT_CONNECTOR_TOOL_NAMES = [
  'workspace_get_settings',
  'list_threads',
  'workspace_update_settings',
  'workspace_set_directories',
  'set_default_model',
  'rename_thread',
  'archive_threads',
  'delete_threads'
] as const

export type ChatConnectorToolName = (typeof CHAT_CONNECTOR_TOOL_NAMES)[number]

export function chatConnectorToolDefs(): Tool[] {
  return [
    {
      name: 'workspace_get_settings',
      description:
        "Read this chat's workspace settings: name, notes, URLs, client emails, color, working folders, the default chat model, and thread counts.",
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'list_threads',
      description:
        'List the chat threads in this scope (this workspace, or standalone chats when the chat has no workspace) with id, title, and archived state.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'workspace_update_settings',
      description:
        "Update this chat's workspace settings. Provide only the fields to change: name, notes, urls, clientEmails, or color (hex).",
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'New workspace name.' },
          notes: { type: 'string', description: 'Free-text project notes. Empty string clears.' },
          urls: {
            type: 'array',
            items: { type: 'string' },
            description: 'Full replacement list of site/project URLs; first is primary.'
          },
          clientEmails: {
            type: 'array',
            items: { type: 'string' },
            description: 'Full replacement list of client emails; first is primary.'
          },
          color: { type: 'string', description: 'Accent color as hex, e.g. #e5484d.' }
        }
      }
    },
    {
      name: 'workspace_set_directories',
      description:
        "Replace this workspace's working folders. Absolute paths that must exist; the first is the primary working directory. Takes effect on newly launched chats.",
      inputSchema: {
        type: 'object',
        properties: {
          directories: {
            type: 'array',
            items: { type: 'string' },
            description: 'Absolute directory paths; first entry is the primary cwd.'
          }
        },
        required: ['directories']
      }
    },
    {
      name: 'set_default_model',
      description:
        'Set the default Claude model for new chats (a global app setting). The model id must be one the app has already seen.',
      inputSchema: {
        type: 'object',
        properties: {
          model: { type: 'string', description: 'Concrete model id, e.g. claude-opus-5.' }
        },
        required: ['model']
      }
    },
    {
      name: 'rename_thread',
      description:
        'Rename a chat thread in this scope. Omit threadId to rename the current chat.',
      inputSchema: {
        type: 'object',
        properties: {
          threadId: { type: 'string', description: 'Thread to rename; defaults to this chat.' },
          title: { type: 'string', description: 'New thread title.' }
        },
        required: ['title']
      }
    },
    {
      name: 'archive_threads',
      description:
        'Archive (or unarchive with archived=false) chat threads in this scope by id.',
      inputSchema: {
        type: 'object',
        properties: {
          threadIds: { type: 'array', items: { type: 'string' } },
          archived: { type: 'boolean', description: 'Defaults to true (archive).' }
        },
        required: ['threadIds']
      }
    },
    {
      name: 'delete_threads',
      description:
        'Permanently delete chat threads in this scope, by ids or older than N days of inactivity. Never deletes the current chat. The user must confirm in the app before anything is deleted.',
      inputSchema: {
        type: 'object',
        properties: {
          threadIds: { type: 'array', items: { type: 'string' } },
          olderThanDays: {
            type: 'number',
            description: 'Delete threads with no activity for at least this many days.'
          }
        }
      }
    }
  ]
}
