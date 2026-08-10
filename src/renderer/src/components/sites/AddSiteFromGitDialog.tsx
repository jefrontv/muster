// "New site" starting from a remote rather than a folder — the flow ocsites had.
//
// Four explicit steps rather than one click that spins:
//   pick     choose a provider and a repository
//   confirm  say exactly where it will land and what happens next, then commit
//   cloning  live phase + percent from git, cancellable
//   setup    LocalWP, its HTTPS certificate, and the first import
//
// The confirm step exists because cloning writes to disk and can take minutes; a row that silently
// turns into a spinner gives the user nothing to check and no way out. The setup step exists
// because a cloned WordPress checkout is not yet a usable local site — ocsites always followed a
// clone with the LocalWP + certificate + import questions, and dropping the user at a bare folder
// was the biggest gap in this flow.
//
// Providers are always listed, including unconfigured ones, so "why isn't GitHub here?" is answered
// on screen with the fix beside it.

import { ArrowLeft, Loader2, Lock } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CloneSourceProvider,
  CloneSourceProviderId,
  CloneSourceRepo
} from '../../../../shared/site-clone-source-types'
import { defaultCloneSourceProvider } from '../../../../shared/site-clone-source-types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getSiteCloneSourceStrings } from './site-clone-source-strings'
import { SiteSetupContinuation } from './SiteSetupContinuation'

type AddSiteFromGitDialogProps = {
  open: boolean
  /** The configured sites directory. Clones land here; empty means the user has no root yet. */
  destinationRoot: string
  onOpenChange: (open: boolean) => void
  onAdded: (siteId: string) => void
}

type Step = 'pick' | 'confirm' | 'cloning' | 'setup'

type CloneProgress = { phase: string; percent: number }

/** How long typing settles before the provider is asked again — one request per word, not per key. */
const SEARCH_DEBOUNCE_MS = 275

/**
 * The fallback filter for a host that cannot search itself (GitHub). Never applied to a provider
 * that did search: it only knows about name and description, so it would hide a genuine host match
 * on any other field.
 */
function matchesQuery(repo: CloneSourceRepo, query: string): boolean {
  if (query.length === 0) {
    return true
  }
  const needle = query.toLowerCase()
  return (
    repo.fullName.toLowerCase().includes(needle) || repo.description.toLowerCase().includes(needle)
  )
}

/** The folder git will create: the segment after the last slash of `owner/name`. */
function repoSlug(repo: CloneSourceRepo): string {
  return repo.fullName.slice(repo.fullName.lastIndexOf('/') + 1)
}

