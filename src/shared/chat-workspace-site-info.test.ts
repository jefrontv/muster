import { describe, expect, it } from 'vitest'
import type { ChatWorkspace } from './chat-mode-types'
import {
  MAX_CHAT_WORKSPACE_EMAILS,
  MAX_CHAT_WORKSPACE_URLS,
  buildChatWorkspaceAgentBrief,
  chatWorkspaceAppendSystemPromptArg,
  chatWorkspaceProjects,
  deriveChatThreadTitle,
  isChatWorkspaceBriefTitle,
  unwrapChatWorkspaceUserTurn,
  wrapChatWorkspaceUserTurn,
  isChatWorkspaceIconOverridden,
  normalizeChatWorkspaceEmails,
  normalizeChatWorkspaceNotes,
  normalizeChatWorkspaceUrls,
  normalizeClientEmail,
  normalizeWebsiteUrl,
  websiteHostname
} from './chat-workspace-site-info'

function workspace(overrides: Partial<ChatWorkspace> = {}): ChatWorkspace {
  return {
    id: 'w1',
    name: 'Client site',
    directories: ['/sites/client'],
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

describe('normalizeWebsiteUrl', () => {
  it('adds https and keeps a parseable href', () => {
    expect(normalizeWebsiteUrl('example.com')).toBe('https://example.com/')
    expect(normalizeWebsiteUrl('https://app.example.com/path')).toBe('https://app.example.com/path')
  })

  it('rejects junk', () => {
    expect(normalizeWebsiteUrl('')).toBeNull()
    expect(normalizeWebsiteUrl('nota url')).toBeNull()
    expect(normalizeWebsiteUrl('ftp://example.com')).toBeNull()
  })
})

describe('websiteHostname', () => {
  it('reads the host from a bare domain or full URL', () => {
    expect(websiteHostname('https://www.example.com/blog')).toBe('www.example.com')
    expect(websiteHostname('staging.example.com')).toBe('staging.example.com')
  })
})

describe('normalizeChatWorkspaceUrls', () => {
  it('drops empties, dedupes, and keeps order', () => {
    expect(
      normalizeChatWorkspaceUrls([
        'https://example.com',
        'example.com',
        '',
        'https://staging.example.com',
        7,
        'https://staging.example.com/'
      ])
    ).toEqual(['https://example.com/', 'https://staging.example.com/'])
  })

  it('caps the list', () => {
    const raw = Array.from({ length: MAX_CHAT_WORKSPACE_URLS + 4 }, (_, i) => `https://s${i}.test`)
    expect(normalizeChatWorkspaceUrls(raw)).toHaveLength(MAX_CHAT_WORKSPACE_URLS)
  })
})

describe('normalizeChatWorkspaceEmails', () => {
  it('lowercases, drops junk, and dedupes', () => {
    expect(
      normalizeChatWorkspaceEmails([
        '  Jane@Client.com ',
        'jane@client.com',
        'not-an-email',
        'ops@client.com',
        7
      ])
    ).toEqual(['jane@client.com', 'ops@client.com'])
    expect(normalizeClientEmail('nope')).toBeNull()
  })

  it('caps the list', () => {
    const raw = Array.from({ length: MAX_CHAT_WORKSPACE_EMAILS + 3 }, (_, i) => `a${i}@c.test`)
    expect(normalizeChatWorkspaceEmails(raw)).toHaveLength(MAX_CHAT_WORKSPACE_EMAILS)
  })
})

describe('normalizeChatWorkspaceNotes', () => {
  it('trims and drops blanks', () => {
    expect(normalizeChatWorkspaceNotes('  hello  ')).toBe('hello')
    expect(normalizeChatWorkspaceNotes('   ')).toBeUndefined()
    expect(normalizeChatWorkspaceNotes(null)).toBeUndefined()
  })
})

describe('isChatWorkspaceIconOverridden', () => {
  it('treats lucide/emoji/upload as locked and favicon as auto unless flagged', () => {
    expect(
      isChatWorkspaceIconOverridden(workspace({ icon: { type: 'lucide', name: 'Folder' } }))
    ).toBe(true)
    expect(isChatWorkspaceIconOverridden(workspace({ icon: { type: 'emoji', emoji: '🌐' } }))).toBe(
      true
    )
    expect(
      isChatWorkspaceIconOverridden(
        workspace({
          icon: {
            type: 'image',
            src: 'https://www.google.com/s2/favicons?domain=x.test&sz=64',
            source: 'favicon'
          }
        })
      )
    ).toBe(false)
    expect(
      isChatWorkspaceIconOverridden(
        workspace({
          icon: {
            type: 'image',
            src: 'https://www.google.com/s2/favicons?domain=x.test&sz=64',
            source: 'favicon'
          },
          iconOverridden: true
        })
      )
    ).toBe(true)
  })
})

describe('chatWorkspaceProjects', () => {
  it('prefers the array and falls back to the legacy single binding', () => {
    expect(
      chatWorkspaceProjects(
        workspace({
          activeCollabProject: { id: 1, name: 'Old' },
          activeCollabProjects: [
            { id: 2, name: 'A' },
            { id: 3, name: 'B' }
          ]
        })
      ).map((p) => p.id)
    ).toEqual([2, 3])
    expect(
      chatWorkspaceProjects(workspace({ activeCollabProject: { id: 1, name: 'Old' } }))
    ).toEqual([{ id: 1, name: 'Old' }])
  })
})

describe('buildChatWorkspaceAgentBrief', () => {
  it('still names the workspace and muster tools when there is no site info', () => {
    const brief = buildChatWorkspaceAgentBrief(workspace())
    expect(brief).toContain('This chat belongs to the "Client site" workspace.')
    expect(brief).toContain('"muster" MCP tools')
    expect(brief).not.toContain('Primary website')
  })

  it('names the primary URL first and includes notes plus the linked project', () => {
    const brief = buildChatWorkspaceAgentBrief(
      workspace({
        urls: ['https://example.com', 'https://staging.example.com'],
        clientEmails: ['jane@client.com', 'ops@client.com'],
        notes: 'WordPress + LocalWP staging.',
        activeCollabProject: { id: 42, name: 'Acme' },
        directories: ['/sites/client', '/sites/plugin']
      })
    )
    expect(brief).toContain('This chat belongs to the "Client site" workspace.')
    expect(brief).toContain('Primary website: https://example.com/')
    expect(brief).toContain('- https://staging.example.com/')
    expect(brief).toContain('Primary client email: jane@client.com')
    expect(brief).toContain('- ops@client.com')
    expect(brief).toContain('WordPress + LocalWP staging.')
    expect(brief).toContain('Primary ActiveCollab project: Acme (id 42)')
    expect(brief).toContain('Primary working folder: /sites/client')
    expect(brief).toContain('- /sites/plugin')
    expect(brief?.indexOf('https://example.com/')).toBeLessThan(
      brief?.indexOf('https://staging.example.com/') ?? -1
    )
  })

  it('emits --append-system-prompt only for new sessions', () => {
    const site = workspace({ urls: ['https://example.com'] })
    const quote = (value: string): string => `'${value}'`
    expect(chatWorkspaceAppendSystemPromptArg(site, false, quote)).toContain(
      '--append-system-prompt'
    )
    expect(chatWorkspaceAppendSystemPromptArg(site, false, quote)).toContain(
      'Primary website: https://example.com/'
    )
    expect(chatWorkspaceAppendSystemPromptArg(site, true, quote)).toBe('')
    // A bare workspace still briefs the agent about its muster MCP tools.
    expect(chatWorkspaceAppendSystemPromptArg(workspace(), false, quote)).toContain(
      '"muster" MCP tools'
    )
  })

  it('wraps a user turn so the brief can be stripped from the visible bubble', () => {
    const wrapped = wrapChatWorkspaceUserTurn(
      'Primary client email: jane@client.com',
      'What is the client email?'
    )
    expect(wrapped).toContain('jane@client.com')
    expect(unwrapChatWorkspaceUserTurn(wrapped)).toBe('What is the client email?')
    expect(unwrapChatWorkspaceUserTurn('plain question')).toBe('plain question')
    expect(unwrapChatWorkspaceUserTurn('<muster-workspace-brief> This chat b…')).toBe('')
    expect(deriveChatThreadTitle(wrapped)).toBe('What is the client email?')
    expect(isChatWorkspaceBriefTitle('<muster-workspace-brief> This chat b…')).toBe(true)
  })
})
