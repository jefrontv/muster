// ActiveCollab comment drafts an agent queues for the user to review and post in Muster.
// Agents never post: the comment only goes out when the user clicks Post.
import { SiteMcpToolError } from './site-mcp-arguments'
import type { SiteMcpTool } from './site-mcp-context'
import { objectSchema } from './site-mcp-schemas'

const ATTACHMENTS = {
  type: 'array',
  items: { type: 'string' },
  description: 'Paths in your cwd or Downloads. Replaces files you attached; omit to keep them.'
}

const BODY = {
  type: 'string',
  description:
    'ActiveCollab HTML. Mention: <span class="new_mention" data-user-id="ID" data-type="user">Name</span>'
}

export const SITE_MCP_COMMENT_DRAFT_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'queue_task_comment',
    description:
      "Queue an ActiveCollab task comment for the user to review and post in Muster. Never posts. Replaces the task's waiting draft.",
    inputSchema: objectSchema(
      {
        project_id: { type: 'number', description: 'ActiveCollab project id.' },
        task_id: { type: 'number', description: 'Task id, not task number.' },
        body_html: BODY,
        attachments: ATTACHMENTS
      },
      ['project_id', 'task_id', 'body_html']
    ),
    run: (context, args) => draftTool(context, 'queue', args)
  },
  {
    name: 'list_comment_drafts',
    description:
      'List comment drafts queued in Muster. The user may have edited one; read it before amending.',
    inputSchema: objectSchema({
      task_id: { type: 'number', description: 'Filter by task id.' },
      status: {
        type: 'string',
        enum: ['waiting', 'all'],
        description: 'all adds recently posted and discarded drafts.'
      }
    }),
    run: (context, args) => draftTool(context, 'list', args)
  },
  {
    name: 'amend_comment_draft',
    description: "Replace a waiting draft's body, e.g. after user feedback.",
    inputSchema: objectSchema(
      {
        draft: { type: 'string', description: 'Draft id or number.' },
        body_html: BODY,
        note: { type: 'string', description: 'One line on what changed.' },
        attachments: ATTACHMENTS
      },
      ['draft', 'body_html']
    ),
    run: (context, args) => draftTool(context, 'amend', args)
  }
]

function draftTool(
  context: Parameters<SiteMcpTool['run']>[0],
  op: 'queue' | 'list' | 'amend',
  args: Record<string, unknown>
): Promise<unknown> {
  if (!context.commentDraftTool) {
    throw new SiteMcpToolError('This Muster build cannot queue comment drafts.')
  }
  return context.commentDraftTool(op, args)
}
