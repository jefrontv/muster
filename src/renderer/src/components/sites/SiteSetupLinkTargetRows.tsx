// Replaces the Clone row on Review for a link source. A link names a repository but not a folder,
// so the user picks one of: an existing checkout on disk, a fresh clone into the projects root, or
// a folder they choose themselves. The second row keeps the link's SSH details visible but the
// full field table collapsed: the one real question on this screen is the folder.
//
// The options are a selectable list in the row's own style (check mark, name first, path muted
// beneath), not native radios - those read as a form dropped into a summary.

import { Check, ChevronRight, FolderOpen, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react'
import type React from 'react'
import { abbreviateHome, describeFolder } from '../../../../shared/folder-display'
import type { PendingSiteBind, SiteBindFields } from '../../../../shared/site-bind-types'
import { repoSlug } from '../../../../shared/site-local-domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
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
            <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px] font-normal">
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
  onChange
}: SiteSetupLinkTargetRowsProps): React.JSX.Element {
  const strings = getSiteBindStrings()
  const candidates = pending.candidates.filter((candidate) => candidate.exists)
  const staleCount = pending.candidates.length - candidates.length
  const cloneTarget = `${primaryRoot}/${repoSlug(pending.fields.reponame)}`
  const normalise = (folder: string): string => folder.replace(/[\\/]+$/, '').toLowerCase()
  // A clone into a folder that is already a checkout would fail on a non-empty directory - and the
  // checkout itself is already on offer above, so the option would only duplicate it.
  const cloneTargetTaken = candidates.some(
    (candidate) => normalise(candidate.path) === normalise(cloneTarget)
  )
  const canCloneIntoRoot = cloneUrl.length > 0 && primaryRoot.length > 0 && !cloneTargetTaken
  const hasKnownTarget = candidates.length > 0 || canCloneIntoRoot
  const customSelected =
    value?.kind === 'existing' && !candidates.some((candidate) => candidate.path === value.path)

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
    if (path) {
      onChange({ kind: 'existing', path })
    }
  }

  return (
    <>
      <SiteSetupRow
        icon={<FolderOpen className="size-4" />}
        title={strings.folderTitle}
        summary={hasKnownTarget ? strings.chooseFolder : strings.noCandidates}
      >
        <div
          role="radiogroup"
          aria-label={strings.folderTitle}
          className="divide-y divide-border overflow-hidden rounded-md border border-border"
        >
          {candidates.map((candidate) => (
            <TargetOption
              key={candidate.path}
              selected={value?.kind === 'existing' && value.path === candidate.path}
              onSelect={() => onChange({ kind: 'existing', path: candidate.path })}
              name={candidate.displayName}
              badge={strings.existingCheckout}
              detail={abbreviateHome(candidate.path)}
              note={candidate.siteId ? strings.updatesExisting : undefined}
            />
          ))}
          {canCloneIntoRoot ? (
            <TargetOption
              selected={value?.kind === 'clone'}
              onSelect={() => onChange({ kind: 'clone', root: primaryRoot })}
              name={strings.cloneOption.replace('{{repo}}', pending.fields.reponame)}
              detail={`→ ${abbreviateHome(cloneTarget)}`}
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
              customSelected && value?.kind === 'existing' ? abbreviateHome(value.path) : undefined
            }
          />
        </div>
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
      >
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {pending.passwordProvided ? (
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <ShieldOff className="size-3.5 shrink-0" aria-hidden />
          )}
          {pending.passwordProvided ? strings.passwordNotice : strings.noPasswordNotice}
        </p>
        <Collapsible className="group/fields">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              className="-ml-1.5 h-6 gap-1 px-1.5 text-xs text-muted-foreground"
            >
              <ChevronRight className="size-3 transition-transform group-data-[state=open]/fields:rotate-90" />
              {strings.allFields.replace('{{count}}', String(visibleFields.length))}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-1.5">
            <BindSummary fields={pending.fields} />
          </CollapsibleContent>
        </Collapsible>
      </SiteSetupRow>
    </>
  )
}

export default SiteSetupLinkTargetRows
