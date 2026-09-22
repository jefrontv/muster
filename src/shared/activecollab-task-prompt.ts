// The message handed to an agent when someone sends tasks from the Tasks panel.
//
// Names and ids only, never bodies. The agent has the ActiveCollab MCP and reads the task itself,
// which keeps the prompt small and keeps the agent looking at live data rather than a snapshot that
// was true when the button was pressed. A description pasted in at send time is stale the moment
// someone edits the task.
//
// Both numbers travel. `taskNumber` is what the person sees in ActiveCollab and will say out loud;
// `id` is what the MCP addresses a task by. Sending only the display number would make the agent
// search, which costs a round trip and can match the wrong task in another project.

/** Only the fields the prompt needs, so a caller can pass a task or a projection of one. */
export type ActiveCollabTaskPromptTask = {
  id: number
  taskNumber: number
  name: string
  projectId: number
  projectName: string
}

export const MAX_TASKS_PER_PROMPT = 10

/**
 * Why a cap at all: a prompt naming thirty tasks is not a task, it is a backlog dump, and an agent
 * handed one will either pick arbitrarily or try all of them badly. Ten is generous for the "a few
 * related tickets" case this is for.
 */
export function exceedsTaskPromptLimit(count: number): boolean {
  return count > MAX_TASKS_PER_PROMPT
}

function line(task: ActiveCollabTaskPromptTask): string {
  return `#${task.taskNumber} (id ${task.id}) ${task.name.trim()}`
}

/**
 * Null when there is nothing to send, so a caller cannot accidentally submit an empty prompt.
 *
 * The instruction to read the task first is the part that makes name-only work: without it an agent
 * may take the title at face value and start editing, and a task title is a label, not a spec.
 */
export function buildActiveCollabTaskPrompt(
  tasks: readonly ActiveCollabTaskPromptTask[]
): string | null {
  if (tasks.length === 0) {
    return null
  }
  const capped = tasks.slice(0, MAX_TASKS_PER_PROMPT)
  const project = capped[0]
  if (capped.length === 1) {
    return [
      `Work on ActiveCollab task ${line(project)}, in project ${project.projectName} (id ${project.projectId}).`,
      'Read it with the activecollab MCP before you start, including its comments and attachments.'
    ].join('\n')
  }
  // Why the project is stated once rather than per line: the panel only ever sends tasks from the
  // one bound project, so repeating it on every line is noise the agent has to read past.
  return [
    `Work on these ActiveCollab tasks, all in project ${project.projectName} (id ${project.projectId}):`,
    ...capped.map((task) => `- ${line(task)}`),
    '',
    'Read each one with the activecollab MCP before you start, including its comments and attachments.'
  ].join('\n')
}
