// "New site" starting from a remote rather than a folder — the flow ocsites had.
//
// Providers are always listed, including unconfigured ones, so the answer to "why isn't GitHub
// here?" is on screen with the fix next to it instead of the host silently missing.
//
// The clone reuses the app's own repos.clone (it streams progress and registers the Repo), so this
// dialog never shells git itself. Cloning and creating the Site record are two steps: a clone that
// succeeds followed by a create that fails still leaves the user with the code on disk, which the
// Sites page then offers as a discovered folder.

import { Loader2, Lock } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
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
import { cn } from '@/lib/utils'
import { getSiteCloneSourceStrings } from './site-clone-source-strings'

type AddSiteFromGitDialogProps = {
  open: boolean
  /** Watched roots; the first is offered as the clone destination so the site lands where the rest live. */
  roots: readonly string[]
  onOpenChange: (open: boolean) => void
  onAdded: (siteId: string) => void
}

function matchesQuery(repo: CloneSourceRepo, query: string): boolean {
  if (query.length === 0) {
    return true
  }
  const needle = query.toLowerCase()
  return (
    repo.fullName.toLowerCase().includes(needle) || repo.description.toLowerCase().includes(needle)
  )
}

export function AddSiteFromGitDialog({
  open,
  roots,
  onOpenChange,
  onAdded
}: AddSiteFromGitDialogProps): React.JSX.Element {
  const strings = getSiteCloneSourceStrings()
  const [providers, setProviders] = useState<CloneSourceProvider[]>([])
  const [active, setActive] = useState<CloneSourceProviderId | null>(null)
  const [repos, setRepos] = useState<CloneSourceRepo[]>([])
  const [listError, setListError] = useState('')
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [busyRepo, setBusyRepo] = useState('')

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
      setActive((current) => current ?? defaultCloneSourceProvider(result.value))
    })()
    return () => {
      disposed = true
    }
  }, [open])

  useEffect(() => {
    if (!open || !active) {
      return
    }
    let disposed = false
    setLoading(true)
    setListError('')
    void (async () => {
      const result = await window.api.siteCloneSources?.repos({ provider: active })
      if (disposed) {
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
    })()
    return () => {
      disposed = true
    }
  }, [open, active])

  const addRepo = useCallback(
    async (repo: CloneSourceRepo): Promise<void> => {
      // Seed the picker at the folder the user's other sites live in; an empty object lets the OS
      // choose when no root is known yet.
      const destination = await window.api.shell.pickDirectory(
        roots[0] ? { defaultPath: roots[0] } : {}
      )
      if (!destination) {
        return
      }
      setBusyRepo(repo.fullName)
      try {
        const cloned = await window.api.repos.clone({ url: repo.cloneUrl, destination })
        const created = await window.api.sites.create({
          path: cloned.path,
          displayName: repo.fullName.split('/').pop() ?? repo.fullName
        })
        if (!created.ok) {
          toast.error(strings.failedToast, { description: created.error })
          return
        }
        toast.success(strings.clonedToast, { description: created.value.site.path })
        onAdded(created.value.site.id)
        onOpenChange(false)
      } catch (error) {
        toast.error(strings.failedToast, {
          description: error instanceof Error ? error.message : String(error)
        })
      } finally {
        setBusyRepo('')
      }
    },
    [roots, strings, onAdded, onOpenChange]
  )

  const activeProvider = providers.find((provider) => provider.id === active) ?? null
  const visible = repos.filter((repo) => matchesQuery(repo, query))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{strings.title}</DialogTitle>
          <DialogDescription>{strings.description}</DialogDescription>
        </DialogHeader>

        {providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{strings.noProviders}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-1.5">
              {providers.map((provider) => (
                <Button
                  key={provider.id}
                  size="sm"
                  variant={provider.id === active ? 'secondary' : 'ghost'}
                  onClick={() => setActive(provider.id)}
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
                  <p className="text-[11px] text-muted-foreground/70">{strings.truncated}</p>
                ) : null}
                {listError.length > 0 ? (
                  <p className="text-sm text-destructive">{listError}</p>
                ) : null}
                <div className="scrollbar-sleek max-h-[40vh] space-y-0.5 overflow-y-auto">
                  {loading ? (
                    <p className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      {strings.loading}
                    </p>
                  ) : null}
                  {!loading && visible.length === 0 && listError.length === 0 ? (
                    <p className="px-1 py-2 text-sm text-muted-foreground">{strings.empty}</p>
                  ) : null}
                  {visible.map((repo) => (
                    <button
                      key={`${repo.provider}:${repo.fullName}`}
                      type="button"
                      disabled={busyRepo.length > 0}
                      onClick={() => void addRepo(repo)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                        busyRepo === repo.fullName ? 'bg-accent' : 'hover:bg-accent'
                      )}
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
                      {busyRepo === repo.fullName ? (
                        <Loader2 className="size-3.5 shrink-0 animate-spin" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {strings.cancel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default AddSiteFromGitDialog
