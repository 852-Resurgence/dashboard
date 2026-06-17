#!/bin/sh
set -e

# Bind mounts keep host ownership. The app runs as `panel` (uid 1000), so a
# root-owned gsa-key.json with mode 600 is unreadable inside the container.
for dir in /app/data /app/logs; do
  chown -R panel:panel "$dir" 2>/dev/null || true
done

if [ -f /app/secrets/gsa-key.json ]; then
  chown panel:panel /app/secrets/gsa-key.json
  chmod 600 /app/secrets/gsa-key.json
fi

exec su-exec panel "$@"
