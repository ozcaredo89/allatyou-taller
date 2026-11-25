#!/usr/bin/env bash
# Falla si el PR agrega alert()/confirm()/prompt() nativos en el frontend. Usar modales propios.
set -euo pipefail
BASE="${1:-origin/main}"
nuevos=$(git diff "$BASE"...HEAD -U0 -- 'frontend/src/**/*.ts' 'frontend/src/**/*.tsx' \
  | grep -E '^\+[^+]' | grep -E '(^|[^.[:alnum:]_])(window\.)?(alert|confirm|prompt)\(' || true)
if [ -n "$nuevos" ]; then
  echo "❌ El PR agrega diálogos nativos del navegador. Usa un modal de la app:"
  echo "$nuevos"
  exit 1
fi
echo "✅ Sin diálogos nativos nuevos."
