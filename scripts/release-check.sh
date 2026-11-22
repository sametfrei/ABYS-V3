#!/usr/bin/env bash
# Teslim öncesi kanonik kapı: tip, lint, test, üretim derlemesi ve (BASE_URL
# verilirse) çalışan örneğe karşı smoke. Sır basmaz; yalnızca yerel araçları çağırır.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1/4 doğrulama (tsc + eslint) =="
npm run verify

echo "== 2/4 testler =="
npm test

echo "== 3/4 üretim derlemesi =="
npm run build

if [ -n "${BASE_URL:-}" ]; then
  echo "== 4/4 smoke: ${BASE_URL} =="
  BASE_URL="${BASE_URL}" npm run smoke:e2e
else
  echo "== 4/4 smoke atlandı (BASE_URL verilmedi) =="
fi

echo "== teslim kapısı tamam =="
