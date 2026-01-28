#!/bin/sh
set -e

# Fix permissions for data directory
# This ensures the mounted volume is writable by the nextjs user
if [ -d "/app/data" ]; then
    chown -R nextjs:nodejs /app/data
fi

# Execute the command passed to docker run (default: node server.js) as nextjs user
exec su-exec nextjs "$@"
