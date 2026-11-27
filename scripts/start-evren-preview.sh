#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVREN_ENV_FILE="${HOME}/.config/evren/env"
PREVIEW_ROOT="${ABYS_EVREN_PREVIEW_ROOT:-${TMPDIR:-/tmp}/abys-evren-preview}"

if [[ ! -f "$EVREN_ENV_FILE" ]]; then
  echo "EVREN yapılandırma dosyası bulunamadı: $EVREN_ENV_FILE" >&2
  exit 1
fi

# Anahtar yalnızca bu sunucu sürecine aktarılır; .env veya proje dosyasına yazılmaz.
set -a
# shellcheck disable=SC1090
source "$EVREN_ENV_FILE"
set +a

if [[ -z "${EVREN_API_KEY:-}" ]]; then
  echo "EVREN_API_KEY boş. ~/.config/evren/env dosyasını kontrol edin." >&2
  exit 1
fi

# Next.js aynı kaynak klasöründe ikinci dev sunucusuna izin vermez.
# 3101 için kaynak ağacının geçici kopyasını hazırla; node_modules paylaşılır,
# .next ayrı kalır ve DB ana projedeki izole .data/ai-preview klasörüdür.
mkdir -p "$PREVIEW_ROOT"
rsync -a --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='.data/' \
  --exclude='.env*' \
  --exclude='dist-desktop/' \
  --exclude='*.log' \
  "$ROOT/" "$PREVIEW_ROOT/"
ln -sfn "$ROOT/node_modules" "$PREVIEW_ROOT/node_modules"

cd "$PREVIEW_ROOT"
export AI_POLICY=EVREN_ONLY
export EVREN_BASE_URL="${EVREN_BASE_URL:-https://evren-llmapi.ssyz.org.tr/v1}"
export EVREN_MODEL="${EVREN_MODEL:-deepseek-v4.1-flash}"
export EVREN_MAX_TOKENS="${EVREN_MAX_TOKENS:-8192}"
export ABYS_DB_DIR="$ROOT/.data/ai-preview"
export AUTH_COOKIE_SECURE=false

echo "ABYS EVREN preview başlatılıyor: http://127.0.0.1:3101"
echo "Provider=EVREN_ONLY | Model=$EVREN_MODEL | DB=$ABYS_DB_DIR"
echo "Isolated source copy=$PREVIEW_ROOT"
exec ./node_modules/.bin/next dev --webpack -H 127.0.0.1 -p 3101
