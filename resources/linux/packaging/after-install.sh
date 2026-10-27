#!/bin/bash
# Why: register the bundled `muster` CLI on PATH at package-install time.
# The in-app "Install CLI" action (CliInstaller) can never run on a headless
# server, so without this symlink `muster serve` is unreachable from the shell on
# the exact hosts that need it most. deb/rpm both run this after unpacking.
#
# The shim resolves the real app by walking up from its own location, so a
# symlink works. We discover the install dir instead of hardcoding /opt/Muster
# because electron-builder's directory name can vary by productName sanitization.
set -e

link="/usr/bin/muster"

for dir in /opt/Muster /opt/muster; do
  sandbox="$dir/chrome-sandbox"
  if [ -f "$sandbox" ]; then
    # Why: packaged Linux installs must leave Chromium's sandbox helper usable
    # on hosts where unprivileged user namespaces are unavailable.
    chmod 4755 "$sandbox" || true
  fi

  shim="$dir/resources/bin/muster"
  if [ -x "$shim" ]; then
    # Only manage our own symlink; never clobber an unrelated /usr/bin/muster.
    if [ ! -e "$link" ] || [ -L "$link" ]; then
      ln -sf "$shim" "$link"
    fi
    break
  fi
done

# Why: pre-rename packages linked /usr/bin/orca-ide; drop it only when it points into our install.
legacy="/usr/bin/orca-ide"
if [ -L "$legacy" ]; then
  case "$(readlink "$legacy" || true)" in
    /opt/Muster/*|/opt/muster/*|/opt/Orca/*|/opt/orca-ide/*) rm -f "$legacy" ;;
  esac
fi

exit 0
