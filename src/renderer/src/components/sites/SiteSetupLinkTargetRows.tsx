// Replaces the Clone row on Review for a link source. A link names a repository but not a folder,
// so the user picks one of: an existing checkout on disk, a fresh clone into the projects root, a
// clone into a folder they choose, or an existing checkout they point at. The second row keeps the link's SSH details visible but the
// full field table collapsed: the one real question on this screen is the folder.
//
// The options are a selectable list in the row's own style (check mark, name first, path muted
// beneath), not native radios - those read as a form dropped into a summary.

import { Check, ChevronDown, FolderOpen, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { abbreviateHome, describeFolder } from '../../../../shared/folder-display'
import type { PendingSiteBind, SiteBindFields } from '../../../../shared/site-bind-types'
import { repoSlug } from '../../../../shared/site-local-domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getSiteBindFieldLabels, getSiteBindStrings } from './site-bind-strings'
import { joinDisplayPath } from './site-display-path'
import type { LinkCloneProblem } from './use-site-setup-review-data'
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
  /** Why `cloneUrl` is empty; null while it resolves or when it resolved. */
  cloneProblem?: LinkCloneProblem | null
  onOpenIntegrations?: () => void
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

function BindSummary({ fields }: { fields: SiteBindFields }): React.JSX.Element {
  const labels = getSiteBindFieldLabels()
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-md bg-muted/40 px-3 py-2">
      {SUMMARY_FIELDS.map((key) => {
        const fieldValue = summaryValue(fields, key)
        if (fieldValue.length === 0) {
          return null
        }
        return (
          <div key={key} className="col-span-2 grid grid-cols-subgrid items-baseline">
            <dt className="text-xs text-muted-foreground">{labels[key]}</dt>
            <dd className="min-w-0 truncate font-mono text-xs">{fieldValue}</dd>
          </div>
        )
      })}
    </dl>
  )
}

