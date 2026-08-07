import { useState } from 'react'
import { toast } from 'sonner'
import { Github, Globe, Image, Link2, Loader2 } from 'lucide-react'
import type { RepoIcon } from '../../../../shared/repo-icon'
import { faviconUrlFromWebsite } from '../../../../shared/repo-icon'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { getRepoLucideIconOptions } from '../repo/repo-icon'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'

const EMOJI_OPTIONS = ['🚀', '✨', '💻', '🧠', '📦', '🔧', '🎨', '🌐', '📊', '🔒', '⚡', '✅']

type RepositoryIconTabsProps = {
  initialTab: 'avatar' | 'icon' | 'emoji' | 'favicon'
  /** Chat workspaces have no GitHub identity; hides the Avatar tab. */
  hideAvatarTab?: boolean
  selectedLucideName: string | null
  selectedEmoji: string
  loadingGitHub: boolean
  /** Live domain of the Site matching this project; empty when no Site matches. */
  defaultFaviconDomain: string
  onSetIcon: (repoIcon: RepoIcon | null) => void
  onUseGitHubAvatar: () => void
  /** Fires as the user switches tabs — lets callers show tab-specific chrome
   *  (e.g. the color swatches only apply to lucide icons). */
  onTabChange?: (tab: 'avatar' | 'icon' | 'emoji' | 'favicon') => void
}

