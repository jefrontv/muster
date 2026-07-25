// The two .htaccess steps, ported from ocsites deploy/backup.py::_handle_wp_upload_rewrite,
// ::_handle_htaccess_cleanup and ::_strip_external_redirects.
//
// Why both are needed: the import pulls the production .htaccess down verbatim. A real one carries
// WP Rocket rules, force-SSL and non-www rules that hardcode the live domain, so the freshly
// imported local site 301s straight back to production and looks broken. The cleanup strips every
// off-site redirect; the generated block is the one that deliberately points at the live domain,
// proxying uploads we chose not to download, so it is fenced by delimiters and always survives.
//
// Both steps are best-effort, as in ocsites: a write failure is logged, not fatal. Cancellation is
// still fatal.

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { SiteRunCancelledError, type SiteRunConfig, type SiteRunContext } from './pipeline-contract'

export const UPLOAD_REWRITE_BEGIN = '# BEGIN WP Upload Rewrite - Auto Generated'
export const UPLOAD_REWRITE_END = '# END WP Upload Rewrite - Auto Generated'

/** Must stay in step with the two delimiters above; asserted by the tests. */
const EXISTING_UPLOAD_BLOCK =
  /# BEGIN WP Upload Rewrite - Auto Generated[\s\S]*?# END WP Upload Rewrite - Auto Generated/

// A RewriteRule whose target is an absolute http(s):// URL — i.e. an off-site redirect.
const EXTERNAL_REDIRECT_RULE = /^\s*RewriteRule\s+\S+\s+https?:\/\/(?<host>[^/\s]+)/i

const CPANEL_HANDLER_BLOCK =
  /# php -- BEGIN cPanel-generated handler, do not edit[\s\S]*?# php -- END cPanel-generated handler, do not edit\s*/g

const TRAILING_REWRITE_COND = /^\s*rewritecond/i

function htaccessPath(config: SiteRunConfig): string {
  return path.join(config.wpDir, '.htaccess')
}

async function readHtaccess(config: SiteRunConfig): Promise<string | null> {
  try {
    return await readFile(htaccessPath(config), 'utf8')
  } catch {
    return null
  }
}

/**
 * The delimited block that proxies a missing local upload to the live domain. Only requests for
 * files absent locally are redirected, so anything actually present is still served locally.
 */
export function buildUploadRewriteBlock(
  localDomain: string,
  liveDomain: string,
  liveDomainProtocol: string
): string {
  const escapedLocalDomain = localDomain.replaceAll('.', String.raw`\.`)
  return [
    UPLOAD_REWRITE_BEGIN,
    '<IfModule mod_rewrite.c>',
    '\tRewriteEngine On',
    `\tRewriteCond %{HTTP_HOST} ^${escapedLocalDomain}$`,
    '\tRewriteCond %{REQUEST_URI} ^/wp-content/uploads/[^\\/]*/.*$',
    '\tRewriteCond %{REQUEST_FILENAME} !-f',
    '\tRewriteCond %{REQUEST_FILENAME} !-d',
    `\tRewriteRule ^(.*)$ ${liveDomainProtocol}://${liveDomain}/$1 [QSA,L]`,
    '</IfModule>',
    UPLOAD_REWRITE_END
  ].join('\n')
}

export async function applyWpUploadRewrite(
  context: SiteRunContext,
  config: SiteRunConfig
): Promise<void> {
  const localDomain = config.site.localDomain
  const { liveDomain, liveDomainProtocol } = config.environment
  if (!localDomain || !liveDomain) {
    context.status('Skipping WP Upload Rewrite: Local or Live domain not specified')
    return
  }

  context.status('Adding WP Upload Rewrite Rule to .htaccess…')
  const block = buildUploadRewriteBlock(localDomain, liveDomain, liveDomainProtocol)
  try {
    let content = (await readHtaccess(config)) ?? ''
    if (content.includes(UPLOAD_REWRITE_BEGIN) && content.includes(UPLOAD_REWRITE_END)) {
      // Replace rather than append, so re-importing does not stack up blocks.
      content = content.replace(EXISTING_UPLOAD_BLOCK, '').replaceAll(/\n\s*\n/g, '\n\n')
    }
    await writeFile(htaccessPath(config), `${block}\n\n${content}`, 'utf8')
    context.log('WP Upload Rewrite Rule added successfully')
  } catch (error) {
    if (error instanceof SiteRunCancelledError) {
      throw error
    }
    const detail = error instanceof Error ? error.message : String(error)
    context.log(`⚠ Error adding WP Upload Rewrite Rule: ${detail}`)
  }
}

export async function cleanUpLocalHtaccess(
  context: SiteRunContext,
  config: SiteRunConfig
): Promise<void> {
  context.status('Cleaning up .htaccess file…')
  const original = await readHtaccess(config)
  if (original === null) {
    context.log('No .htaccess file found, skipping cleanup')
    return
  }
  try {
    const withoutCpanel = original.replaceAll(CPANEL_HANDLER_BLOCK, '')
    const stripped = stripExternalRedirects(withoutCpanel, config.site.localDomain)
    if (stripped.removed > 0) {
      context.log(`Removed ${stripped.removed} production redirect rule(s) from .htaccess`)
    }
    await writeFile(
      htaccessPath(config),
      stripped.content.replaceAll(/\n\s*\n\s*\n/g, '\n\n'),
      'utf8'
    )
    context.log('.htaccess cleanup completed successfully')
  } catch (error) {
    if (error instanceof SiteRunCancelledError) {
      throw error
    }
    const detail = error instanceof Error ? error.message : String(error)
    context.log(`⚠ Error cleaning up .htaccess: ${detail}`)
  }
}

export type StrippedHtaccess = {
  content: string
  removed: number
}

/**
 * Removes RewriteRules that redirect off-site to a non-local host.
 *
 * A removed rule takes its immediately-preceding contiguous RewriteCond lines with it — they only
 * qualify that one rule. Lines inside the upload-rewrite block are never touched. The local domain
 * is matched case-insensitively and with or without a leading `www.`, so a rule pointing back at
 * the local site itself is kept. An unset local domain keeps nothing: every off-site rule goes.
 */
export function stripExternalRedirects(content: string, localDomain: string): StrippedHtaccess {
  const local = localDomain.trim().toLowerCase()
  const kept: string[] = []
  let inUploadBlock = false
  let removed = 0

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === UPLOAD_REWRITE_BEGIN || trimmed === UPLOAD_REWRITE_END) {
      inUploadBlock = trimmed === UPLOAD_REWRITE_BEGIN
      kept.push(line)
      continue
    }
    if (inUploadBlock) {
      kept.push(line)
      continue
    }
    const host = EXTERNAL_REDIRECT_RULE.exec(line)?.groups?.host?.toLowerCase()
    const pointsAtLocalSite = local !== '' && (host === local || host === `www.${local}`)
    if (host !== undefined && !pointsAtLocalSite) {
      while (TRAILING_REWRITE_COND.test(kept.at(-1) ?? '')) {
        kept.pop()
      }
      removed += 1
      continue
    }
    kept.push(line)
  }

  if (removed === 0) {
    return { content, removed: 0 }
  }
  // Collapse the runs of blank lines the removals left behind.
  let next = kept.join('\n').replaceAll(/\n\s*\n\s*\n+/g, '\n\n')
  if (content.endsWith('\n') && !next.endsWith('\n')) {
    next += '\n'
  }
  return { content: next, removed }
}
