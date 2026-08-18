import type { SshWorkspaceForgetResolution } from '@/components/sidebar/ssh-workspace-forget-resolution'
import type { WorktreeMetaSavedPayload } from '@/components/sidebar/worktree-meta-updates'
import type { LinkedWorkItemSummary } from '@/lib/new-workspace'
import type { OrcaHookScriptKind } from '@/lib/orca-hook-trust'
import type { SetupGuideSource } from '../../../../shared/feature-education-telemetry'
import type { FeatureTipId } from '../../../../shared/feature-tips'
import type { FeatureWallSetupStepId } from '../../../../shared/feature-wall-setup-steps'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import type { FeatureWallOpenSourceTelemetry } from '../../../../shared/telemetry-events'
import type { WorkspaceCreateTelemetrySource, WorkspaceStatus } from '../../../../shared/types'

export type EditMetaModalPayload = {
  worktreeId: string
  currentDisplayName?: string
  currentIssue?: number | null
  currentPR?: number | null
  currentComment?: string
  focus?: 'displayName' | 'issue' | 'pr' | 'comment'
  afterSave?: (payload: WorktreeMetaSavedPayload) => void | Promise<void>
}

export type DeleteWorktreeModalPayload = {
  /** Single-target delete. Superseded by `worktreeIds` when both are present. */
  worktreeId?: string
  /** Batch delete; always confirms. */
  worktreeIds?: string[]
  allowSkipConfirm?: boolean
  onDeleted?: (worktreeIds: string[]) => void
}

export type ForgetSshWorkspaceModalPayload = {
  worktreeId: string
  displayName: string
  resolution: SshWorkspaceForgetResolution
}

export type AddProjectFromFolderModalPayload = {
  folderPath: string
  connectionId?: string
}

export type NonGitFolderModalPayload = {
  folderPath: string
  connectionId?: string
  runtimeEnvironmentId?: string
}

export type RemoveFolderModalPayload = {
  repoId: string
  displayName: string
}

export type AddRepoModalPayload = {
  /** Set only by the sidebar drop target; the hosted dialog never reads it. */
  droppedLocalPath?: string
}

export type ProjectAddedModalPayload = {
  repoId?: string
  /** Legacy key written by older onboarding builds; still accepted so a stale
   *  modal can't block follow-up contextual tours. */
  projectId?: string
}

export type WorktreeVisibilityModalPayload = {
  repoId: string
}

export type SetupGuideModalPayload = {
  setupStepId?: FeatureWallSetupStepId
  telemetrySource?: SetupGuideSource
}

export type FeatureWallModalPayload = {
  source?: FeatureWallOpenSourceTelemetry
}

export type FeatureTipsModalPayload = {
  source?: 'app_open'
  tipId?: FeatureTipId
}

export type NewWorkspaceComposerModalPayload = {
  /** 'open' shows the open-existing-checkout tab first; 'worktree' the create
   *  form. Omitted = smart default (open when the project has a checkout). */
  mode?: 'open' | 'worktree'
  prefilledName?: string
  initialRepoId?: string
  initialEphemeralVmRecipeId?: string
  initialProjectGroupId?: string
  linkedWorkItem?: LinkedWorkItemSummary | null
  taskSourceContext?: TaskSourceContext | null
  initialBaseBranch?: string
  initialWorkspaceStatus?: WorkspaceStatus
  /** Telemetry surface that opened the composer, so `workspace_created.source`
   *  carries the right value. Falls back to `unknown` when omitted. */
  telemetrySource?: WorkspaceCreateTelemetrySource
  contextualTourSource?: string
  /** Correlates a setup-guide tour request with this composer instance. */
  setupGuideTourRequestId?: string
}

export type OrcaYamlHooksModalPayload = {
  repoId: string
  repoName: string
  scriptKind: OrcaHookScriptKind
  scriptContent: string
  contentHash: string
  previouslyApproved: boolean
  onResolve: (decision: 'run' | 'skip') => void
}

/** Every modal id mapped to the payload `openModal` requires for it.
 *  A member that admits `undefined` may be opened with no payload. */
export type ModalPayloads = {
  none: undefined
  'create-worktree': undefined
  'edit-meta': EditMetaModalPayload
  'delete-worktree': DeleteWorktreeModalPayload
  'forget-ssh-workspace': ForgetSshWorkspaceModalPayload
  'confirm-add-project-from-folder': AddProjectFromFolderModalPayload
  'confirm-non-git-folder': NonGitFolderModalPayload
  'confirm-remove-folder': RemoveFolderModalPayload
  'add-repo': AddRepoModalPayload | undefined
  'quick-open': undefined
  'worktree-palette': undefined
  'action-palette': undefined
  'workspace-cleanup': undefined
  'project-added': ProjectAddedModalPayload | undefined
  'worktree-visibility': WorktreeVisibilityModalPayload
  'setup-guide': SetupGuideModalPayload | undefined
  'feature-wall': FeatureWallModalPayload | undefined
  'feature-tips': FeatureTipsModalPayload | undefined
  'new-workspace-composer': NewWorkspaceComposerModalPayload | undefined
  'confirm-orca-yaml-hooks': OrcaYamlHooksModalPayload
}

export type ModalId = keyof ModalPayloads

export type ModalPayload = ModalPayloads[ModalId]

/** Payload argument is required unless the modal's payload admits `undefined`. */
export type OpenModalArgs<K extends ModalId> = undefined extends ModalPayloads[K]
  ? [data?: ModalPayloads[K]]
  : [data: ModalPayloads[K]]

export type OpenModal = <K extends ModalId>(modal: K, ...args: OpenModalArgs<K>) => void

export type ModalState = {
  activeModal: ModalId
  modalData: ModalPayload
}

/** Narrowed payload for `modal`, or null when a different modal is active. */
export function getModalData<K extends ModalId>(
  state: ModalState,
  modal: K
): ModalPayloads[K] | null {
  // Why: openModal is the sole writer of the pair so modalData always matches
  // activeModal, but TS cannot correlate two sibling fields — assert once here
  // instead of at every consumer.
  return state.activeModal === modal ? (state.modalData as ModalPayloads[K]) : null
}
