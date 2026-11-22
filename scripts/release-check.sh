#!/usr/bin/env bash
# Teslim öncesi kanonik kapı: tip, lint, test, üretim derlemesi ve (BASE_URL
# verilirse) çalışan örneğe karşı smoke. DEPLOY_EXPECT verilirse ayrıca sunucunun
# gerçekten beklenen commit'i çalıştırdığını doğrular. Sır basmaz.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "${DEPLOY_EXPECT:-}" ] && [ -z "${BASE_URL:-}" ]; then
  echo "HATA: DEPLOY_EXPECT verildi ama BASE_URL yok." >&2
  exit 3
fi

echo "== 1/5 doğrulama (tsc + eslint) =="
npm run verify

echo "== 2/5 testler =="
npm test

echo "== 3/5 üretim derlemesi =="
npm run build

if [ -n "${BASE_URL:-}" ]; then
  echo "== 4/5 smoke: ${BASE_URL} =="
  BASE_URL="${BASE_URL}" npm run smoke:e2e
else
  echo "== 4/5 smoke atlandı (BASE_URL verilmedi) =="
fi

if [ -n "${DEPLOY_EXPECT:-}" ]; then
  echo "== 5/5 sürüm parmak izi: ${BASE_URL} = ${DEPLOY_EXPECT} =="
  node scripts/verify-deploy.mjs --base="${BASE_URL}" --expect="${DEPLOY_EXPECT}"
else
  echo "== 5/5 sürüm parmak izi atlandı (DEPLOY_EXPECT verilmedi) =="
fi

echo "== teslim kapısı tamam =="
