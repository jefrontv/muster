# LocalWP HTTPS via a Muster signing certificate

## Goal

Trust LocalWP sites through one Muster signing certificate that is trusted once in the System keychain, instead of trusting each site's self-signed certificate in the login keychain. LocalWP's site page should stop showing its Trust button for sites Muster set up.

This is a demo build on dev. Every failure is shown word for word in the HTTPS step's log, so the real macOS errors are visible.

## What testing on macOS 26 established

- Local's own certificates are self-signed per site (64 on this Mac, none share a signer), so today's trust is per site.
- Local's Trust button checks one thing: whether that site's exact certificate is in `/Library/Keychains/System.keychain` (`security find-certificate -a -Z`, SHA-256 match). Trust settings are ignored.
- `add-trusted-cert -d -k System.keychain` run as root through osascript adds the certificate, then fails with `SecTrustSettingsSetTrustSettings: The authorization was denied since no user interaction was possible.`
- Splitting it works: `security add-certificates -k /Library/Keychains/System.keychain` as root through osascript, then `security add-trusted-cert -d -r trustRoot <crt>` as the user (no `-k`). macOS shows its own dialog for the second command, and trust applies about 2 seconds later.
- A site certificate signed by a trusted test signing certificate verifies as trusted.

## Flow

### First LocalWP site (no Muster signing certificate yet)

1. Create the signing certificate with `/usr/bin/openssl` (LibreSSL 3.3.6). Store it in `<userData>/localwp-signing-cert/` with the key at mode 0600. Name it "Muster Local Sites" (dev builds add "(dev)", since dev uses its own userData).
2. Sign a certificate for the site: SAN `domain` and `*.domain`, EKU serverAuth, 825 days (Apple's limit for TLS server certificates).
3. Back up Local's `<domain>.crt` and `<domain>.key` to `<domain>.crt.local-original` and `<domain>.key.local-original`, then write Muster's pair in their place. Local skips generating a certificate when the `.key` already exists.
4. One admin dialog: `add-certificates` for the signing certificate and the site certificate into the System keychain.
5. One macOS dialog: `add-trusted-cert -d -r trustRoot` on the signing certificate, as the user. Poll until `verify-cert` passes (15s, as today).
6. Restart the site in Local so its router loads the new files. Then open a TLS connection to `domain:443` and check that the certificate served has the fingerprint Muster wrote.

### Every site after that

Steps 2, 3, 4 (site certificate only) and 6. That's one admin dialog per site, needed only so Local's Trust button goes away.

### When something fails

- Each failing command's stderr goes into the HTTPS log as is.
- Any failure restores Local's original pair from the backup and runs today's login-keychain trust, so setup still finishes with a working site.
- If Local keeps serving its old certificate after the restart, the step fails with "LocalWP is still serving its own certificate for <domain>" and the fallback above runs.

## Code

- New `src/main/sites/localwp-signing-cert.ts`: create and load the signing certificate, sign site certificates, check System-keychain presence. Uses the `LocalWpCertDeps` command seam so tests never call `security` or `openssl`.
- New `src/main/sites/localwp-signing-cert-install.ts`: the backup and swap of Local's pair, the admin and user keychain calls, the restart, and the served-certificate check.
- `localwp-cert-ensure.ts`: try the signing-certificate path first, then fall back to `trustLocalWpCert`.
- `getLocalWpCertStatus`: also reports `inSystemKeychain`, so the HTTPS step can say whether Local's button will still show.
- Tests for each module, covering signing, the swap and restore, the fallback, and the served-fingerprint mismatch.

## Decisions for you

1. Limit the signing certificate to local domains with X.509 name constraints. The proposal is `.local`, `.test` and `.localhost`. A Muster signing certificate can then never sign for a real domain, even if its key leaks. The cost is that a LocalWP site on any other suffix falls back to today's flow.
2. Sites already trusted the old way stay as they are until their HTTPS step runs again.
3. Removing the signing certificate (a settings action) is out of scope for this demo.

## Not touched

The agent-local and DDEV stacks, and the two committed but unreleased fixes (cert trust confirmation, MySQL login wait).
