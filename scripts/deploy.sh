#!/usr/bin/env bash
# EXEMPLO — assume o layout de deploy/: repo na máquina, unit systemd chamada
# daily-web e sudo sem senha para systemctl. Ajuste ao seu ambiente.
set -euo pipefail

cd "$(dirname "$0")/.."
git pull --ff-only
npm ci
npm run build
sudo systemctl restart daily-web
sudo systemctl status daily-web --no-pager
