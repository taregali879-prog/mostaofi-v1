#!/usr/bin/env bash
set -euo pipefail
npm install --package-lock-only
npm ci
npm run test:local
