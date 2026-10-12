#!/bin/bash
# Acceptance de la slice A (pipeline bones "jsonld-metiers").
# Le gate du stage 5 ne s'ouvre que si ce script sort 0.
set -uo pipefail
cd "$(dirname "$0")"

echo "== 1. Assertions JSON-LD =="
node scripts/seo/verify-jsonld.mjs || exit 1

echo
echo "== 2. Garde-fous CI existants du repo =="
if [ -f scripts/ci-guards.mjs ]; then
  node scripts/ci-guards.mjs || exit 1
else
  echo "  scripts/ci-guards.mjs absent — ignore"
fi

echo
echo "ACCEPTANCE OK"
