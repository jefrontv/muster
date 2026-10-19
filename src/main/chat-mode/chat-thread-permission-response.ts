// The verdict payload the Claude CLI accepts for a can_use_tool control_request.
// Split out so the stream module stays under its line budget.

export function buildPermissionControlResponse(args: {
  requestId: string
  behavior: 'allow' | 'deny'
  message?: string
  updatedInput?: unknown
  /** "Always allow": the permission_suggestions entries the user accepted. */
  updatedPermissions?: unknown[]
  /** Deny and end the turn instead of letting Claude try another way. */
  interrupt?: boolean
}): unknown {
  return {
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: args.requestId,
      response:
        args.behavior === 'allow'
          ? {
              behavior: 'allow',
              updatedInput: args.updatedInput ?? {},
              ...(args.updatedPermissions?.length
                ? { updatedPermissions: args.updatedPermissions }
                : {})
            }
          : {
              behavior: 'deny',
              message: args.message ?? 'The user declined this tool use.',
              ...(args.interrupt ? { interrupt: true } : {})
            }
    }
  }
}
