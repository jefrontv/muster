#!/bin/bash
# Why: remove the PATH symlink that after-install.sh created, but only if it
# still points into a Muster install dir — never delete an unrelated
# /usr/bin/muster a user or other package may own.
set -e

for link in /usr/bin/muster /usr/bin/orca-ide; do
  if [ -L "$link" ]; then
    target="$(readlink "$link" || true)"
    case "$target" in
      /opt/Muster/*|/opt/muster/*)
        rm -f "$link"
        ;;
    esac
  fi
done

exit 0
