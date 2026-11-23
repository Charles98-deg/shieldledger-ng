#!/usr/bin/env bash
# Writes reproducible evidence: reports/test_summary.txt and reports/build_size.txt.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="${PY:-$ROOT/.venv/bin/python}"
mkdir -p "$ROOT/reports"
stamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }

{
  echo "# make evidence: backend test summary"
  echo "date: $(stamp)"
  echo "command: cd backend && python -m pytest"
  echo
  (cd "$ROOT/backend" && "$PY" -m pytest -o addopts="" -q -p no:cacheprovider 2>&1) | tail -n 5
} | tee "$ROOT/reports/test_summary.txt"

{
  echo "# make evidence: frontend production build"
  echo "date: $(stamp)"
  echo "command: cd frontend && npm run build"
  echo
  (cd "$ROOT/frontend" && npm run build 2>&1) | grep -E "vite v|modules transformed|dist/|built in" | sed -E 's/\x1b\[[0-9;]*m//g'
  echo
  echo "gzip -9 sizes (budget: 200 KB gzip JS):"
  for f in "$ROOT"/frontend/dist/assets/*.js "$ROOT"/frontend/dist/assets/*.css; do
    printf "  %-40s %8d bytes raw  %7d bytes gzip\n" "${f#$ROOT/}" "$(wc -c < "$f")" "$(gzip -9c "$f" | wc -c)"
  done
} | tee "$ROOT/reports/build_size.txt"
