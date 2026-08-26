#!/usr/bin/env bash
# Publishes what the runner just built and tested.
#
# Runs from the runner's workspace, which by this point already has
# node_modules installed and .next built — so publishing copies rather than
# rebuilding: what reaches production is exactly the artifact the tests
# approved, not a second, similar compilation.
set -euo pipefail

TARGET="${DAILY_WEB_DEPLOY_DIR:-/srv/daily-web}"
SERVICE="${DAILY_WEB_SERVICE:-daily-web}"

if [[ ! -d "$TARGET" ]]; then
  echo "deployment directory does not exist: $TARGET" >&2
  exit 1
fi

echo "publishing to $TARGET"

# --delete so the target does not accumulate files that left the repository.
# data/ is excluded: it holds the production database, which is not from git.
rsync -a --delete \
  --exclude '.git/' \
  --exclude 'data/' \
  ./ "$TARGET/"

echo "restarting $SERVICE"
sudo systemctl restart "$SERVICE"
