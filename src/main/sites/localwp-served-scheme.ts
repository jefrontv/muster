// How a LocalWP site is served, for the URLs an import writes into it.

import { getLocalWpCertStatus } from './localwp-cert-trust'
import type { SiteRunConfig } from './pipeline-contract'

const isLocalWpCertTrusted = async (domain: string): Promise<boolean> => {
  const cert = await getLocalWpCertStatus(domain).catch(() => null)
  return cert?.exists === true && cert.trusted
}

/** https once Local's cert is trusted; undefined for stacks here that have no cert to ask about. */
export async function localWpServedScheme(
  config: SiteRunConfig,
  isCertTrusted: (domain: string) => Promise<boolean> = isLocalWpCertTrusted
): Promise<'http' | 'https' | undefined> {
  if (config.site.localStack !== 'localwp') {
    return undefined
  }
  return (await isCertTrusted(config.site.localDomain)) ? 'https' : 'http'
}
