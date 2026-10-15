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

rem ---- Dev machine only: stage local credentials for browser pre-fill -----
rem If a keys file exists OUTSIDE the project at ..\_dev\keys.local.js (it is
rem never part of the submission), copy it into _local\ for this session.
rem The page reads it once on first load and remembers the platform address,
rem model names and key in the local browser, so nothing needs typing.
rem On any other machine this block does nothing and the launcher behaves
rem exactly like the clean submission version (configure in the page panel).
rem The copy is removed when the server stops; a copy left behind by a forced
rem window close is cleared on the next run.
set "STAGED=0"
if exist "%~dp0..\_dev\keys.local.js" (
  if not exist "%~dp0_local" mkdir "%~dp0_local"
  copy /y "%~dp0..\_dev\keys.local.js" "%~dp0_local\keys.local.js" >nul
  set "STAGED=1"
  echo   [i] Local dev credentials staged - the page will pre-fill its
  echo       platform address, models and key on first load.
) else (
  if exist "%~dp0_local" (
    rmdir /s /q "%~dp0_local"
    echo   [i] Removed a leftover credential copy from a previous session.
  )
)
echo.

echo   Starting local server ...
echo   (uses Python if available, otherwise the built-in
echo    PowerShell server - no installation required)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port 8765 -Root "%~dp0."

rem ---- server stopped: take the staged credentials back out --------------
if "%STAGED%"=="1" (
  if exist "%~dp0_local" (
    rmdir /s /q "%~dp0_local"
    echo   [i] Staged credentials removed.
  )
)

echo.
echo   Server stopped.
pause
