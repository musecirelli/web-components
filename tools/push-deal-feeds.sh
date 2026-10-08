#!/bin/bash
# Push regenerated deal-watch feeds to musecirelli/web-components (GH Pages).
# Idempotent: commits and pushes only when a feed actually changed.
# Safe to call from the deal-watch cron workers after export-deal-feed.py.
set -e
REPO="$HOME/workspace/web-components"

# git/ssh runs as root while HOME is /home/hatch; /root/.ssh is ephemeral
# across VM replacements, so re-mirror the GitHub key when it's missing.
if [ ! -f /root/.ssh/github_musecirelli ] && [ -f "$HOME/.ssh/github_musecirelli" ]; then
  cp "$HOME/.ssh/config" "$HOME/.ssh/github_musecirelli" \
     "$HOME/.ssh/github_musecirelli.pub" "$HOME/.ssh/known_hosts" /root/.ssh/ 2>/dev/null || true
  chmod 600 /root/.ssh/config /root/.ssh/github_musecirelli /root/.ssh/known_hosts 2>/dev/null || true
fi

cd "$REPO"
git fetch origin main --quiet
# Keep the local clone current so the exporter/tools are fresh.
git rebase origin/main --quiet 2>/dev/null || git rebase --abort 2>/dev/null || true
git add components/deal-watch-table/feeds/
if git diff --cached --quiet; then
  echo "no feed changes to push"
  exit 0
fi
git commit -m "Deal-watch feed update $(date -u +%Y-%m-%dT%H:%MZ)" --quiet
git push origin main --quiet && echo "feeds pushed"