export function RepositoryIconTabs({
  initialTab,
  hideAvatarTab,
  selectedLucideName,
  selectedEmoji,
  loadingGitHub,
  defaultFaviconDomain,
  onSetIcon,
  onUseGitHubAvatar,
  onTabChange
}: RepositoryIconTabsProps): React.JSX.Element {
  const [website, setWebsite] = useState('')
  // Null means untouched, so the Site's live domain prefills until the user types.
  const [faviconDomainOverride, setFaviconDomainOverride] = useState<string | null>(null)
  const faviconDomain = faviconDomainOverride ?? defaultFaviconDomain
  const [faviconLoading, setFaviconLoading] = useState(false)
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null)
  const [faviconError, setFaviconError] = useState<string | null>(null)
  const mountedRef = useMountedRef()

  const handleUploadImage = async () => {
    try {
      const result = await window.api.shell.pickRepoIconImage()
      if (!result || !mountedRef.current) {
        return
      }
      onSetIcon({
        type: 'image',
        src: result.dataUrl,
        source: 'upload',
        label: result.fileName
      })
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.settings.RepositoryIconPicker.868c5c9b56',
              'Failed to import repo icon'
            )
      )
    }
  }

  const handleUseWebsiteFavicon = () => {
    const src = faviconUrlFromWebsite(website)
    if (!src) {
      toast.error(
        translate(
          'auto.components.settings.RepositoryIconPicker.acf31559a0',
          'Enter a valid website URL.'
        )
      )
      return
    }
    onSetIcon({
      type: 'image',
      src,
      source: 'favicon',
      label: translate(
        'auto.components.settings.RepositoryIconPicker.4d039317f4',
        'Website favicon'
      )
    })
  }

  const handleFetchFavicon = async () => {
    setFaviconLoading(true)
    setFaviconError(null)
    setFaviconPreview(null)
    try {
      const result = await window.api.repos.fetchFavicon({ domain: faviconDomain })
      if (!mountedRef.current) {
        return
      }
      if (result.ok) {
        setFaviconPreview(result.dataUrl)
      } else {
        setFaviconError(result.error)
      }
    } catch (error) {
      if (mountedRef.current) {
        setFaviconError(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.RepositoryIconPicker.favicon_fetch_failed',
                'Failed to fetch favicon'
              )
        )
      }
    } finally {
      if (mountedRef.current) {
        setFaviconLoading(false)
      }
    }
  }

  return (
    <Tabs
      defaultValue={hideAvatarTab && initialTab === 'avatar' ? 'icon' : initialTab}
      className="gap-3"
      onValueChange={(value) => onTabChange?.(value as 'avatar' | 'icon' | 'emoji' | 'favicon')}
    >
      <TabsList variant="line" className="h-8">
        {hideAvatarTab ? null : (
          <TabsTrigger value="avatar" className="h-7 text-xs">
            {translate('auto.components.settings.RepositoryIconPicker.2d8bd302fa', 'Avatar')}
          </TabsTrigger>
        )}
        <TabsTrigger value="icon" className="h-7 text-xs">
          {translate('auto.components.settings.RepositoryIconPicker.b2d7fd2116', 'Icon')}
        </TabsTrigger>
        <TabsTrigger value="emoji" className="h-7 text-xs">
          {translate('auto.components.settings.RepositoryIconPicker.c490787d24', 'Emoji')}
        </TabsTrigger>
        <TabsTrigger value="favicon" className="h-7 text-xs">
          {translate('auto.components.settings.RepositoryIconPicker.cc1286e263', 'Favicon')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="avatar" className="space-y-3">
        <Button
          type="button"
          variant="default"
          className="w-full gap-2"
          disabled={loadingGitHub}
          onClick={() => void onUseGitHubAvatar()}
        >
          <Github className="size-3.5" />
          {translate(
            'auto.components.settings.RepositoryIconPicker.39da8a10bf',
            'Use GitHub Avatar'
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.RepositoryIconPicker.7da623abcc',
            "Used by default — GitHub always provides one, even when the owner hasn't set a custom image."
          )}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => void handleUploadImage()}
        >
          <Image className="size-3.5" />
          {translate('auto.components.settings.RepositoryIconPicker.381b4844fd', 'Upload PNG')}
        </Button>
        <div className="flex gap-2">
          <Input
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder={translate(
              'auto.components.settings.RepositoryIconPicker.03ca1a4e9b',
              'example.com'
            )}
            className="h-9 text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={handleUseWebsiteFavicon}
          >
            <Link2 className="size-3.5" />
            {translate('auto.components.settings.RepositoryIconPicker.cc1286e263', 'Favicon')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.RepositoryIconPicker.fde066a63b',
            'PNG uploads must be 256KB or smaller.'
          )}
        </p>
      </TabsContent>

      <TabsContent value="icon" className="space-y-3">
        <div className="grid grid-cols-10 gap-1.5">
          {getRepoLucideIconOptions().map((option) => (
            <Tooltip key={option.name}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={selectedLucideName === option.name ? 'secondary' : 'ghost'}
                  size="icon-xs"
                  className="size-8"
                  onClick={() => onSetIcon({ type: 'lucide', name: option.name })}
                  aria-label={translate(
                    'auto.components.settings.RepositoryIconPicker.2b7d27b93c',
                    'Use {{value0}} repo icon',
                    { value0: option.label }
                  )}
                >
                  <option.icon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {option.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="emoji" className="grid grid-cols-12 gap-1.5">
        {EMOJI_OPTIONS.map((emoji) => (
          <Button
            key={emoji}
            type="button"
            variant={selectedEmoji === emoji ? 'secondary' : 'ghost'}
            size="icon-xs"
            className="size-8 text-base"
            onClick={() => onSetIcon({ type: 'emoji', emoji })}
            aria-label={translate(
              'auto.components.settings.RepositoryIconPicker.2b7d27b93c',
              'Use {{value0}} repo icon',
              { value0: emoji }
            )}
          >
            {emoji}
          </Button>
        ))}
      </TabsContent>

      <TabsContent value="favicon" className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={faviconDomain}
            onChange={(event) => setFaviconDomainOverride(event.target.value)}
            placeholder={translate(
              'auto.components.settings.RepositoryIconPicker.03ca1a4e9b',
              'example.com'
            )}
            aria-label={translate(
              'auto.components.settings.RepositoryIconPicker.favicon_domain',
              'Website domain'
            )}
            className="h-9 text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            disabled={faviconLoading || !faviconDomain.trim()}
            onClick={() => void handleFetchFavicon()}
          >
            {faviconLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Globe className="size-3.5" />
            )}
            {translate('auto.components.settings.RepositoryIconPicker.favicon_fetch', 'Fetch')}
          </Button>
        </div>
        {faviconError ? <p className="text-xs text-destructive">{faviconError}</p> : null}
        {faviconPreview ? (
          <div className="flex items-center gap-3">
            <img
              src={faviconPreview}
              alt=""
              draggable={false}
              className="size-10 shrink-0 rounded-md border border-border/70 bg-muted/30 object-contain p-1"
            />
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() =>
                onSetIcon({
                  type: 'image',
                  src: faviconPreview,
                  source: 'favicon',
                  label: faviconDomain.trim()
                })
              }
            >
              {translate('auto.components.settings.RepositoryIconPicker.favicon_apply', 'Apply')}
            </Button>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.RepositoryIconPicker.favicon_hint',
            "Fetches the site's favicon and stores it as this project's icon."
          )}
        </p>
      </TabsContent>
    </Tabs>
  )
}
