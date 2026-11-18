#!/usr/bin/env bash
# ABYS-V3 kanonik agent doğrulaması.
# Her agent kod yazdıktan sonra bunu çalıştırır. `npm install`/`npm ci` çalıştırmaz;
# bağımlılıklar Lead tarafından bir kez kurulur.
#
# Kullanım:
#   bash scripts/agent-verify.sh [yollar...]
#
# Örnek:
#   bash scripts/agent-verify.sh src/lib/kpi.ts tests/kpi.test.ts
#
# Davranış:
#   1) npx tsc --noEmit                      (her zaman)
#   2) npx eslint <test olmayan yollar>      (yol verilmezse: npm run lint)
#   3) npx vitest run <tests/*.test.ts>      (test yolu verilmezse atlanır)
set -euo pipefail

cd "$(dirname "$0")/.."

LINT=()
TESTS=()
for p in "$@"; do
  case "$p" in
    tests/*.test.ts) TESTS+=("$p") ;;
    *) LINT+=("$p") ;;
  esac
done

echo "== npx tsc --noEmit =="
npx tsc --noEmit

if [ "${#LINT[@]}" -gt 0 ]; then
  echo "== npx eslint ${LINT[*]} =="
  npx eslint "${LINT[@]}"
else
  echo "== eslint (tam repo) =="
  npm run lint
fi

if [ "${#TESTS[@]}" -gt 0 ]; then
  echo "== npx vitest run ${TESTS[*]} =="
  npx vitest run "${TESTS[@]}"
else
  echo "== vitest atlandı: test dosyası verilmedi =="
fi

echo "== doğrulama tamam =="
