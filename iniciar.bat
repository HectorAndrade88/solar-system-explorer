@echo off
rem Inicia un servidor local y abre Solar System Explorer en el navegador.
rem Requiere Python 3 instalado. Cierre esta ventana para detener el servidor.
cd /d "%~dp0"
set PORT=8000
echo Solar System Explorer en http://localhost:%PORT%
start "" "http://localhost:%PORT%"
where python >nul 2>nul
if %errorlevel%==0 (
    python -m http.server %PORT% --bind 127.0.0.1
) else (
    py -3 -m http.server %PORT% --bind 127.0.0.1
)
pause