/** One selectable folder option: check column, name, muted detail line. */
function TargetOption({
  selected,
  onSelect,
  icon,
  name,
  detail,
  badge,
  note
}: {
  selected: boolean
  onSelect: () => void
  icon?: React.ReactNode
  name: React.ReactNode
  detail?: string
  badge?: string
  note?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-2.5 px-2.5 py-2 text-left hover:bg-accent/60',
        selected && 'bg-accent/40'
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center pt-0.5">
        {icon ?? <Check className={cn('size-3.5', !selected && 'opacity-0')} aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm">{name}</span>
          {badge ? (
            <Badge variant="secondary" className="shrink-0">
              {badge}
            </Badge>
          ) : null}
        </span>
        {detail ? (
          <span className="block truncate font-mono text-[11px] text-muted-foreground">
            {detail}
          </span>
        ) : null}
        {note ? <span className="block text-xs text-muted-foreground">{note}</span> : null}
      </span>
    </button>
  )
}

export function SiteSetupLinkTargetRows({
  pending,
  primaryRoot,
  cloneUrl,
  value,
  onChange,
  cloneProblem = null,
  onOpenIntegrations
}: SiteSetupLinkTargetRowsProps): React.JSX.Element {
  const strings = getSiteBindStrings()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [folderOpen, setFolderOpen] = useState(false)
  // Nothing picked yet: the list is the question, so it stays open.
  const folderListOpen = folderOpen || value === null
  const choose = (target: SiteSetupLinkTarget): void => {
    onChange(target)
    setFolderOpen(false)
  }
  const passwordText = pending.passwordProvided ? strings.passwordNotice : strings.noPasswordNotice
  const candidates = pending.candidates.filter((candidate) => candidate.exists)
  const staleCount = pending.candidates.length - candidates.length
  const cloneTarget = joinDisplayPath(primaryRoot, repoSlug(pending.fields.reponame))
  // Separators unified so a Windows checkout (C:\Sites\flex) matches the joined clone target.
  const normalise = (folder: string): string =>
    folder.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  // A clone into a folder that is already a checkout would fail on a non-empty directory - and the
  // checkout itself is already on offer above, so the option would only duplicate it.
  const cloneTargetTaken = candidates.some(
    (candidate) => normalise(candidate.path) === normalise(cloneTarget)
  )
  const canCloneIntoRoot = cloneUrl.length > 0 && primaryRoot.length > 0 && !cloneTargetTaken
  const hasKnownTarget = candidates.length > 0 || canCloneIntoRoot
  const customSelected =
    value?.kind === 'existing' && !candidates.some((candidate) => candidate.path === value.path)
  const customCloneSelected = value?.kind === 'clone' && value.root !== primaryRoot

  const credentialParts = [
    pending.fields.username.length > 0 && pending.fields.hostname.length > 0
      ? `${pending.fields.username}@${pending.fields.hostname}`
      : '',
    pending.fields.rootPath,
    pending.fields.environment || 'main'
  ].filter((part) => part.length > 0)

  const pickAnotherFolder = async (): Promise<void> => {
    const path = await window.api.repos.pickDirectory()
    if (path) {
      choose({ kind: 'existing', path })
    }
  }

  // A parent folder: the clone lands in <folder>/<repo>, the same shape as the projects root.
  const pickCloneFolder = async (): Promise<void> => {
    const path = await window.api.repos.pickDirectory()
    if (path) {
      choose({ kind: 'clone', root: path })
    }
  }

  const cloneProblemText =
    cloneProblem?.kind === 'no-connector'
      ? strings.cloneNoConnector
      : cloneProblem?.kind === 'lookup-failed'
        ? strings.cloneLookupFailed.replace('{{error}}', cloneProblem.error)
        : cloneProblem?.kind === 'not-found'
          ? strings.cloneNotFound
          : null

  return (
    <>
      <SiteSetupRow
        icon={<FolderOpen className="size-4" />}
        title={strings.folderTitle}
        summary={
          value === null
            ? hasKnownTarget
              ? strings.chooseFolder
              : strings.noCandidates
            : value.kind === 'clone'
              ? strings.folderCloneSummary.replace(
                  '{{path}}',
                  abbreviateHome(joinDisplayPath(value.root, repoSlug(pending.fields.reponame)))
                )
              : `${
                  candidates.find((candidate) => candidate.path === value.path)?.displayName ??
                  describeFolder(value.path).name
                } · ${abbreviateHome(value.path)}`
        }
        control={
          value === null ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={strings.changeFolder}
              aria-expanded={folderListOpen}
              aria-controls="site-setup-folder-options"
              data-state={folderListOpen ? 'open' : 'closed'}
              onClick={() => setFolderOpen((open) => !open)}
            >
              <ChevronDown className={cn('transition-transform', folderListOpen && 'rotate-180')} />
            </Button>
          )
        }
      >
        {folderListOpen ? (
          <div
            id="site-setup-folder-options"
            role="radiogroup"
            aria-label={strings.folderTitle}
            className="divide-y divide-border overflow-hidden rounded-xl border border-border"
          >
            {candidates.map((candidate) => (
              <TargetOption
                key={candidate.path}
                selected={value?.kind === 'existing' && value.path === candidate.path}
                onSelect={() => choose({ kind: 'existing', path: candidate.path })}
                name={candidate.displayName}
                badge={strings.existingCheckout}
                detail={abbreviateHome(candidate.path)}
                note={candidate.siteId ? strings.updatesExisting : undefined}
              />
            ))}
            {canCloneIntoRoot ? (
              <TargetOption
                selected={value?.kind === 'clone' && value.root === primaryRoot}
                onSelect={() => choose({ kind: 'clone', root: primaryRoot })}
                name={strings.cloneOption.replace('{{repo}}', pending.fields.reponame)}
                detail={`→ ${abbreviateHome(cloneTarget)}`}
              />
            ) : null}
            {cloneUrl.length > 0 ? (
              <TargetOption
                selected={customCloneSelected}
                onSelect={() => void pickCloneFolder()}
                icon={
                  customCloneSelected ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : (
                    <FolderOpen className="size-3.5 text-muted-foreground" aria-hidden />
                  )
                }
                name={strings.cloneIntoFolder}
                detail={
                  customCloneSelected && value?.kind === 'clone'
                    ? `→ ${abbreviateHome(joinDisplayPath(value.root, repoSlug(pending.fields.reponame)))}`
                    : undefined
                }
              />
            ) : null}
            <TargetOption
              selected={customSelected}
              onSelect={() => void pickAnotherFolder()}
              icon={
                customSelected ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <FolderOpen className="size-3.5 text-muted-foreground" aria-hidden />
                )
              }
              name={
                customSelected && value?.kind === 'existing'
                  ? describeFolder(value.path).name
                  : strings.chooseAnother
              }
              detail={
                customSelected && value?.kind === 'existing'
                  ? abbreviateHome(value.path)
                  : undefined
              }
            />
          </div>
        ) : null}
        {cloneProblemText ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-xs break-words text-muted-foreground">
              {cloneProblemText}
            </p>
            {cloneProblem?.kind === 'no-connector' && onOpenIntegrations ? (
              <Button variant="outline" size="xs" onClick={onOpenIntegrations}>
                {strings.openIntegrations}
              </Button>
            ) : null}
          </div>
        ) : null}
        {staleCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            {(staleCount === 1 ? strings.staleRecords : strings.staleRecordsPlural).replace(
              '{{count}}',
              String(staleCount)
            )}
          </p>
        ) : null}
      </SiteSetupRow>

      <SiteSetupRow
        icon={<KeyRound className="size-4" />}
        title={strings.credentialsTitle}
        summary={credentialParts.join(' · ')}
        control={
          <>
            <span
              className="flex size-7 items-center justify-center text-muted-foreground"
              title={passwordText}
              aria-label={passwordText}
              role="img"
            >
              {pending.passwordProvided ? (
                <ShieldCheck className="size-3.5" />
              ) : (
                <ShieldOff className="size-3.5" />
              )}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={strings.credentialsDetails}
              aria-expanded={detailsOpen}
              aria-controls="site-setup-credentials-details"
              data-state={detailsOpen ? 'open' : 'closed'}
              onClick={() => setDetailsOpen((open) => !open)}
            >
              <ChevronDown className={cn('transition-transform', detailsOpen && 'rotate-180')} />
            </Button>
          </>
        }
      >
        {detailsOpen ? (
          <div id="site-setup-credentials-details" className="space-y-2">
            <p className="text-xs text-muted-foreground">{passwordText}</p>
            <BindSummary fields={pending.fields} />
          </div>
        ) : null}
      </SiteSetupRow>
    </>
  )
}

export default SiteSetupLinkTargetRows
