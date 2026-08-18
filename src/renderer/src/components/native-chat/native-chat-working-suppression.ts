export function shouldShowNativeChatWorking(args: {
  isConversation: boolean
  working: boolean
  /** A local optimistic send with no agent signal yet — covers CLI first-turn
   *  spinup, which otherwise reads as dead air until hooks flip to working. */
  awaitingSend?: boolean
  /** The agent is parked on the user (permission prompt / question). Sends made
   *  while it is parked queue behind that prompt, so their optimistic echoes
   *  never clear — without this the spinner outlives the turn forever and hides
   *  the very prompt that would release it. Real work still wins. */
  awaitingUser?: boolean
  interrupted: boolean
}): boolean {
  if (!args.isConversation || args.interrupted) {
    return false
  }
  if (args.working) {
    return true
  }
  return args.awaitingSend === true && args.awaitingUser !== true
}

/**
 * Clear local Stop suppression when live work ends, or when a newer working
 * epoch starts while suppressed (Stop → immediate next turn without a ready gap).
 */
export function shouldClearNativeChatWorkingSuppression(args: {
  working: boolean
  interrupted?: boolean
  /** Hook `stateStartedAt` for the current working epoch, when known. */
  workingEpoch?: number | null
  /** Previous observed working epoch; used to detect a new generation. */
  previousWorkingEpoch?: number | null
}): boolean {
  if (!args.working) {
    return true
  }
  // Why: interrupt + next-turn can coalesce so `working` never goes false; a
  // newer epoch means the user started another generation and must see it.
  if (
    args.interrupted === true &&
    args.workingEpoch != null &&
    args.previousWorkingEpoch != null &&
    args.workingEpoch > args.previousWorkingEpoch
  ) {
    return true
  }
  return false
}
