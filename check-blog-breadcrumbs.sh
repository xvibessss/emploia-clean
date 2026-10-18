#!/usr/bin/env bash
# Acceptance du fil d'Ariane blog, puis les garde-fous CI du depot.
set -euo pipefail
cd "$(dirname "$0")"
echo "== 1. Assertions fil d'Ariane blog =="
node scripts/seo/verify-blog-breadcrumbs.mjs
echo
echo "== 2. Garde-fous CI existants du repo =="
node scripts/ci-guards.mjs
echo
echo "ACCEPTANCE OK"