export function AddSiteFromGitDialog({
  open,
  destinationRoot,
  onOpenChange,
  onAdded
}: AddSiteFromGitDialogProps): React.JSX.Element {
  const strings = getSiteCloneSourceStrings()
  const [step, setStep] = useState<Step>('pick')
  const [providers, setProviders] = useState<CloneSourceProvider[]>([])
  const [active, setActive] = useState<CloneSourceProviderId | null>(null)
  const [repos, setRepos] = useState<CloneSourceRepo[]>([])
  const [listError, setListError] = useState('')
  const [truncated, setTruncated] = useState(false)
  const [searchesRemotely, setSearchesRemotely] = useState(false)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  /** Only the newest request may write the list; see the repo-listing effect. */
  const requestIdRef = useRef(0)
  const [selected, setSelected] = useState<CloneSourceRepo | null>(null)
  const [progress, setProgress] = useState<CloneProgress | null>(null)
  const [cloneError, setCloneError] = useState('')
  const [createdSiteId, setCreatedSiteId] = useState('')

  // Why reset on close rather than on open: leaving a finished clone's state behind would flash the
  // previous run's log the next time the dialog opens.
  useEffect(() => {
    if (open) {
      return
    }
    setStep('pick')
    setSelected(null)
    setProgress(null)
    setCloneError('')
    setCreatedSiteId('')
    setQuery('')
    setDebouncedQuery('')
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    let disposed = false
    void (async () => {
      const result = await window.api.siteCloneSources?.providers()
      if (disposed || !result?.ok) {
        return
      }
      setProviders(result.value)
      // Falling back to the first provider when none is configured: the row's own reason is the
      // only thing that explains an empty picker, and it renders per selected provider.
      const fallback = defaultCloneSourceProvider(result.value) ?? result.value[0]?.id ?? null
      setActive((current) => current ?? fallback)
    })()
    return () => {
      disposed = true
    }
  }, [open])

  useEffect(() => {
    const term = query.trim()
    // Clearing the box must not wait out a timer: an empty query is the browse list, which is the
    // state the user expects back instantly.
    if (term.length === 0) {
      setDebouncedQuery('')
      return
    }
    const timer = setTimeout(() => setDebouncedQuery(term), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  // What the provider is actually asked for. A host that cannot search is asked once, for the
  // browse list, and the typed term is applied locally instead of costing a request it ignores.
  const remoteQuery = searchesRemotely ? debouncedQuery : ''

  useEffect(() => {
    if (!open || !active) {
      return
    }
    // The newest request always wins. Bumped before the call and re-checked after it, so a slow
    // response for an earlier query cannot land on top of the one the user is now looking at.
    requestIdRef.current += 1
    const requestId = requestIdRef.current
    setLoading(true)
    setListError('')
    void (async () => {
      const result = await window.api.siteCloneSources?.repos({
        provider: active,
        query: remoteQuery
      })
      if (requestId !== requestIdRef.current) {
        return
      }
      setLoading(false)
      if (!result?.ok) {
        setListError(result?.error ?? '')
        setRepos([])
        return
      }
      setRepos(result.value.repos)
      setListError(result.value.error)
      setTruncated(result.value.truncated)
      setSearchesRemotely(result.value.searchesRemotely)
    })()
    return () => {
      // Retires whatever is in flight: the provider or the query just changed under it.
      requestIdRef.current += 1
    }
  }, [open, active, remoteQuery])

  // Subscribed for the whole dialog rather than only while cloning: git emits its first phase
  // before the invoke promise settles, and a listener attached inside the clone call would miss it.
  useEffect(() => {
    if (!open) {
      return
    }
    return window.api.repos.onCloneProgress((data) => setProgress(data))
  }, [open])

  const startClone = useCallback(
    async (repo: CloneSourceRepo): Promise<void> => {
      const destination =
        destinationRoot.length > 0 ? destinationRoot : await window.api.shell.pickDirectory({})
      if (!destination) {
        return
      }
      setStep('cloning')
      setProgress(null)
      setCloneError('')
      try {
        const cloned = await window.api.repos.clone({ url: repo.cloneUrl, destination })
        const created = await window.api.sites.create({
          path: cloned.path,
          displayName: repoSlug(repo)
        })
        if (!created.ok) {
          setCloneError(created.error)
          return
        }
        setCreatedSiteId(created.value.site.id)
        onAdded(created.value.site.id)
        setStep('setup')
      } catch (error) {
        setCloneError(error instanceof Error ? error.message : String(error))
      }
    },
    [destinationRoot, onAdded]
  )

  const activeProvider = providers.find((provider) => provider.id === active) ?? null
  const typedQuery = query.trim()
  // A host that searched has already answered the query; filtering its answer again could only hide
  // a match it made on a field this component does not look at.
  const visible = searchesRemotely ? repos : repos.filter((repo) => matchesQuery(repo, typedQuery))
  // What the visible rows actually answer to: the term the host was asked, or the live one when the
  // filtering happens here.
  const appliedQuery = searchesRemotely ? debouncedQuery : typedQuery
  // Keystrokes still inside the debounce window count as busy, so the list is never presented as a
  // finished answer to a term that has not been sent yet.
  const busy = loading || (searchesRemotely && typedQuery !== debouncedQuery)
  const destinationPath =
    selected && destinationRoot.length > 0 ? `${destinationRoot}/${repoSlug(selected)}` : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {step === 'confirm'
              ? strings.confirmTitle
              : step === 'cloning'
                ? `${strings.cloningTitle} ${selected?.fullName ?? ''}`
                : step === 'setup'
                  ? strings.setupTitle
                  : strings.title}
          </DialogTitle>
          {step === 'pick' ? (
            <DialogDescription>
              {destinationRoot.length > 0 ? (
                <>
                  {strings.destinationPrefix}{' '}
                  <span className="font-mono text-foreground/80">{destinationRoot}</span>
                </>
              ) : (
                strings.description
              )}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {step === 'pick' && providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{strings.noProviders}</p>
        ) : null}

        {step === 'pick' && providers.length > 0 ? (
          <div className="space-y-3">
            <div className="flex gap-1.5">
              {providers.map((provider) => (
                <Button
                  key={provider.id}
                  size="sm"
                  variant={provider.id === active ? 'secondary' : 'ghost'}
                  onClick={() => {
                    setActive(provider.id)
                    // Cleared in the same update as the switch: a term typed for one host is not a
                    // query for another, and carrying it over would spend a request proving it.
                    setQuery('')
                    setDebouncedQuery('')
                  }}
                >
                  {provider.label}
                </Button>
              ))}
            </div>

            {activeProvider && !activeProvider.configured ? (
              <p className="rounded-md bg-muted px-3 py-2 text-xs">{activeProvider.reason}</p>
            ) : (
              <>
                <Input
                  value={query}
                  placeholder={strings.search}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {truncated ? (
                  <p className="text-[11px] text-muted-foreground/70">
                    {searchesRemotely ? strings.truncated : strings.truncatedLocal}
                  </p>
                ) : null}
                {listError.length > 0 ? (
                  <p className="text-sm text-destructive">{listError}</p>
                ) : null}
                <div className="scrollbar-sleek max-h-[40vh] space-y-0.5 overflow-y-auto">
                  {busy ? (
                    <p className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      {typedQuery.length > 0 ? strings.searching : strings.loading}
                    </p>
                  ) : null}
                  {!busy && visible.length === 0 && listError.length === 0 ? (
                    <p className="px-1 py-2 text-sm text-muted-foreground">
                      {appliedQuery.length > 0 ? strings.noMatch(appliedQuery) : strings.empty}
                    </p>
                  ) : null}
                  {visible.map((repo) => (
                    <button
                      key={`${repo.provider}:${repo.fullName}`}
                      type="button"
                      onClick={() => {
                        setSelected(repo)
                        setStep('confirm')
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                    >
                      {repo.isPrivate ? (
                        <Lock className="size-3 shrink-0 text-muted-foreground" />
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{repo.fullName}</span>
                        {repo.description.length > 0 ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {repo.description}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}

        {step === 'confirm' && selected ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border px-3 py-2.5">
              <p className="text-sm font-medium">{selected.fullName}</p>
              {selected.description.length > 0 ? (
                <p className="text-xs text-muted-foreground">{selected.description}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{strings.confirmInto}</p>
              <p className="break-all font-mono text-xs">
                {destinationPath.length > 0 ? destinationPath : strings.chooseFolder}
              </p>
            </div>
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {strings.confirmNext}
            </p>
          </div>
        ) : null}

        {step === 'cloning' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              {cloneError.length === 0 ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
              ) : null}
              <span className="truncate">
                {cloneError.length > 0
                  ? cloneError
                  : progress
                    ? `${progress.phase} ${progress.percent}%`
                    : strings.cloneStarting}
              </span>
            </div>
            {cloneError.length === 0 ? (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                {/* Width, not a spinner: git reports real percentages and a large repo can sit in
                    "Receiving objects" for minutes. */}
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${Math.min(100, Math.max(0, progress?.percent ?? 0))}%` }}
                />
              </div>
            ) : null}
            <p className="break-all font-mono text-[11px] text-muted-foreground/70">
              {destinationPath}
            </p>
          </div>
        ) : null}

        {/* Owns its own Back/Next/Done, so this branch renders no DialogFooter of its own. */}
        {step === 'setup' && createdSiteId.length > 0 ? (
          <SiteSetupContinuation
            siteId={createdSiteId}
            reponame={selected?.fullName ?? ''}
            branch={null}
            onDone={() => onOpenChange(false)}
          />
        ) : null}

        {/* Omitted on the setup step so an empty footer does not add a gap under its own nav. */}
        <DialogFooter className={step === 'setup' ? 'hidden' : undefined}>
          {step === 'confirm' ? (
            <>
              <Button variant="ghost" onClick={() => setStep('pick')}>
                <ArrowLeft className="size-3.5" />
                {strings.back}
              </Button>
              <Button onClick={() => void startClone(selected as CloneSourceRepo)}>
                {strings.confirmAction}
              </Button>
            </>
          ) : null}
          {step === 'cloning' ? (
            <Button
              variant="ghost"
              onClick={() => {
                if (cloneError.length > 0) {
                  setStep('confirm')
                  return
                }
                void window.api.repos.cloneAbort()
                setStep('confirm')
              }}
            >
              {cloneError.length > 0 ? strings.back : strings.cancel}
            </Button>
          ) : null}
          {step === 'pick' ? (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {strings.cancel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default AddSiteFromGitDialog
