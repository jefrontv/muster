#!/usr/bin/env bash
# Imports a self-signed code-signing certificate into a throwaway CI keychain AND marks it trusted,
# then prints its common name on stdout for CSC_NAME.
#
# Why the trust step is not optional: electron-builder selects an identity with
# `security find-identity -v`, which lists only identities macOS considers valid. A self-signed root
# imported from a .p12 carries no trust settings, so it is reported as CSSMERR_TP_NOT_TRUSTED and
# electron-builder silently falls back to "skipped macOS application code signing" — producing an
# unsigned release that Squirrel.Mac then refuses to install over a signed one.
#
# Everything except the common name goes to stderr so `$(…)` captures only the name.
#
# Inputs: MAC_CERTS (base64 .p12), MAC_CERTS_PASSWORD (may be empty).

set -euo pipefail

exec 3>&1
log() { echo "[mac-signing] $*" >&2; }

if [[ -z "${MAC_CERTS:-}" ]]; then
  log 'MAC_CERTS is empty; nothing to import.'
  exit 1
fi

KEYCHAIN="${RUNNER_TEMP:-/tmp}/muster-signing.keychain-db"
KEYCHAIN_PASSWORD="$(uuidgen)"
CERT_P12="${RUNNER_TEMP:-/tmp}/muster-signing.p12"
CERT_PEM="${RUNNER_TEMP:-/tmp}/muster-signing.pem"

cleanup() {
  rm -f "$CERT_P12" "$CERT_PEM" "${CERT_B64:-}"
}
trap cleanup EXIT

# Why via a file: macOS ships BSD base64 (which wants -D on older releases) while runners may have
# GNU coreutils; decoding from a file lets the fallback retry without a consumed pipe.
CERT_B64="${RUNNER_TEMP:-/tmp}/muster-signing.b64"
printf '%s' "$MAC_CERTS" > "$CERT_B64"
base64 --decode -i "$CERT_B64" -o "$CERT_P12" 2>/dev/null ||
  base64 --decode < "$CERT_B64" > "$CERT_P12" 2>/dev/null ||
  base64 -D < "$CERT_B64" > "$CERT_P12"

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >&2
# Why no lock timeout: a locked keychain mid-build makes codesign fail with a user-interaction error.
security set-keychain-settings -lut 21600 "$KEYCHAIN" >&2
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >&2

# -A plus the partition list is what lets codesign use the key without an interactive prompt.
security import "$CERT_P12" -k "$KEYCHAIN" -P "${MAC_CERTS_PASSWORD:-}" \
  -T /usr/bin/codesign -T /usr/bin/security -A >&2
security set-key-partition-list -S 'apple-tool:,apple:,codesign:' \
  -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >/dev/null 2>&1

# Search list must include the new keychain, and it must be the default so electron-builder's
# identity lookup sees it.
security list-keychains -d user -s "$KEYCHAIN" login.keychain-db >&2
security default-keychain -s "$KEYCHAIN" >&2

# Trust the certificate as a root, which is what clears CSSMERR_TP_NOT_TRUSTED. `-d` writes to the
# admin domain and needs sudo; GitHub's macOS runners allow passwordless sudo.
openssl pkcs12 -in "$CERT_P12" -clcerts -nokeys -legacy \
  -passin pass:"${MAC_CERTS_PASSWORD:-}" -out "$CERT_PEM" 2>/dev/null ||
  openssl pkcs12 -in "$CERT_P12" -clcerts -nokeys \
    -passin pass:"${MAC_CERTS_PASSWORD:-}" -out "$CERT_PEM"
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain "$CERT_PEM" >&2

COMMON_NAME="$(openssl x509 -in "$CERT_PEM" -noout -subject -nameopt multiline |
  awk -F' = ' '/commonName/ { print $2; exit }')"
if [[ -z "$COMMON_NAME" ]]; then
  log 'Could not read the certificate common name.'
  exit 1
fi

log "imported '$COMMON_NAME'; identities now visible to electron-builder:"
security find-identity -v -p codesigning >&2

# Fail loudly rather than let electron-builder fall back to an unsigned build.
if ! security find-identity -v -p codesigning | grep -qF "$COMMON_NAME"; then
  log "'$COMMON_NAME' is still not a valid codesigning identity; refusing to build an unsigned release."
  exit 1
fi

printf '%s' "$COMMON_NAME" >&3
