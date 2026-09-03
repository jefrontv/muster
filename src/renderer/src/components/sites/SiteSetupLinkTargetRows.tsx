// Replaces the Clone row on Review for a link source (plan doc "Review for a link source"). A
// link names a repository but not a folder, so the user picks one of: an existing checkout on
// disk, a fresh clone into the configured projects root, or a folder they choose themselves. The
// second row keeps the link's SSH credentials visible but collapsed, since the one real question
// on this screen is the folder, not the ten-row field table (plan doc friction #6).

import { FolderOpen, KeyRound, KeyRound as PasswordIcon, ShieldOff } from 'lucide-react'
import type React from 'react'
import { useId } from 'react'
import type { PendingSiteBind, SiteBindFields } from '../../../../shared/site-bind-types'
import { repoSlug } from '../../../../shared/site-local-domain'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { getSiteBindFieldLabels, getSiteBindStrings } from './site-bind-strings'
import { SiteSetupRow } from './SiteSetupRow'

export type SiteSetupLinkTarget =
  | { kind: 'existing'; path: string }
  | { kind: 'clone'; root: string }

type SiteSetupLinkTargetRowsProps = {
  pending: PendingSiteBind
  /** Empty when no projects folder is configured. */
  primaryRoot: string
  /** Empty when the link's repo cannot be resolved to a clone URL. */
  cloneUrl: string
  value: SiteSetupLinkTarget | null
  onChange: (next: SiteSetupLinkTarget) => void
}

/** Display order; `liveDomainProtocol` is folded into `liveDomain`, so it is not listed. */
const SUMMARY_FIELDS = [
  'reponame',
  'hostname',
  'username',
  'rootPath',
  'liveDomain',
  'localDomain',
  'environment',
  'deployCommand',
  'themeDistPath',
  'notes'
] as const

function summaryValue(fields: SiteBindFields, key: (typeof SUMMARY_FIELDS)[number]): string {
  if (key === 'liveDomain' && fields.liveDomain.length > 0) {
    return `${fields.liveDomainProtocol}://${fields.liveDomain}`
  }
  if (key === 'environment' && fields.environment.length === 0) {
    return 'main'
  }
  return fields[key]
}

/**
 * Copied from SiteBindDialog.tsx rather than imported: that dialog is deleted in step 5 of the
 * redesign, and this row owns the disclosure that replaces its always-visible field table.
 */
function BindSummary({ fields }: { fields: SiteBindFields }): React.JSX.Element {
  const labels = getSiteBindFieldLabels()
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
      {SUMMARY_FIELDS.map((key) => {
        const fieldValue = summaryValue(fields, key)
        if (fieldValue.length === 0) {
          return null
        }
        return (
          <div key={key} className="col-span-2 grid grid-cols-subgrid">
            <dt className="text-xs text-muted-foreground">{labels[key]}</dt>
            <dd className="min-w-0 truncate font-mono text-xs">{fieldValue}</dd>
          </div>
        )
      })}
    </dl>
  )
}

export function SiteSetupLinkTargetRows({
  pending,
  primaryRoot,
  cloneUrl,
  value,
  onChange
}: SiteSetupLinkTargetRowsProps): React.JSX.Element {
  const strings = getSiteBindStrings()
  const groupName = useId()
  const candidates = pending.candidates.filter((candidate) => candidate.exists)
  const staleCount = pending.candidates.length - candidates.length
  const cloneTarget = `${primaryRoot}/${repoSlug(pending.fields.reponame)}`
  const canCloneIntoRoot = cloneUrl.length > 0 && primaryRoot.length > 0
  const hasKnownTarget = candidates.length > 0 || canCloneIntoRoot

  const folderSummary = hasKnownTarget ? strings.chooseFolder : strings.noCandidates

  const visibleFields = SUMMARY_FIELDS.filter((key) => summaryValue(pending.fields, key).length > 0)
  const credentialParts = [
    pending.fields.username.length > 0 && pending.fields.hostname.length > 0
      ? `${pending.fields.username}@${pending.fields.hostname}`
      : '',
    pending.fields.rootPath,
    pending.fields.environment || 'main'
  ].filter((part) => part.length > 0)

  const pickAnotherFolder = async (): Promise<void> => {
    const path = await window.api.repos.pickDirectory()
    if (!path) {
      return
    }
    onChange({ kind: 'existing', path })
  }

  return (
    <>
      <SiteSetupRow icon={<FolderOpen className="size-4" />} title="Folder" summary={folderSummary}>
        <div className="space-y-1.5">
          {candidates.map((candidate) => (
            <div key={candidate.path} className="flex items-start gap-2">
              <input
                type="radio"
                id={`${groupName}-${candidate.path}`}
                name={groupName}
                className="mt-1 size-3.5 shrink-0"
                checked={value?.kind === 'existing' && value.path === candidate.path}
                onChange={() => onChange({ kind: 'existing', path: candidate.path })}
              />
              <Label
                htmlFor={`${groupName}-${candidate.path}`}
                className="min-w-0 flex-1 flex-col items-start gap-0 font-normal"
              >
                <span className="block truncate">
                  {candidate.displayName}{' '}
                  <span className="text-muted-foreground">(existing checkout)</span>
                </span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">
                  {candidate.path}
                </span>
                {candidate.siteId ? (
                  <span className="text-xs text-muted-foreground">{strings.updatesExisting}</span>
                ) : null}
              </Label>
            </div>
          ))}

          {canCloneIntoRoot ? (
            <div className="flex items-start gap-2">
              <input
                type="radio"
                id={`${groupName}-clone`}
                name={groupName}
                className="mt-1 size-3.5 shrink-0"
                checked={value?.kind === 'clone'}
                onChange={() => onChange({ kind: 'clone', root: primaryRoot })}
              />
              <Label htmlFor={`${groupName}-clone`} className="min-w-0 flex-1 font-normal">
                Clone {pending.fields.reponame} into{' '}
                <span className="font-mono text-xs">{cloneTarget}</span>
              </Label>
            </div>
          ) : null}

          <div className="flex items-start gap-2">
            <input
              type="radio"
              id={`${groupName}-other`}
              name={groupName}
              className="mt-1 size-3.5 shrink-0"
              checked={value?.kind === 'existing' && !candidates.some((c) => c.path === value.path)}
              onChange={() => void pickAnotherFolder()}
            />
            <Label htmlFor={`${groupName}-other`} className="min-w-0 flex-1 font-normal">
              Choose another folder…
            </Label>
          </div>

          {staleCount > 0 ? (
            <p className="text-xs text-muted-foreground">
              {(staleCount === 1 ? strings.staleRecords : strings.staleRecordsPlural).replace(
                '{{count}}',
                String(staleCount)
              )}
            </p>
          ) : null}
        </div>
      </SiteSetupRow>

      <SiteSetupRow
        icon={<KeyRound className="size-4" />}
        title="Credentials"
        summary={credentialParts.join(' · ')}
      >
        <div className="space-y-2">
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            {pending.passwordProvided ? (
              <PasswordIcon className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <ShieldOff className="mt-0.5 size-3.5 shrink-0" />
            )}
            {pending.passwordProvided ? strings.passwordNotice : strings.noPasswordNotice}
          </p>
          <Collapsible>
            <CollapsibleTrigger className="text-xs text-muted-foreground underline-offset-2 hover:underline">
              All fields from the link ({visibleFields.length})
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <BindSummary fields={pending.fields} />
            </CollapsibleContent>
          </Collapsible>
        </div>
      </SiteSetupRow>
    </>
  )
}

export default SiteSetupLinkTargetRows
