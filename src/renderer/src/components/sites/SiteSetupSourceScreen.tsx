// Screen 1 — Source (plan doc "Screen 1 — Source (repo)"). Only reachable for "New site": the
// link and existing-site entry points skip straight to Review because their source is already
// decided. This renders everything below the dialog header (which the shell owns) down through
// the Cancel button: provider tabs, the repo list lifted from AddSiteFromGitDialog's old "pick"
// step, and the destination field that used to surprise the user with a native picker only after
// they had already committed to a repo (friction 9 in the plan).

import { AlertTriangle, Check, FolderOpen, Loader2, Lock } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  CloneSourceProvider,
  CloneSourceProviderId,
  CloneSourceRepo
} from '../../../../shared/site-clone-source-types'
import { defaultCloneSourceProvider } from '../../../../shared/site-clone-source-types'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { getSiteCloneSourceStrings } from './site-clone-source-strings'
import { getSiteSetupSourceStrings } from './site-setup-source-strings'

type SiteSetupSourceScreenProps = {
  /** The configured sites directory. Empty means the user has not chosen one yet. */
  destinationRoot: string
  /** The parent persists this for the session — see SiteSetupSourceScreen.test for the contract. */
  onDestinationChange: (path: string) => void
  onPick: (repo: CloneSourceRepo) => void
  onCancel: () => void
}

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

const GH_AUTH_LOGIN_COMMAND = 'gh auth login'

export function SiteSetupSourceScreen({
  destinationRoot,
  onDestinationChange,
  onPick,
  onCancel
}: SiteSetupSourceScreenProps): React.JSX.Element {
  const strings = getSiteCloneSourceStrings()
  const sourceStrings = getSiteSetupSourceStrings()
  const setSettingsSearchQuery = useAppStore((state) => state.setSettingsSearchQuery)
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)

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
  /** Set on a row click while there is no destination yet, and cleared as soon as one is chosen. */
  const [folderError, setFolderError] = useState(false)
  const destinationButtonRef = useRef<HTMLButtonElement | null>(null)
  const [destinationOpen, setDestinationOpen] = useState(false)
  /** The user's configured project folders, offered before the native picker. */
  const [roots, setRoots] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await window.api.siteRoots?.list()
      if (!cancelled && result?.ok) {
        setRoots(result.value)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
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
  }, [])

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
    if (!active) {
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
  }, [active, remoteQuery])

  const chooseDestination = useCallback(
    (path: string) => {
      setFolderError(false)
      setDestinationOpen(false)
      onDestinationChange(path)
    },
    [onDestinationChange]
  )

  const pickCustomDestination = useCallback(async () => {
    const path = await window.api.shell.pickDirectory({ defaultPath: destinationRoot || undefined })
    if (path) {
      chooseDestination(path)
    }
  }, [destinationRoot, chooseDestination])

  const handleRowClick = useCallback(
    (repo: CloneSourceRepo) => {
      if (destinationRoot.length === 0) {
        setFolderError(true)
        setDestinationOpen(true)
        return
      }
      onPick(repo)
    },
    [destinationRoot, onPick]
  )

  const openIntegrations = useCallback(() => {
    setSettingsSearchQuery('')
    openSettingsTarget({ pane: 'integrations', repoId: null })
    openSettingsPage()
    onCancel()
  }, [onCancel, openSettingsPage, openSettingsTarget, setSettingsSearchQuery])

  const copyGhAuthCommand = useCallback(() => {
    void window.api.ui.writeClipboardText(GH_AUTH_LOGIN_COMMAND)
    toast.success(sourceStrings.copyCommandCopiedToast)
  }, [sourceStrings.copyCommandCopiedToast])

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

  return (
    <div className="space-y-3">
      {providers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{strings.noProviders}</p>
      ) : (
        <div className="flex items-start justify-between gap-3">
          {/* A joined group, not loose buttons: the two are one choice, and the group reads as tabs. */}
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={active ?? undefined}
            aria-label={sourceStrings.providerGroupLabel}
            onValueChange={(next) => {
              if (!next) {
                return
              }
              setActive(next as CloneSourceProviderId)
              // Cleared in the same update as the switch: a term typed for one host is not a
              // query for another, and carrying it over would spend a request proving it.
              setQuery('')
              setDebouncedQuery('')
            }}
          >
            {providers.map((provider) => (
              <ToggleGroupItem key={provider.id} value={provider.id} className="text-xs">
                {provider.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <Popover open={destinationOpen} onOpenChange={setDestinationOpen}>
            <PopoverTrigger asChild>
              <Button
                ref={destinationButtonRef}
                type="button"
                size="sm"
                variant="outline"
                aria-invalid={folderError}
                aria-label={sourceStrings.destinationEditLabel}
                className={cn(
                  'max-w-72 shrink-0 gap-1.5 font-normal',
                  folderError && 'animate-pulse ring-1 ring-destructive'
                )}
              >
                <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {sourceStrings.destinationLabel}
                </span>
                {destinationRoot.length > 0 ? (
                  <span className="truncate font-mono text-xs">{destinationRoot}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {sourceStrings.destinationPlaceholder}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-1">
              <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {sourceStrings.destinationRootsHeading}
              </p>
              {roots.length === 0 ? (
                <p className="px-2 pb-1.5 text-xs text-muted-foreground">
                  {sourceStrings.destinationNoRoots}
                </p>
              ) : (
                <ul className="max-h-56 overflow-y-auto scrollbar-sleek">
                  {roots.map((rootPath) => {
                    const selected = rootPath === destinationRoot
                    return (
                      <li key={rootPath}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => chooseDestination(rootPath)}
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent"
                        >
                          <Check
                            className={cn('size-3.5 shrink-0', !selected && 'opacity-0')}
                            aria-hidden
                          />
                          <span className="truncate font-mono text-xs">{rootPath}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              <div className="mt-1 border-t border-border pt-1">
                <button
                  type="button"
                  onClick={() => void pickCustomDestination()}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                >
                  <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  {sourceStrings.destinationCustom}
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {folderError ? (
        <p className="text-xs text-destructive">{sourceStrings.chooseFolderFirst}</p>
      ) : null}

      {activeProvider && !activeProvider.configured ? (
        <div className="space-y-2 rounded-md bg-muted px-3 py-2.5">
          <p className="flex items-start gap-2 text-xs">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {activeProvider.reason}
          </p>
          {activeProvider.id === 'bitbucket' ? (
            <Button size="sm" onClick={openIntegrations}>
              {sourceStrings.openIntegrationsSettings}
            </Button>
          ) : null}
          {activeProvider.id === 'github' ? (
            <Button size="sm" variant="ghost" onClick={copyGhAuthCommand}>
              {sourceStrings.copyCommand}
            </Button>
          ) : null}
        </div>
      ) : activeProvider ? (
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
          {listError.length > 0 ? <p className="text-sm text-destructive">{listError}</p> : null}
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
                onClick={() => handleRowClick(repo)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
              >
                {repo.isPrivate ? <Lock className="size-3 shrink-0 text-muted-foreground" /> : null}
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
      ) : null}

      <div className="flex justify-end">
        <Button variant="ghost" onClick={onCancel}>
          {sourceStrings.cancel}
        </Button>
      </div>
    </div>
  )
}

export default SiteSetupSourceScreen
