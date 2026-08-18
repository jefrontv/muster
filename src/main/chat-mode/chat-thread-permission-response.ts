// The verdict payload the Claude CLI accepts for a can_use_tool control_request.
// Split out so the stream module stays under its line budget.

export function buildPermissionControlResponse(args: {
  requestId: string
  behavior: 'allow' | 'deny'
  message?: string
  updatedInput?: unknown
}): unknown {
  return {
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: args.requestId,
      response:
        args.behavior === 'allow'
          ? { behavior: 'allow', updatedInput: args.updatedInput ?? {} }
          : { behavior: 'deny', message: args.message ?? 'The user declined this tool use.' }
    }
  }
}
