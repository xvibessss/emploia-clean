#!/usr/bin/env bash
# Acceptance du fil d'Ariane : assertions dediees, puis les garde-fous CI du repo.
set -euo pipefail
cd "$(dirname "$0")"

echo "== 1. Assertions fil d'Ariane =="
node scripts/seo/verify-breadcrumbs.mjs

echo
echo "== 2. Garde-fous CI existants du repo =="
node scripts/ci-guards.mjs

echo
echo "ACCEPTANCE OK"
