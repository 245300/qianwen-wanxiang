@echo off
cd /d "%~dp0"
echo ==============================================
echo   QianWen WanXiang  -  Local Server
echo   URL   :  http://localhost:8765/
echo   Close this window to stop the server.
echo ==============================================
echo.

if not exist "%~dp0serve.ps1" (
  echo [x] serve.ps1 is missing next to this file.
  echo     Please keep serve.ps1 together with index.html.
  echo.
  pause
  exit /b 1
)

echo   Starting local server ...
echo   (uses Python if available, otherwise the built-in
echo    PowerShell server - no installation required)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port 8765 -Root "%~dp0."

echo.
echo   Server stopped.
pause