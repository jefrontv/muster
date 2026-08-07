// Square (1:1) thumbnail for a local image attachment, in the composer and in
// sent message bubbles. Local paths can't render in the sandboxed webview
// directly, so the bytes round-trip through main as a data URL (cached — the
// same pasted screenshot appears in the chip, the echo, and the transcript).

import { Image as ImageIcon } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { setBoundedScopeCacheEntry } from './native-chat-composer-scope-cache'

const dataUrlCache = new Map<string, string | null>()

export function useNativeChatImageDataUrl(path: string | undefined): string | null {
  const cached = path !== undefined ? dataUrlCache.get(path) : undefined
  const [dataUrl, setDataUrl] = useState<string | null>(cached ?? null)
  useEffect(() => {
    if (path === undefined || dataUrlCache.has(path)) {
      setDataUrl(path !== undefined ? (dataUrlCache.get(path) ?? null) : null)
      return
    }
    let alive = true
    void window.api.nativeChat
      .readImageDataUrl(path)
      .then((url) => {
        setBoundedScopeCacheEntry(dataUrlCache, path, url)
        if (alive) {
          setDataUrl(url)
        }
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [path])
  return dataUrl
}

export function NativeChatImageThumb({
  path,
  alt,
  className
}: {
  path: string | undefined
  alt: string
  /** Sizing/rounding from the call site; the 1:1 crop is fixed here. */
  className?: string
}): React.JSX.Element {
  const dataUrl = useNativeChatImageDataUrl(path)
  if (!dataUrl) {
    return (
      <div
        className={cn(
          'flex items-center justify-center border border-border bg-muted/40 text-muted-foreground',
          className
        )}
        title={alt}
      >
        <ImageIcon className="size-4" />
      </div>
    )
  }
  return (
    <img
      src={dataUrl}
      alt={alt}
      title={alt}
      className={cn('border border-border object-cover', className)}
    />
  )
}
