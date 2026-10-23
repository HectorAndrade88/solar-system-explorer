#!/usr/bin/env sh
# Inicia un servidor local y abre Solar System Explorer en el navegador.
# Requiere Python 3. Detener con Ctrl+C.
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8000}"
URL="http://localhost:${PORT}"
echo "Solar System Explorer en ${URL}"
(
    sleep 1
    if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
    elif command -v open >/dev/null 2>&1; then open "$URL"
    fi
) >/dev/null 2>&1 &
exec python3 -m http.server "$PORT" --bind 127.0.0.1
